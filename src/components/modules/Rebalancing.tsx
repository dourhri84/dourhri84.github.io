import { useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { TokenRingSvg } from "../common/TokenRingSvg";
import { useCassLabStore } from "../../state/store";
import { simulateHotPartitionLoad } from "../../engine/hotPartitions";
import { Tooltip } from "../common/Tooltip";

export function RebalancingPage() {
  const cluster = useCassLabStore((s) => s.cluster);
  const addNodeToCluster = useCassLabStore((s) => s.addNodeToCluster);
  const removeNodeFromCluster = useCassLabStore((s) => s.removeNodeFromCluster);

  const [hotKey, setHotKey] = useState("celebrity_post_1");
  const [hotWrites, setHotWrites] = useState(50);
  const [spreadCount, setSpreadCount] = useState(20);
  const [loads, setLoads] = useState<ReturnType<typeof simulateHotPartitionLoad> | null>(null);

  if (!cluster) {
    return (
      <ModulePage
        title="Rebalancing"
        description="Build a cluster first."
        canvas={<p className="hint">No cluster built yet.</p>}
        panel={<p className="hint">Nothing to show.</p>}
      />
    );
  }

  const runHotPartitionDemo = () => {
    setLoads(simulateHotPartitionLoad(cluster, cluster.config.hashWidth, hotKey, hotWrites, spreadCount));
  };

  const maxLoad = loads ? Math.max(1, ...loads.map((l) => l.load)) : 1;

  return (
    <ModulePage
      title="Rebalancing & Hot Partitions"
      description="Add or remove a node and watch the ring's token ranges redistribute automatically. Below, compare a healthy key spread against a Hot Partition."
      canvas={
        <div>
          <div className="flex-row" style={{ marginBottom: 14 }}>
            {cluster.dataCenters.map((dc) => (
              <button key={dc.id} className="btn btn-primary" onClick={() => addNodeToCluster(dc.id)}>
                + Add node to {dc.name}
              </button>
            ))}
          </div>
          <TokenRingSvg cluster={cluster} size={360} />
          <div className="node-grid" style={{ marginTop: 14 }}>
            {cluster.nodes.map((n) => (
              <div key={n.id} className="node-card">
                <div className="node-card-name">{n.name}</div>
                <div className="node-card-meta">{n.dcId}</div>
                <button className="btn" onClick={() => removeNodeFromCluster(n.id)} disabled={cluster.nodes.length <= 2}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid var(--color-border)" }} />

          <h4>
            <Tooltip term="Hot Partition" />
          </h4>
          <div className="flex-row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Hot partition key</label>
              <input type="text" value={hotKey} onChange={(e) => setHotKey(e.target.value)} />
            </div>
            <div className="field" style={{ maxWidth: 140 }}>
              <label>Writes to hot key</label>
              <input type="number" value={hotWrites} onChange={(e) => setHotWrites(Number(e.target.value))} />
            </div>
            <div className="field" style={{ maxWidth: 160 }}>
              <label>Distinct comparison keys</label>
              <input type="number" value={spreadCount} onChange={(e) => setSpreadCount(Number(e.target.value))} />
            </div>
            <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={runHotPartitionDemo}>
              Simulate load
            </button>
          </div>

          {loads && (
            <div>
              {loads.map((l) => (
                <div key={l.nodeId} style={{ marginBottom: 8 }}>
                  <div className="flex-row" style={{ justifyContent: "space-between" }}>
                    <span>
                      {l.nodeName} {l.isHot && <span className="badge badge-danger">HOT</span>}
                    </span>
                    <span className="hint">{l.load} writes</span>
                  </div>
                  <div className="load-bar-track">
                    <div
                      className={`load-bar-fill ${l.isHot ? "hot" : ""}`}
                      style={{ width: `${(l.load / maxLoad) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      }
      panel={
        <div>
          <h4>Why rebalancing matters</h4>
          <p className="hint">
            Adding a node claims part of the ring from its neighbors; removing one gives its ranges back.
            {cluster.config.virtualNodesEnabled
              ? " With VNodes enabled, this movement is spread across many small, scattered ranges."
              : " Without VNodes, a single large contiguous range moves at once."}
          </p>
          <h4 style={{ marginTop: 16 }}>Avoiding hot partitions</h4>
          <p className="hint">
            A partition key that receives disproportionate traffic (e.g. one very popular record) overloads a
            single node, since all rows for that key always hash to the same token. Spreading writes across
            more distinct keys (e.g. via bucketing) fixes this.
          </p>
        </div>
      }
    />
  );
}
