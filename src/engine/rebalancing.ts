// Rebalancing engine, per cahier des charges §II Module 13.
// Adding/removing a node recomputes the ring's token assignment and reports
// an estimate of how much data moved, to drive the redistribution animation.

import type { Cluster, ClusterNode } from "../domain/types";
import { assignTokens } from "./ring";

export interface RebalanceReport {
  cluster: Cluster;
  addedNodeId?: string;
  removedNodeId?: string;
  estimatedDataMovedPercent: number;
}

function reassign(cluster: Cluster, nodes: ClusterNode[]): Cluster {
  const tokenized = assignTokens(
    nodes,
    cluster.config.hashWidth,
    cluster.config.virtualNodesEnabled,
    cluster.config.numVirtualNodes,
  );
  return { ...cluster, nodes: tokenized };
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
  const nodes = [...cluster.nodes, newNode];
  const cluster2 = reassign(cluster, nodes);
  const estimatedDataMovedPercent = Math.round((1 / nodes.length) * 100);
  return { cluster: cluster2, addedNodeId: id, estimatedDataMovedPercent };
}

export function removeNode(cluster: Cluster, nodeId: string): RebalanceReport {
  const nodes = cluster.nodes.filter((n) => n.id !== nodeId);
  const cluster2 = reassign(cluster, nodes);
  const estimatedDataMovedPercent = Math.round((1 / Math.max(1, cluster.nodes.length)) * 100);
  return { cluster: cluster2, removedNodeId: nodeId, estimatedDataMovedPercent };
}
