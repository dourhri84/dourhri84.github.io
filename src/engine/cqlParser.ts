// Hand-written parser for the CQL subset supported by CassLab.
//
// CassLab accepts exactly ONE `CREATE TABLE` statement per validation. The
// supported grammar (EBNF; keywords are case-insensitive) is:
//
//   statement     ::= CREATE TABLE [IF NOT EXISTS] [keyspace "."] table
//                     "(" element { "," element } ")" [";"]
//   element       ::= column_def | primary_key
//   column_def    ::= identifier cql_type [PRIMARY KEY]
//   primary_key   ::= PRIMARY KEY "(" partition_key { "," identifier } ")"
//   partition_key ::= identifier | "(" identifier { "," identifier } ")"
//   cql_type      ::= text | varchar | int | bigint | float | double | boolean
//                   | date | time | timestamp | uuid | timeuuid
//   identifier    ::= [A-Za-z_][A-Za-z0-9_]*          (unquoted)
//
// Comments (-- ..., // ..., /* ... */) are ignored. `varchar` is an alias of
// `text` (as in Cassandra). The legacy CassLab names `real` and `datetime`
// are still accepted and mapped to `double` and `timestamp`.
//
// Semantic checks: exactly one primary key (inline or clause), every key
// column declared, no duplicate column, no column repeated in the primary
// key, known types only.
//
// NOT supported (rejected with an explicit message): any other statement
// (CREATE KEYSPACE, ALTER, DROP, INSERT, SELECT, ...), several statements at
// once, table options (WITH CLUSTERING ORDER BY, compaction, ...), quoted
// identifiers, collection / frozen / tuple / user-defined types, counter,
// STATIC columns, and the types decimal, varint, smallint, tinyint, blob,
// inet, ascii, duration.

import type { ColumnDefinition, CqlParseResult, CqlType, TableSchema } from "../domain/types";

/** Canonical CQL types supported by CassLab, as displayed to the learner. */
const ALLOWED_TYPES: CqlType[] = [
  "text",
  "int",
  "bigint",
  "float",
  "double",
  "boolean",
  "date",
  "time",
  "timestamp",
  "uuid",
  "timeuuid",
];

/** Accepted spellings -> canonical type. */
const TYPE_ALIASES: Record<string, CqlType> = {
  ...Object.fromEntries(ALLOWED_TYPES.map((t) => [t, t])),
  varchar: "text",
  real: "double", // legacy CassLab name
  datetime: "timestamp", // legacy CassLab name
};

const UNSUPPORTED_TYPES = ["decimal", "varint", "smallint", "tinyint", "blob", "inet", "ascii", "duration", "counter"];

const IDENT = "[a-zA-Z_][a-zA-Z0-9_]*";

function fail(message: string): CqlParseResult {
  return { ok: false, error: { message } };
}

