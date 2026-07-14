import { useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { ActiveDataBar } from "../common/ActiveDataBar";
import { OperationFlowDiagram } from "../common/OperationFlowDiagram";
import { Stepper } from "../common/Stepper";
import { WRITE_PATH_STEPS } from "../../engine/operationPaths";
import { useActiveRow } from "../../state/useActiveRow";
import { placeReplicas } from "../../engine/replication";
import { evaluateConsistency, describeConsistencyLevel } from "../../engine/consistency";

export function WritePathPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const { key, hash, cluster } = useActiveRow();
  const placement = key && hash && cluster ? placeReplicas(key, hash.token, cluster) : undefined;
  const step = WRITE_PATH_STEPS[stepIndex];
  const evaluation = placement && cluster ? evaluateConsistency(placement, cluster.config.consistencyLevel) : undefined;

  return (
    <ModulePage
      title="Write Path"
      description="Coordinator → Commit Log → Memtable → Replica → Acknowledgement, per Cassandra's write path."
      canvas={
        <div>
          <ActiveDataBar />
          <Stepper steps={WRITE_PATH_STEPS} activeIndex={stepIndex} onChange={setStepIndex} />
          <OperationFlowDiagram placement={placement} stepKey={step.key} kind="write" />
        </div>
      }
      panel={
        <div>
          <h4>Consistency check</h4>
          {!evaluation ? (
            <p className="hint">Select active data with a built cluster.</p>
          ) : (
            <div>
              <p className="hint">{describeConsistencyLevel(evaluation.level)}</p>
              <ul className="param-list">
                <li>
                  <span>Level</span>
                  <strong>{evaluation.level}</strong>
                </li>
                <li>
                  <span>Required ACKs</span>
                  <strong>{evaluation.requiredResponses}</strong>
                </li>
                <li>
                  <span>Available replicas</span>
                  <strong>{evaluation.availableReplicas} / {evaluation.totalReplicas}</strong>
                </li>
              </ul>
              {stepIndex === WRITE_PATH_STEPS.length - 1 && (
                <div className={evaluation.satisfied ? "success-box" : "error-box"} style={{ marginTop: 10 }}>
                  {evaluation.satisfied ? "Write acknowledged — consistency satisfied." : "Write failed — not enough replicas available."}
                </div>
              )}
            </div>
          )}
        </div>
      }
    />
  );
}
