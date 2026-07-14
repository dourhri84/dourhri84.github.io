import { useEffect, useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { ActiveDataBar } from "../common/ActiveDataBar";
import { OperationFlowDiagram } from "../common/OperationFlowDiagram";
import { Stepper } from "../common/Stepper";
import { UPDATE_PATH_STEPS } from "../../engine/operationPaths";
import { useActiveRow } from "../../state/useActiveRow";
import { placeReplicas } from "../../engine/replication";
import { useCassLabStore } from "../../state/store";
import type { RowValue } from "../../domain/types";

export function UpdatePage() {
  const [stepIndex, setStepIndex] = useState(0);
  const { key, hash, cluster, row, table } = useActiveRow();
  const updateRow = useCassLabStore((s) => s.updateRow);
  const placement = key && hash && cluster ? placeReplicas(key, hash.token, cluster) : undefined;
  const step = UPDATE_PATH_STEPS[stepIndex];

  const [draft, setDraft] = useState<Record<string, RowValue>>({});
  const [comparison, setComparison] = useState<{ old: Record<string, RowValue>; oldTs: number; newTs: number } | null>(null);

  useEffect(() => {
    if (row) setDraft(row.values);
    setComparison(null);
    setStepIndex(0);
  }, [row?.id]);

  const nonKeyColumns = table?.columns.filter((c) => !table.primaryKey.includes(c.name)) ?? [];

  const handleApply = () => {
    if (!row) return;
    setComparison({ old: row.values, oldTs: row.writeTimestamp, newTs: Date.now() });
    updateRow(row.id, draft);
    setStepIndex(0);
  };

  return (
    <ModulePage
      title="Update (Upsert)"
      description="An update in Cassandra is technically identical to an insertion (Upsert). The old data is overwritten by the new one via internal timestamps — there is no read-before-write."
      canvas={
        <div>
          <ActiveDataBar />
          {!row || !table ? (
            <p className="hint">Select active data first (Insertion module).</p>
          ) : (
            <div>
              <h4>New values</h4>
              {nonKeyColumns.map((col) => (
                <div className="field" key={col.name}>
                  <label>{col.name}</label>
                  <input
                    type="text"
                    value={String(draft[col.name] ?? "")}
                    onChange={(e) => setDraft((d) => ({ ...d, [col.name]: e.target.value }))}
                  />
                </div>
              ))}
              <button className="btn btn-primary" onClick={handleApply}>
                Apply Update
              </button>

              {comparison && (
                <table className="ddl-breakdown" style={{ marginTop: 16 }}>
                  <thead>
                    <tr>
                      <td>Column</td>
                      <td>Old value (ts {comparison.oldTs})</td>
                      <td>New value (ts {comparison.newTs})</td>
                    </tr>
                  </thead>
                  <tbody>
                    {nonKeyColumns.map((col) => (
                      <tr key={col.name}>
                        <td>{col.name}</td>
                        <td>{String(comparison.old[col.name])}</td>
                        <td>
                          <strong>{String(draft[col.name])}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{ marginTop: 16 }}>
                <Stepper steps={UPDATE_PATH_STEPS} activeIndex={stepIndex} onChange={setStepIndex} />
                <OperationFlowDiagram placement={placement} stepKey={step.key} kind="update" />
              </div>
            </div>
          )}
        </div>
      }
      panel={
        <div>
          <h4>Last-Write-Wins</h4>
          <p className="hint">
            Every write carries a timestamp. When replicas disagree on a value, the write with the highest
            timestamp wins — regardless of the order writes physically arrive at a replica.
          </p>
        </div>
      }
    />
  );
}
