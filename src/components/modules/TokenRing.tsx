import { ModulePage } from "../layout/ModulePage";
import { TokenRingSvg, colorForNode } from "../common/TokenRingSvg";
import { useCassLabStore } from "../../state/store";
import { tokenRanges } from "../../engine/ring";
import { useActiveRow } from "../../state/useActiveRow";

export function TokenRingPage() {
  const cluster = useCassLabStore((s) => s.cluster);
  const { hash } = useActiveRow();

  if (!cluster) {
    return (
      <ModulePage
        title="Token Ring"
        description="Build a cluster first."
        canvas={<p className="hint">No cluster built yet. Go to Cluster Configuration.</p>}
        panel={<p className="hint">Nothing to show.</p>}
      />
    );
  }

  const ranges = tokenRanges(cluster.nodes, cluster.config.hashWidth, cluster.config.virtualNodesEnabled);

  return (
    <ModulePage
      title="Interactive Token Ring"
      description={`The full token space [${cluster.config.hashWidth === 64 ? "-2^63, 2^63-1" : `-2^${cluster.config.hashWidth - 1}, 2^${cluster.config.hashWidth - 1}-1`}] is shown as a circle. Each colored arc represents a node's range of responsibility.${cluster.config.virtualNodesEnabled ? " With VNodes enabled, each node owns many small arcs instead of one big one." : ""}`}
      canvas={<TokenRingSvg cluster={cluster} size={460} highlightToken={hash?.token} />}
      panel={
        <div>
          <h4>Legend</h4>
          <ul className="param-list">
            {cluster.nodes.map((n) => (
              <li key={n.id}>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: colorForNode(n.id, cluster.nodes), marginRight: 6 }} />
                  {n.name}
                </span>
                <strong>{n.status}</strong>
              </li>
            ))}
          </ul>
          <h4 style={{ marginTop: 16 }}>Ranges ({ranges.length})</h4>
          <div className="scroll-y" style={{ maxHeight: 220 }}>
            <ul className="param-list">
              {ranges.map((r, i) => (
                <li key={i}>
                  <span className="mono" style={{ fontSize: 10 }}>
                    {r.start.toString()} … {r.end.toString()}
                  </span>
                  <strong>{cluster.nodes.find((n) => n.id === r.nodeId)?.name}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      }
    />
  );
}
