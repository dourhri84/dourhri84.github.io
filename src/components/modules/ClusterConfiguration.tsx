import { ModulePage } from "../layout/ModulePage";
import { useCassLabStore } from "../../state/store";
import { Tooltip } from "../common/Tooltip";
import type { ConsistencyLevel, HashWidth, ReplicationStrategy } from "../../domain/types";

export function ClusterConfigurationPage() {
  const mode = useCassLabStore((s) => s.mode);
  const config = useCassLabStore((s) => s.clusterConfig);
  const setConfig = useCassLabStore((s) => s.setClusterConfig);
  const cluster = useCassLabStore((s) => s.cluster);
  const buildClusterNow = useCassLabStore((s) => s.buildClusterNow);

  const isBeginner = mode === "beginner";
  const isSimple = config.strategy === "SimpleStrategy";

  return (
    <ModulePage
      title="Cluster Configuration"
      description="Choose a replication strategy, replication factor, consistency level, and cluster topology, then build the cluster. This configures the simulated domain model used by every other module."
      canvas={
        <div className="cluster-config-form">
          <div className="field">
            <label>
              <Tooltip term="SimpleStrategy">Replication Strategy</Tooltip>
            </label>
            <select
              value={config.strategy}
              disabled={isBeginner}
              onChange={(e) => setConfig({ strategy: e.target.value as ReplicationStrategy })}
            >
              <option value="SimpleStrategy">SimpleStrategy</option>
              <option value="NetworkTopologyStrategy">NetworkTopologyStrategy</option>
            </select>
            {isBeginner && <span className="hint">Beginner mode uses SimpleStrategy only.</span>}
          </div>

          <div className="field">
            <label>
              <Tooltip term="Replication Factor (RF)">Replication Factor</Tooltip>
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={config.replicationFactor}
              onChange={(e) => setConfig({ replicationFactor: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label>Consistency Level</label>
            <select
              value={config.consistencyLevel}
              onChange={(e) => setConfig({ consistencyLevel: e.target.value as ConsistencyLevel })}
            >
              <option value="ONE">ONE</option>
              <option value="QUORUM">QUORUM</option>
              <option value="ALL">ALL</option>
              {!isSimple && <option value="LOCAL_QUORUM">LOCAL_QUORUM</option>}
              {!isSimple && <option value="EACH_QUORUM">EACH_QUORUM</option>}
            </select>
          </div>

          <div className="field">
            <label>Number of Data Centers</label>
            <input
              type="number"
              min={1}
              max={5}
              value={isSimple ? 1 : config.numDataCenters}
              disabled={isSimple}
              onChange={(e) => setConfig({ numDataCenters: Number(e.target.value) })}
            />
            {isSimple && <span className="hint">SimpleStrategy supports a single Data Center only.</span>}
          </div>

          {!isBeginner && !isSimple && (
            <div className="field">
              <label>
                <Tooltip term="Rack">Racks per Data Center</Tooltip>
              </label>
              <input
                type="number"
                min={1}
                max={4}
                value={config.racksPerDataCenter}
                onChange={(e) => setConfig({ racksPerDataCenter: Number(e.target.value) })}
              />
            </div>
          )}

          <div className="field">
            <label>Nodes per Data Center</label>
            <input
              type="number"
              min={1}
              max={8}
              value={config.nodesPerDataCenter}
              onChange={(e) => setConfig({ nodesPerDataCenter: Number(e.target.value) })}
            />
          </div>

          <div className="field field-checkbox">
            <label>
              <input
                type="checkbox"
                checked={config.virtualNodesEnabled}
                disabled={isBeginner}
                onChange={(e) => setConfig({ virtualNodesEnabled: e.target.checked })}
              />{" "}
              <Tooltip term="Virtual Node (VNode)">Enable Virtual Nodes</Tooltip>
            </label>
            {isBeginner && <span className="hint">Not available in Beginner mode.</span>}
          </div>

          {config.virtualNodesEnabled && (
            <div className="field">
              <label>Number of Virtual Nodes</label>
              <input
                type="number"
                min={2}
                max={256}
                value={config.numVirtualNodes}
                onChange={(e) => setConfig({ numVirtualNodes: Number(e.target.value) })}
              />
            </div>
          )}

          {!isBeginner && (
            <div className="field">
              <label>
                <Tooltip term="Token">Hash Width</Tooltip>
              </label>
              <select value={config.hashWidth} onChange={(e) => setConfig({ hashWidth: Number(e.target.value) as HashWidth })}>
                <option value={16}>16 bits</option>
                <option value={32}>32 bits</option>
                <option value={64}>64 bits (real Murmur3)</option>
              </select>
            </div>
          )}
          {isBeginner && <p className="hint" style={{ marginBottom: 14 }}>Beginner mode uses a simplified 16-bit hash.</p>}

          <button className="btn btn-primary" onClick={buildClusterNow}>
            Build Cluster
          </button>
        </div>
      }
      panel={
        <div>
          <h4>Current Parameters</h4>
          {!cluster ? (
            <p className="hint">No cluster built yet.</p>
          ) : (
            <ul className="param-list">
              <li>
                <span>Strategy</span>
                <strong>{cluster.config.strategy}</strong>
              </li>
              <li>
                <span>Replication Factor</span>
                <strong>{cluster.config.replicationFactor}</strong>
              </li>
              <li>
                <span>Consistency</span>
                <strong>{cluster.config.consistencyLevel}</strong>
              </li>
              <li>
                <span>Data Centers</span>
                <strong>{cluster.dataCenters.length}</strong>
              </li>
              <li>
                <span>Nodes</span>
                <strong>{cluster.nodes.length}</strong>
              </li>
              {cluster.config.virtualNodesEnabled ? (
                <>
                  <li>
                    <span>Virtual Nodes (per node)</span>
                    <strong>{cluster.config.numVirtualNodes}</strong>
                  </li>
                  <li>
                    <span>Total Virtual Nodes</span>
                    <strong>{cluster.config.numVirtualNodes * cluster.nodes.length}</strong>
                  </li>
                </>
              ) : (
                <li>
                  <span>Virtual Nodes</span>
                  <strong>off</strong>
                </li>
              )}
              <li>
                <span>Hash Width</span>
                <strong>{cluster.config.hashWidth}-bit</strong>
              </li>
              <li className="param-list-section">Nodes</li>
              {cluster.nodes.map((n) => (
                <li key={n.id}>
                  <span>{n.name}</span>
                  <strong>
                    {n.dcId} / {n.rackId}
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
