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

/**
 * Mirrors Cassandra's ConsistencyLevel.blockFor() and
 * ReplicaPlans.assureSufficientLiveReplicas(): the number of required
 * responses is derived from the *configured* replication factor(s), and the
 * request is rejected up front (UnavailableException) when fewer live
 * replicas than required are known to the coordinator.
 */
export function evaluateConsistency(
  placement: ReplicaPlacement,
  level: ConsistencyLevel,
  localDcId?: string,
): ConsistencyEvaluation {
  const replicas = placement.replicas;
  const available = replicas.filter((n) => n.status === "UP");
  const placedDcIds = Array.from(new Set(replicas.map((n) => n.dcId)));
  // Configured RF per DC; fall back to the placed replicas for placements
  // built without this information.
  const rfByDc: Record<string, number> =
    placement.configuredRf ??
    Object.fromEntries(placedDcIds.map((dc) => [dc, replicas.filter((n) => n.dcId === dc).length]));
  const isNts = placement.strategy ? placement.strategy === "NetworkTopologyStrategy" : placedDcIds.length > 1;
  const totalRf = Object.values(rfByDc).reduce((a, b) => a + b, 0);
  const dcIds = Object.keys(rfByDc).filter((dc) => rfByDc[dc] > 0);

  const perDc = dcIds.map((dcId) => {
    const total = replicas.filter((n) => n.dcId === dcId);
    const avail = available.filter((n) => n.dcId === dcId);
    const required = quorumOf(rfByDc[dcId]);
    return { dcId, total: total.length, available: avail.length, required, satisfied: avail.length >= required };
  });

  const localDc = localDcId ?? dcIds[0];
  let requiredResponses: number;
  let satisfied: boolean;

  switch (level) {
    case "ONE":
      requiredResponses = 1;
      satisfied = available.length >= 1;
      break;
    case "ALL":
      requiredResponses = totalRf;
      satisfied = available.length >= totalRf;
      break;
    case "QUORUM":
      requiredResponses = quorumOf(totalRf);
      satisfied = available.length >= requiredResponses;
      break;
    case "LOCAL_QUORUM": {
      requiredResponses = isNts ? quorumOf(rfByDc[localDc] ?? 0) : quorumOf(totalRf);
      const localLive = available.filter((n) => n.dcId === localDc).length;
      satisfied = localLive >= requiredResponses;
      break;
    }
    case "EACH_QUORUM":
      if (isNts) {
        requiredResponses = perDc.reduce((sum, d) => sum + d.required, 0);
        satisfied = perDc.every((d) => d.satisfied);
      } else {
        requiredResponses = quorumOf(totalRf);
        satisfied = available.length >= requiredResponses;
      }
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
