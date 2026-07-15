// Token ring engine: assigns tokens to nodes and resolves which node owns a
// given token (clockwise walk), per cahier des charges §II.4.4.

import type { ClusterNode, HashWidth, TokenRange } from "../domain/types";
import { tokenBounds } from "./hashing";

/** Small deterministic PRNG (mulberry32) seeded from a string, so VNode
 * token assignment is reproducible across renders for the same cluster. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function randomTokenInRange(rand: () => number, min: bigint, max: bigint): bigint {
  const span = max - min;
  // Combine two 32-bit draws to get enough entropy across wide (64-bit) ranges.
  const hi = BigInt(Math.floor(rand() * 0xffffffff));
  const lo = BigInt(Math.floor(rand() * 0xffffffff));
  const raw = (hi << 32n) | lo;
  const spanPlusOne = span + 1n;
  return min + (spanPlusOne > 0n ? raw % spanPlusOne : 0n);
}

/**
 * Assigns a primary token (and, when enabled, extra VNode tokens) to each
 * node. Without VNodes, tokens are evenly spaced around the ring, matching
 * Cassandra's recommended layout for a single-token cluster. With VNodes,
 * each node claims `numVirtualNodes` pseudo-random tokens.
 */
export function assignTokens(
  nodes: ClusterNode[],
  width: HashWidth,
  virtualNodesEnabled: boolean,
  numVirtualNodes: number,
): ClusterNode[] {
  const { min, max } = tokenBounds(width);
  const span = max - min;
  const n = nodes.length;
  if (n === 0) return nodes;

  return nodes.map((node, i) => {
    // Offset to the midpoint of each slice rather than its start, so no
    // node's token lands exactly on `min` — that boundary case would split
    // its arc into two disjoint segments when rendered on a linear ring.
    const evenToken = min + (span * BigInt(2 * i + 1)) / BigInt(2 * n);
    if (!virtualNodesEnabled) {
      return { ...node, token: evenToken, vnodeTokens: [evenToken] };
    }
    const rand = seededRandom(node.id);
    const vnodeTokens = Array.from({ length: Math.max(1, numVirtualNodes) }, () =>
      randomTokenInRange(rand, min, max),
    ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return { ...node, token: evenToken, vnodeTokens };
  });
}

interface RingPoint {
  token: bigint;
  nodeId: string;
}

/**
 * Ring ownership is a topology property, independent of a node's current
 * UP/DOWN status — a temporarily failed node still nominally owns its token
 * ranges (that's exactly what makes those ranges unavailable). Availability
 * is evaluated separately, downstream, using ClusterNode.status.
 */
function ringPoints(nodes: ClusterNode[], virtualNodesEnabled: boolean): RingPoint[] {
  const pts: RingPoint[] = [];
  for (const node of nodes) {
    const tokens = virtualNodesEnabled && node.vnodeTokens.length > 0 ? node.vnodeTokens : [node.token];
    for (const t of tokens) pts.push({ token: t, nodeId: node.id });
  }
  return pts.sort((a, b) => (a.token < b.token ? -1 : a.token > b.token ? 1 : 0));
}

/** Clockwise lookup: the node owning the first ring point whose token is
 * greater than or equal to the given token (wrapping to the first point). */
export function tokenToNode(
  token: bigint,
  nodes: ClusterNode[],
  virtualNodesEnabled: boolean,
): ClusterNode | undefined {
  const pts = ringPoints(nodes, virtualNodesEnabled);
  if (pts.length === 0) return undefined;
  const found = pts.find((p) => p.token >= token) ?? pts[0];
  return nodes.find((n) => n.id === found.nodeId);
}

/** Ordered list of distinct node IDs walking clockwise from a token,
 * useful for replica placement (primary + next distinct nodes). */
export function clockwiseNodeOrder(
  token: bigint,
  nodes: ClusterNode[],
  virtualNodesEnabled: boolean,
): ClusterNode[] {
  const pts = ringPoints(nodes, virtualNodesEnabled);
  if (pts.length === 0) return [];
  const startIdx = pts.findIndex((p) => p.token >= token);
  const ordered = startIdx === -1 ? pts : [...pts.slice(startIdx), ...pts.slice(0, startIdx)];
  const seen = new Set<string>();
  const result: ClusterNode[] = [];
  for (const p of ordered) {
    if (seen.has(p.nodeId)) continue;
    seen.add(p.nodeId);
    const node = nodes.find((n) => n.id === p.nodeId);
    if (node) result.push(node);
  }
  return result;
}

/** Builds the arcs (token ranges) owned by each ring point, for rendering. */
export function tokenRanges(
  nodes: ClusterNode[],
  width: HashWidth,
  virtualNodesEnabled: boolean,
): TokenRange[] {
  const { min, max } = tokenBounds(width);
  const pts = ringPoints(nodes, virtualNodesEnabled);
  if (pts.length === 0) return [];
  const ranges: TokenRange[] = [];
  for (let i = 0; i < pts.length; i++) {
    const start = i === 0 ? min : pts[i - 1].token + 1n;
    const end = pts[i].token;
    ranges.push({ nodeId: pts[i].nodeId, start, end });
  }
  // Wrap-around range from the last point to max belongs to the first point's node.
  if (pts[pts.length - 1].token < max) {
    ranges.push({ nodeId: pts[0].nodeId, start: pts[pts.length - 1].token + 1n, end: max });
  }
  return ranges;
}

/** Each node's share of the total ring, as a percentage (sums to ~100). */
export function ringShareByNode(
  nodes: ClusterNode[],
  width: HashWidth,
  virtualNodesEnabled: boolean,
): { nodeId: string; percent: number }[] {
  const { min, max } = tokenBounds(width);
  const total = max - min + 1n;
  const ranges = tokenRanges(nodes, width, virtualNodesEnabled);
  const widthByNode = new Map<string, bigint>();
  for (const range of ranges) {
    const span = range.end - range.start + 1n;
    widthByNode.set(range.nodeId, (widthByNode.get(range.nodeId) ?? 0n) + span);
  }
  return nodes.map((node) => ({
    nodeId: node.id,
    percent: (Number(widthByNode.get(node.id) ?? 0n) / Number(total)) * 100,
  }));
}
