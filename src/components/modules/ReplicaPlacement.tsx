import { ModulePage } from "../layout/ModulePage";
import { ActiveDataBar } from "../common/ActiveDataBar";
import { TokenRingSvg } from "../common/TokenRingSvg";
import { useActiveRow } from "../../state/useActiveRow";
import { placeReplicas } from "../../engine/replication";
import { Tooltip } from "../common/Tooltip";

export function ReplicaPlacementPage() {
  const { key, hash, cluster } = useActiveRow();
  const placement = key && hash && cluster ? placeReplicas(key, hash.token, cluster) : undefined;

  return (
    <ModulePage
      title="Replica Placement"
      description="Shows which nodes hold a copy of the active data under the currently selected replication strategy."
      canvas={
        <div>
          <ActiveDataBar />
          {!cluster ? (
            <p className="hint">Build a cluster first.</p>
          ) : !placement ? (
            <p className="hint">Select active data first (Insertion module).</p>
          ) : (
            <div>
              <TokenRingSvg cluster={cluster} highlightToken={hash?.token} />
              <div className="node-grid" style={{ marginTop: 16 }}>
                {placement.replicas.map((node) => (
                  <div key={node.id} className={`node-card ${node.status === "DOWN" ? "down" : ""}`}>
                    <div className="node-card-name">{node.name}</div>
                    <div className="node-card-meta">
                      {node.dcId} / {node.rackId}
                    </div>
                    <span className={`badge ${node.id === placement.primary.id ? "badge-info" : "badge-success"}`}>
                      {node.id === placement.primary.id ? "PRIMARY REPLICA" : "REPLICA"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      }
      panel={
        <div>
          <h4>
            <Tooltip term={cluster?.config.strategy === "NetworkTopologyStrategy" ? "NetworkTopologyStrategy" : "SimpleStrategy"} />
          </h4>
          {cluster?.config.strategy === "NetworkTopologyStrategy" ? (
            <p className="hint">
              Replicas are chosen per-datacenter (RF={cluster.config.replicationFactor} each), spreading across
              racks before doubling up. Intra-DC links are local traffic; the link between DCs represents
              inter-DC (WAN) traffic.
            </p>
          ) : (
            <p className="hint">
              Replicas are chosen by walking the ring clockwise from the token, with no awareness of
              datacenters or racks.
            </p>
          )}
          {placement && cluster && cluster.dataCenters.length > 1 && (
            <ul className="param-list" style={{ marginTop: 10 }}>
              {cluster.dataCenters.map((dc) => (
                <li key={dc.id}>
                  <span>{dc.name}</span>
                  <strong>{placement.replicas.filter((r) => r.dcId === dc.id).length} replica(s)</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    />
  );
}
