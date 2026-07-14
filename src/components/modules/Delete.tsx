import { useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { ActiveDataBar } from "../common/ActiveDataBar";
import { OperationFlowDiagram } from "../common/OperationFlowDiagram";
import { Stepper } from "../common/Stepper";
import { DELETE_PATH_STEPS } from "../../engine/operationPaths";
import { useActiveRow } from "../../state/useActiveRow";
import { placeReplicas } from "../../engine/replication";
import { useCassLabStore } from "../../state/store";
import { Tooltip } from "../common/Tooltip";

const GC_GRACE_SECONDS = 10 * 24 * 60 * 60;

export function DeletePage() {
  const [stepIndex, setStepIndex] = useState(0);
  const { key, hash, cluster, row } = useActiveRow();
  const deleteRow = useCassLabStore((s) => s.deleteRow);
  const purgeRow = useCassLabStore((s) => s.purgeRow);
  const placement = key && hash && cluster ? placeReplicas(key, hash.token, cluster) : undefined;
  const step = DELETE_PATH_STEPS[stepIndex];

  return (
    <ModulePage
      title="Tombstones &amp; Deletion"
      description="In Cassandra, a deletion does not immediately erase the data. It writes a Tombstone, a deletion marker that will be replicated like a normal write."
      canvas={
        <div>
          <ActiveDataBar />
          {!row ? (
            <p className="hint">Select active data first (Insertion module).</p>
          ) : row.tombstonedAt ? (
            <div className="error-box" style={{ marginBottom: 14 }}>
              This row is tombstoned (deleted at {new Date(row.tombstonedAt).toLocaleTimeString()}). It is kept for{" "}
              <Tooltip term="gc_grace_seconds" /> before compaction purges it permanently.
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-danger" onClick={() => purgeRow(row.id)}>
                  Simulate compaction now (fast-forward gc_grace_seconds)
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-danger" onClick={() => deleteRow(row.id)} style={{ marginBottom: 14 }}>
              Delete this row
            </button>
          )}

          <Stepper steps={DELETE_PATH_STEPS} activeIndex={stepIndex} onChange={setStepIndex} />
          <OperationFlowDiagram placement={placement} stepKey={step.key} kind="delete" />
        </div>
      }
      panel={
        <div>
          <h4>
            <Tooltip term="Tombstone" />
          </h4>
          <p className="hint">
            Default gc_grace_seconds in real Cassandra is {GC_GRACE_SECONDS.toLocaleString()} seconds (10 days),
            giving offline replicas time to receive the deletion via Hinted Handoff / Read Repair before
            compaction removes the tombstone for good.
          </p>
        </div>
      }
    />
  );
}
