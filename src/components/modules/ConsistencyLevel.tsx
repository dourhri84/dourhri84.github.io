import { ModulePage } from "../layout/ModulePage";
import { ActiveDataBar } from "../common/ActiveDataBar";
import { useActiveRow } from "../../state/useActiveRow";
import { placeReplicas } from "../../engine/replication";
import { evaluateConsistency, describeConsistencyLevel } from "../../engine/consistency";
import { useCassLabStore } from "../../state/store";
import type { ConsistencyLevel } from "../../domain/types";
import { Tooltip } from "../common/Tooltip";

const LEVELS: ConsistencyLevel[] = ["ONE", "QUORUM", "ALL", "LOCAL_QUORUM", "EACH_QUORUM"];

export function ConsistencyLevelPage() {
  const { key, hash, cluster } = useActiveRow();
  const setClusterConfig = useCassLabStore((s) => s.setClusterConfig);
  const level = cluster?.config.consistencyLevel ?? "ONE";
  const placement = key && hash && cluster ? placeReplicas(key, hash.token, cluster) : undefined;
  const evaluation = placement ? evaluateConsistency(placement, level) : undefined;
  const isSimple = cluster?.config.strategy === "SimpleStrategy";

  return (
    <ModulePage
      title="Consistency Level"
      description="Choose ONE, QUORUM or ALL and observe how many replica responses are required."
      canvas={
        <div>
          <ActiveDataBar />
          {!cluster ? (
            <p className="hint">Build a cluster first.</p>
          ) : (
            <div>
              <div className="flex-row" style={{ marginBottom: 16 }}>
                {LEVELS.filter((l) => !isSimple || (l !== "LOCAL_QUORUM" && l !== "EACH_QUORUM")).map((l) => (
                  <button
                    key={l}
                    className={`btn ${level === l ? "btn-primary" : ""}`}
                    onClick={() => setClusterConfig({ consistencyLevel: l })}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {!placement ? (
                <p className="hint">Select active data first (Insertion module).</p>
              ) : (
                evaluation && (
                  <div>
                    <div className="node-grid">
                      {placement.replicas.map((node, i) => (
                        <div key={node.id} className={`node-card ${node.status === "DOWN" ? "down" : ""}`}>
                          <div className="node-card-name">{node.name}</div>
                          <div className="node-card-meta">{node.dcId}</div>
                          <span className={`badge ${i < evaluation.requiredResponses ? "badge-info" : "badge-success"}`}>
                            {node.status === "UP" ? "UP" : "DOWN"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className={evaluation.satisfied ? "success-box" : "error-box"} style={{ marginTop: 16 }}>
                      {evaluation.satisfied ? "SUCCESS" : "FAILURE"} — {evaluation.availableReplicas} / {evaluation.totalReplicas} replicas
                      available, {evaluation.requiredResponses} required for {level}.
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      }
      panel={
        <div>
          <h4>
            <Tooltip term={level} />
          </h4>
          <p className="hint">{describeConsistencyLevel(level)}</p>
          {evaluation && (
            <ul className="param-list" style={{ marginTop: 10 }}>
              <li>
                <span>Total replicas</span>
                <strong>{evaluation.totalReplicas}</strong>
              </li>
              <li>
                <span>Required responses</span>
                <strong>{evaluation.requiredResponses}</strong>
              </li>
              {evaluation.perDc.length > 1 &&
                evaluation.perDc.map((d) => (
                  <li key={d.dcId}>
                    <span>{d.dcId} quorum</span>
                    <strong>
                      {d.available}/{d.total} (need {d.required})
                    </strong>
                  </li>
                ))}
            </ul>
          )}
        </div>
      }
    />
  );
}
