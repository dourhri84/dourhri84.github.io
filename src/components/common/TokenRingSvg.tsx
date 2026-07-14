import { useMemo } from "react";
import type { Cluster } from "../../domain/types";
import { tokenBounds } from "../../engine/hashing";
import { tokenRanges } from "../../engine/ring";

const PALETTE = [
  "#3b6fd1",
  "#1a8f5c",
  "#b7791f",
  "#8e44ad",
  "#c0392b",
  "#16a085",
  "#d68910",
  "#2c3e50",
  "#e17055",
  "#0984e3",
  "#00b894",
  "#6c5ce7",
];

export function colorForNode(nodeId: string, nodes: { id: string }[]): string {
  const idx = nodes.findIndex((n) => n.id === nodeId);
  return PALETTE[idx % PALETTE.length];
}

function fraction(token: bigint, min: bigint, max: bigint): number {
  const span = max - min;
  if (span <= 0n) return 0;
  return Number(token - min) / Number(span);
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

interface TokenRingSvgProps {
  cluster: Cluster;
  size?: number;
  highlightToken?: bigint;
  highlightNodeId?: string;
  showVNodes?: boolean;
}

export function TokenRingSvg({ cluster, size = 380, highlightToken, highlightNodeId, showVNodes }: TokenRingSvgProps) {
  const width = cluster.config.hashWidth;
  const { min, max } = tokenBounds(width);
  const vnodesOn = showVNodes ?? cluster.config.virtualNodesEnabled;
  const ranges = useMemo(() => tokenRanges(cluster.nodes, width, vnodesOn), [cluster.nodes, width, vnodesOn]);

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 28;
  const rInner = rOuter - 34;
  const startAngle = -Math.PI / 2;

  const arcs = ranges.map((range, i) => {
    const a0 = startAngle + fraction(range.start, min, max) * Math.PI * 2;
    const a1 = startAngle + fraction(range.end, min, max) * Math.PI * 2 + 0.0001;
    const p0o = polar(cx, cy, rOuter, a0);
    const p1o = polar(cx, cy, rOuter, a1);
    const p0i = polar(cx, cy, rInner, a0);
    const p1i = polar(cx, cy, rInner, a1);
    const largeArc = a1 - a0 > Math.PI ? 1 : 0;
    const d = [
      `M ${p0o.x} ${p0o.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p1o.x} ${p1o.y}`,
      `L ${p1i.x} ${p1i.y}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p0i.x} ${p0i.y}`,
      "Z",
    ].join(" ");
    const isHighlighted = highlightNodeId === range.nodeId;
    return (
      <path
        key={`${range.nodeId}-${i}`}
        d={d}
        fill={colorForNode(range.nodeId, cluster.nodes)}
        opacity={highlightNodeId ? (isHighlighted ? 1 : 0.25) : 0.85}
        stroke="var(--color-surface)"
        strokeWidth={1}
      />
    );
  });

  const nodeLabels = cluster.nodes.map((node) => {
    const a = startAngle + fraction(node.token, min, max) * Math.PI * 2;
    const p = polar(cx, cy, rOuter + 16, a);
    return (
      <text
        key={node.id}
        x={p.x}
        y={p.y}
        fontSize={10}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={node.status === "DOWN" ? "var(--color-danger)" : "var(--color-text)"}
      >
        {node.name}
      </text>
    );
  });

  const marker = highlightToken !== undefined
    ? (() => {
        const a = startAngle + fraction(highlightToken, min, max) * Math.PI * 2;
        const p = polar(cx, cy, (rOuter + rInner) / 2, a);
        const pOuter = polar(cx, cy, rOuter + 10, a);
        return (
          <g>
            <line x1={pOuter.x} y1={pOuter.y} x2={p.x} y2={p.y} stroke="var(--color-danger)" strokeWidth={2} />
            <circle cx={p.x} cy={p.y} r={6} fill="var(--color-danger)" stroke="#fff" strokeWidth={2} />
          </g>
        );
      })()
    : null;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height={size} role="img" aria-label="Token ring">
      <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="var(--color-border)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={rInner} fill="none" stroke="var(--color-border)" strokeWidth={1} />
      {arcs}
      {nodeLabels}
      {marker}
    </svg>
  );
}
