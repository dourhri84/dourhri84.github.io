import { useMemo, useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { TokenRingSvg } from "../common/TokenRingSvg";
import { useCassLabStore } from "../../state/store";
import { assignTokens, tokenRanges, ringShareByNode } from "../../engine/ring";
import { Tooltip } from "../common/Tooltip";

export function VirtualNodesPage() {
  const mode = useCassLabStore((s) => s.mode);
  const cluster = useCassLabStore((s) => s.cluster);
  const [numVNodes, setNumVNodes] = useState(cluster?.config.numVirtualNodes ?? 16);

  const classicCluster = useMemo(() => {
    if (!cluster) return undefined;
    const nodes = assignTokens(cluster.nodes, cluster.config.hashWidth, false, 0);
    return { ...cluster, nodes, config: { ...cluster.config, virtualNodesEnabled: false } };
  }, [cluster]);

  const vnodeCluster = useMemo(() => {
    if (!cluster) return undefined;
    const nodes = assignTokens(cluster.nodes, cluster.config.hashWidth, true, numVNodes);
    return { ...cluster, nodes, config: { ...cluster.config, virtualNodesEnabled: true, numVirtualNodes: numVNodes } };
  }, [cluster, numVNodes]);

  if (mode === "beginner") {
    return (
      <ModulePage
        title="Virtual Nodes"
        description="Virtual Nodes are an Advanced-mode concept."
        canvas={<p className="hint">Switch to Advanced mode (top-right) to explore Virtual Nodes.</p>}
        panel={<p className="hint">Not available in Beginner mode.</p>}
      />
    );
  }

  if (!cluster || !classicCluster || !vnodeCluster) {
    return (
      <ModulePage
        title="Virtual Nodes"
        description="Build a cluster first."
        canvas={<p className="hint">No cluster built yet. Go to Cluster Configuration.</p>}
        panel={<p className="hint">Nothing to show.</p>}
      />
    );
  }

  const classicRanges = tokenRanges(classicCluster.nodes, cluster.config.hashWidth, false);
  const vnodeRanges = tokenRanges(vnodeCluster.nodes, cluster.config.hashWidth, true);
  const classicShares = ringShareByNode(classicCluster.nodes, cluster.config.hashWidth, false);
  const vnodeShares = ringShareByNode(vnodeCluster.nodes, cluster.config.hashWidth, true);
  const totalVNodes = numVNodes * cluster.nodes.length;

  return (
    <ModulePage
      title="Virtual Nodes"
      description="Compare classic single-token assignment against Virtual Nodes, where each physical node owns many small, scattered token ranges instead of one large contiguous range."
      canvas={
        <div className="flex-row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h4>Classic (no VNodes)</h4>
            <TokenRingSvg cluster={classicCluster} size={300} showVNodes={false} />
            <p className="hint">
              {classicRanges.length} arc segment(s) across {new Set(classicRanges.map((r) => r.nodeId)).size} node(s)
              — each node owns one contiguous range (the first node's range wraps around the seam, appearing as
              two segments here).
            </p>
            <ul className="param-list">
              {classicShares.map((s) => (
                <li key={s.nodeId}>
                  <span>{classicCluster.nodes.find((n) => n.id === s.nodeId)?.name}</span>
                  <strong>{s.percent.toFixed(2)}%</strong>
                </li>
              ))}
            </ul>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h4>
              <Tooltip term="Virtual Node (VNode)">With VNodes</Tooltip>
            </h4>
            <TokenRingSvg cluster={vnodeCluster} size={300} showVNodes={true} />
            <p className="hint">
              {totalVNodes} Virtual Nodes total ({numVNodes} per node × {cluster.nodes.length} node(s)),
              rendered as {vnodeRanges.length} arc segments.
            </p>
            <ul className="param-list">
              {vnodeShares.map((s) => (
                <li key={s.nodeId}>
                  <span>{vnodeCluster.nodes.find((n) => n.id === s.nodeId)?.name}</span>
                  <strong>{s.percent.toFixed(2)}%</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      }
      panel={
        <div>
          <div className="field">
            <label>VNodes per node (comparison only)</label>
            <input type="number" min={2} max={256} value={numVNodes} onChange={(e) => setNumVNodes(Number(e.target.value))} />
            <span className="hint">This only affects the comparison above, not the built cluster.</span>
          </div>
          <h4>Why VNodes help</h4>
          <ul style={{ paddingLeft: 18, fontSize: 12, color: "var(--color-text-muted)" }}>
            <li>Adding/removing a node moves many small ranges instead of one large one, speeding up rebalancing.</li>
            <li>Load is spread more evenly, reducing the chance of a single node being overloaded.</li>
            <li>Heterogeneous hardware can be given more or fewer VNodes to balance capacity.</li>
          </ul>
        </div>
      }
    />
  );
}
