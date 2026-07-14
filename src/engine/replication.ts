// Replication engine: SimpleStrategy and NetworkTopologyStrategy replica
// placement, per cahier des charges §II.4.5.

import type { Cluster, ClusterNode, ReplicaPlacement } from "../domain/types";
import { clockwiseNodeOrder } from "./ring";

function simpleStrategyReplicas(
  token: bigint,
  nodes: ClusterNode[],
  vnodesEnabled: boolean,
  rf: number,
): ClusterNode[] {
  const order = clockwiseNodeOrder(token, nodes, vnodesEnabled);
  return order.slice(0, Math.min(rf, order.length));
}

/**
 * NetworkTopologyStrategy: replicas are chosen per-datacenter, walking
 * clockwise within that DC's nodes and preferring to spread across racks
 * before doubling up on one, mirroring real Cassandra's rack-awareness.
 */
function networkTopologyReplicas(
  token: bigint,
  cluster: Cluster,
  vnodesEnabled: boolean,
): ClusterNode[] {
  const order = clockwiseNodeOrder(token, cluster.nodes, vnodesEnabled);
  const result: ClusterNode[] = [];
  for (const dc of cluster.dataCenters) {
    const dcOrder = order.filter((n) => n.dcId === dc.id);
    const rf = Math.min(dc.replicationFactor, dcOrder.length);
    const chosen: ClusterNode[] = [];
    const usedRacks = new Set<string>();
    // First pass: one node per distinct rack, in clockwise order.
    for (const node of dcOrder) {
      if (chosen.length >= rf) break;
      if (!usedRacks.has(node.rackId)) {
        usedRacks.add(node.rackId);
        chosen.push(node);
      }
    }
    // Second pass: fill remaining slots regardless of rack.
    for (const node of dcOrder) {
      if (chosen.length >= rf) break;
      if (!chosen.includes(node)) chosen.push(node);
    }
    result.push(...chosen);
  }
  return result;
}

export function placeReplicas(
  key: string,
  token: bigint,
  cluster: Cluster,
): ReplicaPlacement | undefined {
  const vnodesEnabled = cluster.config.virtualNodesEnabled;
  const replicas =
    cluster.config.strategy === "SimpleStrategy"
      ? simpleStrategyReplicas(token, cluster.nodes, vnodesEnabled, cluster.config.replicationFactor)
      : networkTopologyReplicas(token, cluster, vnodesEnabled);
  if (replicas.length === 0) return undefined;
  return { key, token, primary: replicas[0], replicas };
}