/** Removes CQL comments while keeping string literals untouched. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

function checkBalancedParens(ddl: string): string | undefined {
  let depth = 0;
  for (let i = 0; i < ddl.length; i++) {
    if (ddl[i] === "(") depth++;
    else if (ddl[i] === ")") {
      depth--;
      if (depth < 0) {
        return `Unmatched closing parenthesis ')' at position ${i}.`;
      }
    }
  }
  if (depth > 0) {
    return `Missing ${depth} closing parenthesis ')' — parentheses are not balanced.`;
  }
  return undefined;
}

/** Splits `body` on top-level commas, ignoring commas nested inside parens or <>. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(" || ch === "<") depth++;
    if (ch === ")" || ch === ">") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

function splitIdentifiers(list: string): string[] | { error: string } {
  const ids = list.split(",").map((s) => s.trim());
  for (const id of ids) {
    if (!new RegExp(`^${IDENT}$`).test(id)) {
      return { error: `Invalid column name '${id}' in PRIMARY KEY.` };
    }
  }
  return ids;
}

function parsePrimaryKeyClause(
  clause: string,
): { partitionKey: string[]; clusteringKey: string[] } | { error: string } {
  const match = clause.match(/^PRIMARY\s+KEY\s*\(([\s\S]*)\)$/i);
  if (!match) {
    return { error: `Malformed PRIMARY KEY clause: "${clause}". Expected PRIMARY KEY (...).` };
  }
  const inner = match[1].trim();
  if (inner.length === 0) {
    return { error: "PRIMARY KEY (...) cannot be empty." };
  }

  if (inner.startsWith("(")) {
    const closeIdx = inner.indexOf(")");
    if (closeIdx === -1) {
      return { error: "Unmatched '(' in composite partition key inside PRIMARY KEY." };
    }
    const pkList = inner.slice(1, closeIdx).trim();
    if (pkList.length === 0) {
      return { error: "Composite partition key ( ) cannot be empty." };
    }
    const partitionKey = splitIdentifiers(pkList);
    if ("error" in partitionKey) return partitionKey;
    const rest = inner.slice(closeIdx + 1).trim();
    if (rest.length > 0 && !rest.startsWith(",")) {
      return { error: "Expected ',' after the composite partition key in PRIMARY KEY." };
    }
    const restList = rest.replace(/^,/, "").trim();
    const clusteringKey = restList.length > 0 ? splitIdentifiers(restList) : [];
    if ("error" in clusteringKey) return clusteringKey;
    return { partitionKey, clusteringKey };
  }

  const cols = splitIdentifiers(inner);
  if ("error" in cols) return cols;
  return { partitionKey: [cols[0]], clusteringKey: cols.slice(1) };
}

export function parseCreateTable(rawDdl: string): CqlParseResult {
  const ddl = stripComments(rawDdl).trim();
  if (ddl.length === 0) {
    return fail("The DDL is empty.");
  }

  // Only one statement is accepted.
  const statements = ddl.split(";").map((s) => s.trim()).filter(Boolean);
  if (statements.length > 1) {
    return fail("Only one statement can be validated at a time (CassLab supports a single CREATE TABLE).");
  }
  const stmt = statements[0] ?? "";

  const keyword = stmt.match(/^([a-zA-Z]+)(?:\s+([a-zA-Z]+))?/);
  if (keyword && !/^CREATE$/i.test(keyword[1])) {
    return fail(
      `'${keyword[1].toUpperCase()}' statements are not supported. CassLab only analyses CREATE TABLE statements; data is entered through the Insertion module.`,
    );
  }
  if (keyword && keyword[2] && !/^TABLE$/i.test(keyword[2])) {
    return fail(`'CREATE ${keyword[2].toUpperCase()}' is not supported. CassLab only analyses CREATE TABLE statements.`);
  }

  if (/"/.test(stmt)) {
    return fail("Quoted identifiers (\"Name\") are not supported. Use unquoted names: letters, digits and '_'.");
  }

  const parenError = checkBalancedParens(stmt);
  if (parenError) {
    return fail(parenError);
  }

  if (/\)\s*WITH\b/i.test(stmt)) {
    return fail(
      "Table options (WITH CLUSTERING ORDER BY, compaction, ...) are not supported. Remove the WITH clause.",
    );
  }

  const structureMatch = stmt.match(
    new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:(${IDENT})\\.)?(${IDENT})\\s*\\(([\\s\\S]*)\\)\\s*$`, "i"),
  );
  if (!structureMatch) {
    return fail("Expected syntax: CREATE TABLE [keyspace.]<name> ( <column definitions>, PRIMARY KEY (...) );");
  }

  const tableName = structureMatch[2];
  const body = structureMatch[3];
  const parts = splitTopLevel(body);
  if (parts.length === 0) {
    return fail("The table body is empty — no columns were defined.");
  }

  const columns: ColumnDefinition[] = [];
  let partitionKey: string[] = [];
  let clusteringKey: string[] = [];
  let primaryKeyFound = false;

  for (const part of parts) {
    if (/^PRIMARY\s+KEY/i.test(part)) {
      if (primaryKeyFound) {
        return fail("A table can have only one PRIMARY KEY.");
      }
      const pk = parsePrimaryKeyClause(part);
      if ("error" in pk) {
        return fail(pk.error);
      }
      partitionKey = pk.partitionKey;
      clusteringKey = pk.clusteringKey;
      primaryKeyFound = true;
      continue;
    }

    if (/<|>/.test(part) || /^\S+\s+(list|set|map|frozen|tuple)\b/i.test(part)) {
      return fail(`Collection, tuple and frozen types are not supported (column definition "${part}").`);
    }
    if (/\bSTATIC\b/i.test(part)) {
      return fail(`STATIC columns are not supported (column definition "${part}").`);
    }

    const colMatch = part.match(new RegExp(`^(${IDENT})\\s+([a-zA-Z_][a-zA-Z0-9_]*)(\\s+PRIMARY\\s+KEY)?$`, "i"));
    if (!colMatch) {
      return fail(`Malformed column definition: "${part}". Expected "<name> <type>" or "<name> <type> PRIMARY KEY".`);
    }
    const [, colName, rawType, inlinePk] = colMatch;
    const lowerType = rawType.toLowerCase();
    if (UNSUPPORTED_TYPES.includes(lowerType)) {
      return fail(
        `The CQL type '${lowerType}' (column '${colName}') is valid in Cassandra but not supported by CassLab. Supported types: ${ALLOWED_TYPES.join(", ")}.`,
      );
    }
    const type = TYPE_ALIASES[lowerType];
    if (!type) {
      return fail(`Unknown type '${rawType}' for column '${colName}'. Supported types: ${ALLOWED_TYPES.join(", ")}.`);
    }
    if (columns.some((c) => c.name.toLowerCase() === colName.toLowerCase())) {
      return fail(`Duplicate column name '${colName}'.`);
    }
    columns.push({ name: colName, type });

    if (inlinePk) {
      if (primaryKeyFound) {
        return fail("A table can have only one PRIMARY KEY.");
      }
      partitionKey = [colName];
      clusteringKey = [];
      primaryKeyFound = true;
    }
  }

  if (!primaryKeyFound) {
    return fail("Missing PRIMARY KEY — every table needs one (PRIMARY KEY (...) clause or '<column> <type> PRIMARY KEY').");
  }

  const columnNames = new Set(columns.map((c) => c.name.toLowerCase()));
  const keyCols = [...partitionKey, ...clusteringKey];
  const seen = new Set<string>();
  for (const pkCol of keyCols) {
    const lc = pkCol.toLowerCase();
    if (!columnNames.has(lc)) {
      return fail(`PRIMARY KEY references unknown column '${pkCol}'.`);
    }
    if (seen.has(lc)) {
      return fail(`Column '${pkCol}' appears more than once in the PRIMARY KEY.`);
    }
    seen.add(lc);
  }

  // Use the declared spelling of each key column.
  const declared = (name: string) => columns.find((c) => c.name.toLowerCase() === name.toLowerCase())?.name ?? name;
  partitionKey = partitionKey.map(declared);
  clusteringKey = clusteringKey.map(declared);

  const schema: TableSchema = {
    id: `table-${tableName.toLowerCase()}-${Date.now()}`,
    name: tableName,
    ddl: rawDdl.trim(),
    columns,
    partitionKeyColumns: partitionKey,
    clusteringKeyColumns: clusteringKey,
    primaryKey: [...partitionKey, ...clusteringKey],
    createdAt: Date.now(),
  };

  return { ok: true, schema };
}

export { ALLOWED_TYPES };

export const BEGINNER_DEFAULT_DDL = `CREATE TABLE Student(
  scode text,
  fullName text,
  birthDate date,
  specialty text,
  level int,
  PRIMARY KEY (scode)
);`;

export const ADVANCED_DEFAULT_DDL = `CREATE TABLE Student(
  specialty text,
  scode text,
  fullName text,
  birthDate date,
  level int,
  PRIMARY KEY (specialty, scode)
);`;
