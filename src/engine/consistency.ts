// Consistency level engine, per cahier des charges §II.4.6.
// Implements ONE / QUORUM / ALL plus LOCAL_QUORUM / EACH_QUORUM as an
// authenticity enhancement for NetworkTopologyStrategy clusters.

import type { ClusterNode, ConsistencyLevel, ReplicaPlacement } from "../domain/types";

export interface ConsistencyEvaluation {
  level: ConsistencyLevel;
  totalReplicas: number;
  availableReplicas: number;
  requiredResponses: number;
  satisfied: boolean;
  perDc: { dcId: string; total: number; available: number; required: number; satisfied: boolean }[];
}

function quorumOf(n: number): number {
  return Math.floor(n / 2) + 1;
}

export function evaluateConsistency(
  placement: ReplicaPlacement,
  level: ConsistencyLevel,
  localDcId?: string,
): ConsistencyEvaluation {
  const replicas = placement.replicas;
  const available = replicas.filter((n) => n.status === "UP");
  const dcIds = Array.from(new Set(replicas.map((n) => n.dcId)));
  const perDc = dcIds.map((dcId) => {
    const total = replicas.filter((n) => n.dcId === dcId);
    const avail = available.filter((n) => n.dcId === dcId);
    const required = quorumOf(total.length);
    return { dcId, total: total.length, available: avail.length, required, satisfied: avail.length >= required };
  });

  let requiredResponses: number;
  let satisfied: boolean;

  switch (level) {
    case "ONE":
      requiredResponses = 1;
      satisfied = available.length >= 1;
      break;
    case "ALL":
      requiredResponses = replicas.length;
      satisfied = available.length >= replicas.length;
      break;
    case "QUORUM":
      requiredResponses = quorumOf(replicas.length);
      satisfied = available.length >= requiredResponses;
      break;
    case "LOCAL_QUORUM": {
      const dc = localDcId ?? dcIds[0];
      const local = perDc.find((d) => d.dcId === dc);
      requiredResponses = local?.required ?? quorumOf(replicas.length);
      satisfied = local?.satisfied ?? false;
      break;
    }
    case "EACH_QUORUM":
      requiredResponses = perDc.reduce((sum, d) => sum + d.required, 0);
      satisfied = perDc.every((d) => d.satisfied);
      break;
    default:
      requiredResponses = 1;
      satisfied = available.length >= 1;
  }

  return {
    level,
    totalReplicas: replicas.length,
    availableReplicas: available.length,
    requiredResponses,
    satisfied,
    perDc,
  };
}

export function describeConsistencyLevel(level: ConsistencyLevel): string {
  switch (level) {
    case "ONE":
      return "Only one replica must respond. Fastest, weakest consistency.";
    case "QUORUM":
      return "A strict majority of all replicas (across all datacenters) must respond.";
    case "ALL":
      return "Every replica must respond. Strongest consistency, least available.";
    case "LOCAL_QUORUM":
      return "A strict majority of replicas in the coordinator's local datacenter must respond.";
    case "EACH_QUORUM":
      return "A strict majority of replicas must respond in every datacenter.";
    default:
      return "";
  }
}

export function isNodeAReplica(node: ClusterNode, placement: ReplicaPlacement): boolean {
  return placement.replicas.some((r) => r.id === node.id);
}
