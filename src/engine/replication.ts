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
  // Cassandra inserts NTS replicas in the order they are met while walking
  // the ring clockwise across *all* datacenters, so the first (primary)
  // replica may belong to any DC. Restore that global clockwise order.
  const rank = new Map(order.map((n, i) => [n.id, i]));
  return result.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
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
  // Configured replication factors (per DC). Cassandra derives consistency
  // requirements from these, not from the number of replicas actually
  // placed (which is smaller when a DC has fewer nodes than its RF).
  const configuredRf: Record<string, number> =
    cluster.config.strategy === "SimpleStrategy"
      ? { [cluster.dataCenters[0]?.id ?? "dc1"]: cluster.config.replicationFactor }
      : Object.fromEntries(cluster.dataCenters.map((dc) => [dc.id, dc.replicationFactor]));
  return {
    key,
    token,
    primary: replicas[0],
    replicas,
    configuredRf,
    strategy: cluster.config.strategy,
  };
}
