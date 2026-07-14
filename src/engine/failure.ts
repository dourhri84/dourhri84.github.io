// Failure simulation engine, per cahier des charges §II.4.7.
// Marks nodes/racks/datacenters DOWN or UP; the effect on availability and
// consistency is then read via engine/consistency.ts against the mutated
// cluster (status lives on each ClusterNode).

import type { Cluster, ClusterNode } from "../domain/types";

export function setNodeStatus(cluster: Cluster, nodeId: string, status: "UP" | "DOWN"): Cluster {
  return {
    ...cluster,
    nodes: cluster.nodes.map((n) => (n.id === nodeId ? { ...n, status } : n)),
  };
}

export function setRackStatus(cluster: Cluster, rackId: string, status: "UP" | "DOWN"): Cluster {
  return {
    ...cluster,
    nodes: cluster.nodes.map((n) => (n.rackId === rackId ? { ...n, status } : n)),
  };
}

export function setDcStatus(cluster: Cluster, dcId: string, status: "UP" | "DOWN"): Cluster {
  return {
    ...cluster,
    nodes: cluster.nodes.map((n) => (n.dcId === dcId ? { ...n, status } : n)),
  };
}

export function resetAllNodes(cluster: Cluster): Cluster {
  return { ...cluster, nodes: cluster.nodes.map((n) => ({ ...n, status: "UP" as const })) };
}

export function downNodes(cluster: Cluster): ClusterNode[] {
  return cluster.nodes.filter((n) => n.status === "DOWN");
}
