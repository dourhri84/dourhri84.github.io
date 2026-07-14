import { useEffect, useMemo, useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { useCassLabStore } from "../../state/store";
import { generateGossipTick, type GossipExchange } from "../../engine/gossip";
import type { Cluster } from "../../domain/types";
import { Tooltip } from "../common/Tooltip";

function layoutNodes(cluster: Cluster, width: number, height: number): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const dcs = cluster.dataCenters;
  const dcWidth = width / dcs.length;
  dcs.forEach((dc, dcIndex) => {
    const dcCx = dcWidth * dcIndex + dcWidth / 2;
    const dcCy = height / 2;
    const nodes = cluster.nodes.filter((n) => n.dcId === dc.id);
    const r = Math.min(dcWidth, height) / 2 - 50;
    nodes.forEach((node, i) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
      positions[node.id] = { x: dcCx + r * Math.cos(angle), y: dcCy + r * Math.sin(angle) };
    });
  });
  return positions;
}

export function GossipPage() {
  const cluster = useCassLabStore((s) => s.cluster);
  const [tick, setTick] = useState(0);
  const [exchanges, setExchanges] = useState<GossipExchange[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!cluster || !running) return;
    const interval = setInterval(() => {
      setExchanges(generateGossipTick(cluster.nodes));
      setTick((t) => t + 1);
    }, 1300);
    return () => clearInterval(interval);
  }, [cluster, running]);

  const width = 640;
  const height = 380;
  const positions = useMemo(() => (cluster ? layoutNodes(cluster, width, height) : {}), [cluster]);

  if (!cluster) {
    return (
      <ModulePage
        title="Gossip"
        description="Build a cluster first."
        canvas={<p className="hint">No cluster built yet.</p>}
        panel={<p className="hint">Nothing to show.</p>}
      />
    );
  }

  return (
    <ModulePage
      title="Global Architecture & Gossip"
      description={
        <>
          Every second, each UP node exchanges cluster state with 1-3 random peers via the{" "}
          <Tooltip term="Gossip Protocol">Gossip protocol</Tooltip> — there is no central coordinator.
        </>
      }
      canvas={
        <div>
          <div className="flex-row" style={{ marginBottom: 10 }}>
            <button className="btn" onClick={() => setRunning((r) => !r)}>
              {running ? "Pause" : "Resume"}
            </button>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
            {cluster.dataCenters.map((dc, i) => (
              <text key={dc.id} x={(width / cluster.dataCenters.length) * (i + 0.5)} y={20} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-text-muted)">
                {dc.name.toUpperCase()} {i === 0 ? "(LOCAL)" : ""}
              </text>
            ))}

            {exchanges.map((ex, i) => {
              const a = positions[ex.from];
              const b = positions[ex.to];
              if (!a || !b) return null;
              return (
                <g key={`${tick}-${i}`}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ex.crossDc ? "#8e44ad" : "#1a8f5c"} strokeWidth={1} opacity={0.5} />
                  <circle r={4} fill={ex.crossDc ? "#8e44ad" : "#1a8f5c"}>
                    <animateMotion dur="1.1s" repeatCount={1} path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} />
                  </circle>
                </g>
              );
            })}

            {cluster.nodes.map((node) => {
              const p = positions[node.id];
              if (!p) return null;
              return (
                <g key={node.id}>
                  <rect x={p.x - 34} y={p.y - 22} width={68} height={44} rx={8} fill="var(--color-surface)" stroke={node.status === "UP" ? "var(--color-border)" : "var(--color-danger)"} strokeWidth={2} />
                  <text x={p.x} y={p.y - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-text)">
                    {node.name}
                  </text>
                  <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)">
                    {node.ip}
                  </text>
                  <circle cx={p.x + 28} cy={p.y - 18} r={5} fill={node.status === "UP" ? "var(--color-success)" : "var(--color-danger)"} />
                </g>
              );
            })}
          </svg>
          <div className="flex-row">
            <span className="badge badge-success">● Local traffic (Gossip)</span>
            <span className="badge badge-info" style={{ background: "#f1e8fb", color: "#8e44ad" }}>
              ● Inter-DC traffic (WAN)
            </span>
          </div>
        </div>
      }
      panel={
        <div>
          <h4>Cluster Topology</h4>
          <p className="hint">
            Cassandra uses a masterless (peer-to-peer) architecture. All nodes are equal — there is no central
            node that can fail.
          </p>
          <ul className="param-list" style={{ marginTop: 10 }}>
            <li>
              <span>Strategy</span>
              <strong>{cluster.config.strategy}</strong>
            </li>
            <li>
              <span>Datacenters</span>
              <strong>{cluster.dataCenters.length}</strong>
            </li>
            <li>
              <span>Total nodes</span>
              <strong>{cluster.nodes.length}</strong>
            </li>
            <li>
              <span>Nodes UP</span>
              <strong>{cluster.nodes.filter((n) => n.status === "UP").length}</strong>
            </li>
          </ul>
        </div>
      }
    />
  );
}
