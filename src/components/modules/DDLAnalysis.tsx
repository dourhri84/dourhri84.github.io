import { useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { useCassLabStore } from "../../state/store";
import { parseCreateTable, ALLOWED_TYPES, BEGINNER_DEFAULT_DDL, ADVANCED_DEFAULT_DDL } from "../../engine/cqlParser";
import type { CqlParseResult } from "../../domain/types";
import { Tooltip } from "../common/Tooltip";

export function DDLAnalysisPage() {
  const mode = useCassLabStore((s) => s.mode);
  const addTable = useCassLabStore((s) => s.addTable);
  const [ddl, setDdl] = useState(mode === "beginner" ? BEGINNER_DEFAULT_DDL : ADVANCED_DEFAULT_DDL);
  const [result, setResult] = useState<CqlParseResult | null>(null);

  const handleValidate = () => {
    const parsed = parseCreateTable(ddl);
    setResult(parsed);
    if (parsed.ok && parsed.schema) {
      addTable(parsed.schema);
    }
  };

  return (
    <ModulePage
      title="DDL Analysis"
      description="Write or edit a CREATE TABLE statement and validate it. CassLab parses a documented subset of CQL itself (no real Cassandra involved) and separately identifies the Partition Key, Clustering Key(s), and Primary Key."
      canvas={
        <div>
          <div className="field">
            <label>CQL — CREATE TABLE statement</label>
            <textarea rows={12} value={ddl} onChange={(e) => setDdl(e.target.value)} spellCheck={false} />
          </div>
          <div className="flex-row">
            <button className="btn btn-primary" onClick={handleValidate}>
              Create Table
            </button>
            <button
              className="btn"
              onClick={() => setDdl(mode === "beginner" ? BEGINNER_DEFAULT_DDL : ADVANCED_DEFAULT_DDL)}
            >
              Reset to default DDL
            </button>
          </div>

          {result && !result.ok && (
            <div className="error-box" style={{ marginTop: 16 }}>
              <strong>Rejected:</strong> {result.error?.message}
            </div>
          )}

          {result && result.ok && result.schema && (
            <div className="success-box" style={{ marginTop: 16 }}>
              <strong>Table '{result.schema.name}' is valid.</strong>
              <table className="ddl-breakdown">
                <tbody>
                  <tr>
                    <td>Columns</td>
                    <td>{result.schema.columns.map((c) => `${c.name} (${c.type})`).join(", ")}</td>
                  </tr>
                  <tr>
                    <td>
                      <Tooltip term="Partition Key" />
                    </td>
                    <td>{result.schema.partitionKeyColumns.join(", ")}</td>
                  </tr>
                  <tr>
                    <td>
                      <Tooltip term="Clustering Key" />
                    </td>
                    <td>{result.schema.clusteringKeyColumns.join(", ") || "—"}</td>
                  </tr>
                  <tr>
                    <td>
                      <Tooltip term="Primary Key" />
                    </td>
                    <td>{result.schema.primaryKey.join(", ")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      }
      panel={
        <div>
          <h4>Supported CQL subset</h4>
          <p className="hint" style={{ marginBottom: 8 }}>
            CassLab analyses one <code>CREATE TABLE</code> statement at a time. It does not connect to Cassandra:
            the statement is parsed in the browser to extract the partition key, the clustering columns and the
            primary key.
          </p>
          <pre className="mono ddl-hint">{`CREATE TABLE [IF NOT EXISTS]
  [ks.]name (
  col type [PRIMARY KEY],
  ...,
  PRIMARY KEY (key_spec)
);

key_spec:
  pk               -- simple
  pk, ck1, ck2     -- + clustering
  (pk1, pk2), ck1  -- composite`}</pre>
          <h4 style={{ marginTop: 14 }}>Supported types</h4>
          <div className="flex-row">
            {ALLOWED_TYPES.map((t) => (
              <span key={t} className="badge badge-info">
                {t}
              </span>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            <code>varchar</code> is accepted as an alias of <code>text</code>. Keywords are case-insensitive, and
            comments (<code>--</code>, <code>//</code>, <code>/* */</code>) are ignored.
          </p>
          <h4 style={{ marginTop: 14 }}>Checks performed</h4>
          <ul className="hint" style={{ paddingLeft: 18, margin: 0 }}>
            <li>balanced parentheses and statement structure;</li>
            <li>known column types, no duplicate column;</li>
            <li>exactly one primary key (inline or clause);</li>
            <li>every key column declared, none repeated.</li>
          </ul>
          <h4 style={{ marginTop: 14 }}>Not supported</h4>
          <ul className="hint" style={{ paddingLeft: 18, margin: 0 }}>
            <li>other statements (CREATE KEYSPACE, ALTER, DROP, INSERT, SELECT…) — rows are entered in the Insertion module;</li>
            <li>table options (<code>WITH CLUSTERING ORDER BY</code>, compaction…);</li>
            <li>collections, tuples, frozen and user-defined types, counter, STATIC columns;</li>
            <li>types decimal, varint, smallint, tinyint, blob, inet, ascii, duration;</li>
            <li>quoted identifiers and several statements at once.</li>
          </ul>
          <p className="hint" style={{ marginTop: 8 }}>
            Unsupported constructs are rejected with an explicit message.
          </p>
          <h4 style={{ marginTop: 14 }}>Key roles</h4>
          <pre className="mono ddl-hint">{`PRIMARY KEY ((pk1, pk2), ck1, ck2)
-- (pk1, pk2): partition key, serialized and
--   hashed together -> token -> replicas
-- ck1, ck2: clustering columns, order the
--   rows inside a partition`}</pre>
        </div>
      }
    />
  );
}
