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
      description="Write or edit a CREATE TABLE statement and validate it. CassLab parses the CQL itself (no real Cassandra involved) and separately identifies the Partition Key, Clustering Key(s), and Primary Key."
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
              <strong>Syntax error:</strong> {result.error?.message}
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
          <h4>Allowed keywords</h4>
          <p className="hint" style={{ marginBottom: 10 }}>
            CREATE TABLE, PRIMARY KEY, and column types:
          </p>
          <div className="flex-row">
            {ALLOWED_TYPES.map((t) => (
              <span key={t} className="badge badge-info">
                {t}
              </span>
            ))}
          </div>
          <h4 style={{ marginTop: 18 }}>Syntax reminder</h4>
          <pre className="mono ddl-hint">{`CREATE TABLE name (
  col1 type1,
  col2 type2,
  PRIMARY KEY (pk)
);

-- Composite primary key:
PRIMARY KEY ((pk1, pk2), ck1, ck2, ck3);
-- (pk1, pk2) -> partition keys:
--    * hashed together to determine the target node/partition
--    * used mainly for equality filtering (pk1=... AND pk2=...)
--
-- ck1, ck2, ck3 -> clustering keys:
--    * define row ordering inside a partition
--    * support sorting and range searches (<, >, <=, >=)`}</pre>
        </div>
      }
    />
  );
}
