// Rebalancing engine, per cahier des charges §II Module 13.
// Adding a node follows Cassandra bootstrap semantics (existing nodes keep
// their tokens) and removing one follows decommission semantics; the report
// gives the share of the ring that is streamed, to drive the animation.

import type { Cluster, ClusterNode } from "../domain/types";
import { assignTokens, ringShareByNode } from "./ring";
import { tokenBounds } from "./hashing";

export interface RebalanceReport {
  cluster: Cluster;
  addedNodeId?: string;
  removedNodeId?: string;
  estimatedDataMovedPercent: number;
}

/**
 * Token assignment for a joining node, following Cassandra's bootstrap
 * semantics: existing nodes KEEP their tokens (only the ranges taken over by
 * the new node move). With VNodes the newcomer draws its own tokens; with a
 * single token per node it bisects the largest range currently on the ring
 * (the classic bootstrap-token choice).
 */
function tokensForNewNode(cluster: Cluster, newNode: ClusterNode): ClusterNode {
  const { hashWidth, virtualNodesEnabled, numVirtualNodes } = cluster.config;
  if (virtualNodesEnabled) {
    const [withTokens] = assignTokens([newNode], hashWidth, true, numVirtualNodes);
    return withTokens;
  }
  const { min, max } = tokenBounds(hashWidth);
  const ringSize = max - min + 1n;
  const tokens = cluster.nodes.map((n) => n.token).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (tokens.length === 0) {
    const [withTokens] = assignTokens([newNode], hashWidth, false, 1);
    return withTokens;
  }
  let bestStart = tokens[tokens.length - 1];
  let bestWidth = ((tokens[0] - bestStart) % ringSize + ringSize) % ringSize || ringSize;
  for (let i = 1; i < tokens.length; i++) {
    const w = tokens[i] - tokens[i - 1];
    if (w > bestWidth) {
      bestWidth = w;
      bestStart = tokens[i - 1];
    }
  }
  let t = bestStart + bestWidth / 2n;
  if (t > max) t -= ringSize;
  return { ...newNode, token: t, vnodeTokens: [t] };
}

function ownershipPercent(cluster: Cluster, nodeId: string): number {
  const share = ringShareByNode(cluster.nodes, cluster.config.hashWidth, cluster.config.virtualNodesEnabled);
  return share.find((s) => s.nodeId === nodeId)?.percent ?? 0;
}

let nodeCounter = 1000;

/**
 * Names are "Node N" — after a removal, cluster.nodes.length no longer
 * reflects the highest N ever used, so a naive `length + 1` can collide
 * with a still-existing node (e.g. nodes 1,2,4..9 after node 3 was
 * removed: length=8, so `length+1` = 9, which already exists). Always
 * pick one past the highest N seen so far, never reusing a freed number.
 */
function nextNodeNumber(nodes: ClusterNode[]): number {
  let max = 0;
  for (const node of nodes) {
    const match = node.name.match(/(\d+)\s*$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

export function addNode(cluster: Cluster, dcId: string): RebalanceReport {
  const dc = cluster.dataCenters.find((d) => d.id === dcId) ?? cluster.dataCenters[0];
  const rack = dc.racks[0];
  const id = `node-added-${nodeCounter++}`;
  const newNode: ClusterNode = {
    id,
    name: `Node ${nextNodeNumber(cluster.nodes)}`,
    dcId: dc.id,
    rackId: rack.id,
    ip: `172.18.0.${100 + cluster.nodes.length}`,
    status: "UP",
    token: 0n,
    vnodeTokens: [],
  };
  const cluster2: Cluster = { ...cluster, nodes: [...cluster.nodes, tokensForNewNode(cluster, newNode)] };
  // Data streamed to the newcomer = the share of the ring it now owns.
  const estimatedDataMovedPercent = Math.round(ownershipPercent(cluster2, id));
  return { cluster: cluster2, addedNodeId: id, estimatedDataMovedPercent };
}

export function removeNode(cluster: Cluster, nodeId: string): RebalanceReport {
  // Decommission: remaining nodes keep their tokens; the leaving node's
  // ranges are streamed to the nodes that inherit them.
  const estimatedDataMovedPercent = Math.round(ownershipPercent(cluster, nodeId));
  const cluster2: Cluster = { ...cluster, nodes: cluster.nodes.filter((n) => n.id !== nodeId) };
  return { cluster: cluster2, removedNodeId: nodeId, estimatedDataMovedPercent };
}
