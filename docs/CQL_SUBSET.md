# CQL subset supported by CassLab

CassLab does not connect to Apache Cassandra. Its **DDL Analysis** module parses CQL statements in the browser. The goal is to extract a table's structure: its columns, the partition key, the clustering columns and the primary key. Every other module then uses this structure.

Only the subset of CQL described below is supported. Every statement outside this subset is rejected with an explicit error message. The parser is in `src/engine/cqlParser.ts`, and its behaviour is covered by tests T9 and T9b in `tests/engine.validation.test.cjs`.

## Grammar

CassLab validates exactly **one** `CREATE TABLE` statement at a time. In the grammar below (EBNF), keywords are case-insensitive:

```
statement     ::= CREATE TABLE [IF NOT EXISTS] [keyspace "."] table
                  "(" element { "," element } ")" [";"]
element       ::= column_def | primary_key
column_def    ::= identifier cql_type [PRIMARY KEY]
primary_key   ::= PRIMARY KEY "(" partition_key { "," identifier } ")"
partition_key ::= identifier | "(" identifier { "," identifier } ")"
cql_type      ::= text | varchar | int | bigint | float | double | boolean
                | date | time | timestamp | uuid | timeuuid
identifier    ::= [A-Za-z_][A-Za-z0-9_]*        (unquoted)
```

A few spellings are accepted as alternatives:

* Comments (`-- …`, `// …`, `/* … */`) are ignored.
* `varchar` is an alias of `text`, as in Cassandra.
* `real` and `datetime`, the type names used by earlier versions of CassLab, are still accepted. They are mapped to `double` and `timestamp`.

Examples:

```sql
CREATE TABLE users (id int PRIMARY KEY, name text);
CREATE TABLE Student (specialty text, scode text, level int, PRIMARY KEY (specialty, scode));
CREATE TABLE readings (sensor text, day date, ts timestamp, value double,
                       PRIMARY KEY ((sensor, day), ts));
```

## Interpretation of the primary key

| Declaration | Partition key | Clustering columns |
|---|---|---|
| `col type PRIMARY KEY` | `col` | none |
| `PRIMARY KEY (a)` | `a` | none |
| `PRIMARY KEY (a, b, c)` | `a` | `b`, `c` |
| `PRIMARY KEY ((a, b), c)` | `a`, `b` (composite) | `c` |

Each partition key is turned into a token as follows:

1. The partition key is serialised with the CQL native-protocol encoding of its type. A composite partition key uses the `CompositeType` encoding.
2. The serialised bytes are hashed with Cassandra's `Murmur3Partitioner`.

This is the same token that Cassandra itself computes.

## Semantic checks

* Parentheses are balanced and the statement has the expected structure.
* Every column type is a supported type, and no column name is used twice.
* There is exactly one primary key, declared either inline or as a `PRIMARY KEY (…)` clause.
* Every key column is declared in the table, and no key column is repeated.

## Not supported

Each item below is rejected with a dedicated message:

* Statements other than `CREATE TABLE`: `CREATE KEYSPACE`, `ALTER`, `DROP`, `INSERT`, `SELECT`, `UPDATE`, `DELETE`… Rows are entered through the Insertion module, and reads, updates and deletes are simulated by their own modules.
* Several statements in a single validation.
* Table options: `WITH CLUSTERING ORDER BY`, `compaction`, `default_time_to_live`…
* Quoted identifiers (`"Name"`).
* Collection types (`list`, `set`, `map`), plus `tuple`, `frozen` and user-defined types.
* `counter` columns and `STATIC` columns.
* The types `decimal`, `varint`, `smallint`, `tinyint`, `blob`, `inet`, `ascii` and `duration`.

There are two further differences from Cassandra:

* Identifiers are compared case-insensitively, but they keep the spelling the user typed. Cassandra converts unquoted identifiers to lower case.
* Column constraints, indexes and materialised views are outside the scope of the tool.
