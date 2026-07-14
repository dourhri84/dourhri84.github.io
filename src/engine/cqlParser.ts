// Hand-written CQL parser for `CREATE TABLE` statements, per cahier des
// charges §II.4.2. Recognizes only the allowed keyword set (create table,
// text, int, real, float, date, datetime, uuid, timeuuid, time, boolean)
// and separately derives Partition Key, Clustering Key(s) and Primary Key —
// unlike a naive parser that treats "primary key" as a single flat concept.

import type { ColumnDefinition, CqlParseResult, CqlType, TableSchema } from "../domain/types";

const ALLOWED_TYPES: CqlType[] = [
  "text",
  "int",
  "real",
  "float",
  "date",
  "datetime",
  "uuid",
  "timeuuid",
  "time",
  "boolean",
];

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

/** Splits `body` on top-level commas, ignoring commas nested inside parens. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
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
    const partitionKey = inner
      .slice(1, closeIdx)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const rest = inner.slice(closeIdx + 1).replace(/^,/, "").trim();
    const clusteringKey = rest.length > 0 ? rest.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (partitionKey.length === 0) {
      return { error: "Composite partition key ( ) cannot be empty." };
    }
    return { partitionKey, clusteringKey };
  }

  const cols = inner.split(",").map((s) => s.trim()).filter(Boolean);
  if (cols.length === 0) {
    return { error: "PRIMARY KEY (...) cannot be empty." };
  }
  return { partitionKey: [cols[0]], clusteringKey: cols.slice(1) };
}

export function parseCreateTable(rawDdl: string): CqlParseResult {
  const ddl = rawDdl.trim();
  if (ddl.length === 0) {
    return { ok: false, error: { message: "The DDL is empty." } };
  }

  const parenError = checkBalancedParens(ddl);
  if (parenError) {
    return { ok: false, error: { message: parenError } };
  }

  const structureMatch = ddl.match(
    /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*)\)\s*;?\s*$/i,
  );
  if (!structureMatch) {
    return {
      ok: false,
      error: {
        message:
          "Expected syntax: CREATE TABLE <name> ( <column definitions>, PRIMARY KEY (...) );",
      },
    };
  }

  const tableName = structureMatch[1];
  const body = structureMatch[2];
  const parts = splitTopLevel(body);
  if (parts.length === 0) {
    return { ok: false, error: { message: "The table body is empty — no columns were defined." } };
  }

  const columns: ColumnDefinition[] = [];
  let partitionKey: string[] = [];
  let clusteringKey: string[] = [];
  let primaryKeyFound = false;

  for (const part of parts) {
    if (/^PRIMARY\s+KEY/i.test(part)) {
      if (primaryKeyFound) {
        return { ok: false, error: { message: "Multiple PRIMARY KEY clauses are not allowed." } };
      }
      const pk = parsePrimaryKeyClause(part);
      if ("error" in pk) {
        return { ok: false, error: { message: pk.error } };
      }
      partitionKey = pk.partitionKey;
      clusteringKey = pk.clusteringKey;
      primaryKeyFound = true;
      continue;
    }

    const colMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z]+)$/);
    if (!colMatch) {
      return {
        ok: false,
        error: { message: `Malformed column definition: "${part}". Expected "<name> <type>".` },
      };
    }
    const [, colName, rawType] = colMatch;
    const type = rawType.toLowerCase() as CqlType;
    if (!ALLOWED_TYPES.includes(type)) {
      return {
        ok: false,
        error: {
          message: `Unknown type '${rawType}' for column '${colName}'. Allowed types: ${ALLOWED_TYPES.join(", ")}.`,
        },
      };
    }
    if (columns.some((c) => c.name.toLowerCase() === colName.toLowerCase())) {
      return { ok: false, error: { message: `Duplicate column name '${colName}'.` } };
    }
    columns.push({ name: colName, type });
  }

  if (!primaryKeyFound) {
    return { ok: false, error: { message: "Missing PRIMARY KEY (...) clause — every table needs one." } };
  }

  const columnNames = new Set(columns.map((c) => c.name.toLowerCase()));
  for (const pkCol of [...partitionKey, ...clusteringKey]) {
    if (!columnNames.has(pkCol.toLowerCase())) {
      return {
        ok: false,
        error: { message: `PRIMARY KEY references unknown column '${pkCol}'.` },
      };
    }
  }

  const schema: TableSchema = {
    id: `table-${tableName.toLowerCase()}-${Date.now()}`,
    name: tableName,
    ddl,
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
