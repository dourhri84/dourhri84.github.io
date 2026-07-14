import { ModulePage } from "../layout/ModulePage";
import { ActiveDataBar } from "../common/ActiveDataBar";
import { useActiveRow } from "../../state/useActiveRow";
import { placeReplicas } from "../../engine/replication";
import { evaluateConsistency } from "../../engine/consistency";
import { useCassLabStore } from "../../state/store";
import { Tooltip } from "../common/Tooltip";

export function FailurePage() {
  const { key, hash, cluster } = useActiveRow();
  const setNodeStatusAction = useCassLabStore((s) => s.setNodeStatusAction);
  const setDcStatusAction = useCassLabStore((s) => s.setDcStatusAction);
  const resetFailures = useCassLabStore((s) => s.resetFailures);
  const placement = key && hash && cluster ? placeReplicas(key, hash.token, cluster) : undefined;
  const evaluation = placement && cluster ? evaluateConsistency(placement, cluster.config.consistencyLevel) : undefined;

  if (!cluster) {
    return (
      <ModulePage
        title="Failures & Quorum"
        description="Build a cluster first."
        canvas={<p className="hint">No cluster built yet.</p>}
        panel={<p className="hint">Nothing to show.</p>}
      />
    );
  }

  return (
    <ModulePage
      title="Failures &amp; Quorum"
      description={
        <>
          Click on a node to simulate a failure. Observe if the configured{" "}
          <Tooltip term={cluster.config.consistencyLevel} /> consistency can be maintained.
        </>
      }
      canvas={
        <div>
          <ActiveDataBar />
          <div className="flex-row" style={{ marginBottom: 16, justifyContent: "space-between" }}>
            <div className="param-list" style={{ display: "flex", flexDirection: "row", gap: 24 }}>
              <div>
                <span className="hint">RF</span>
                <div>
                  <strong>{cluster.config.replicationFactor}</strong>
                </div>
              </div>
              <div>
                <span className="hint">Consistency</span>
                <div>
                  <strong>{cluster.config.consistencyLevel}</strong>
                </div>
              </div>
              {evaluation && (
                <div>
                  <span className="hint">Status</span>
                  <div>
                    <span className={`badge ${evaluation.satisfied ? "badge-success" : "badge-danger"}`}>
                      {evaluation.availableReplicas} / {evaluation.totalReplicas} replicas available
                    </span>
                  </div>
                </div>
              )}
            </div>
            <button className="btn" onClick={resetFailures}>
              Reset
            </button>
          </div>

          {!placement ? (
            <p className="hint">Select active data first (Insertion module).</p>
          ) : (
            <div className="node-grid">
              {placement.replicas.map((node) => (
                <div key={node.id} className={`node-card ${node.status === "DOWN" ? "down" : ""}`}>
                  <div className="node-card-name">{node.name}</div>
                  <div className="node-card-meta">{node.ip}</div>
                  <span className={`badge ${node.id === placement.primary.id ? "badge-info" : "badge-success"}`}>
                    {node.id === placement.primary.id ? "PRIMARY REPLICA" : "REPLICA"}
                  </span>
                  <div style={{ marginTop: 8 }}>
                    <button
                      className="btn"
                      onClick={() => setNodeStatusAction(node.id, node.status === "UP" ? "DOWN" : "UP")}
                    >
                      {node.status === "UP" ? "Simulate Down" : "Bring Up"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {evaluation && (
            <div className={evaluation.satisfied ? "success-box" : "error-box"} style={{ marginTop: 16 }}>
              {evaluation.satisfied ? "SUCCESS — Request will pass" : "FAILURE — Request will be rejected"}
              <div className="hint" style={{ marginTop: 4 }}>
                {evaluation.satisfied
                  ? `Enough nodes available to satisfy ${evaluation.level} consistency. (${evaluation.availableReplicas} / ${evaluation.requiredResponses} needed)`
                  : `Not enough nodes available to satisfy ${evaluation.level} consistency. (${evaluation.availableReplicas} / ${evaluation.requiredResponses} needed)`}
              </div>
            </div>
          )}

          {cluster.dataCenters.length > 1 && (
            <div style={{ marginTop: 20 }}>
              <h4>Datacenter-level failure</h4>
              <div className="flex-row">
                {cluster.dataCenters.map((dc) => (
                  <button key={dc.id} className="btn" onClick={() => setDcStatusAction(dc.id, "DOWN")}>
                    Take {dc.name} DOWN
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      }
      panel={
        <div>
          <h4>How QUORUM is computed</h4>
          <p className="hint">
            required = floor(RF / 2) + 1. With RF={cluster.config.replicationFactor}, QUORUM needs{" "}
            {Math.floor(cluster.config.replicationFactor / 2) + 1} replicas to respond.
          </p>
        </div>
      }
    />
  );
}
