// Hot partition simulation: repeatedly writing to the same partition key
// concentrates load on a single node, unlike a spread of distinct keys.
// This illustrates the classic Cassandra anti-pattern alongside Rebalancing.

import type { Cluster, HashWidth } from "../domain/types";
import { computeHash } from "./hashing";
import { placeReplicas } from "./replication";

export interface NodeLoad {
  nodeId: string;
  nodeName: string;
  load: number;
  isHot: boolean;
}

/**
 * `hotKey` receives `hotKeyWrites` writes (all landing on the same primary
 * node — the hot partition), while `spreadKeyCount` distinct synthetic keys
 * receive one write each, spread evenly across the ring for comparison.
 */
export function simulateHotPartitionLoad(
  cluster: Cluster,
  hashWidth: HashWidth,
  hotKey: string,
  hotKeyWrites: number,
  spreadKeyCount: number,
): NodeLoad[] {
  const load = new Map<string, number>();
  for (const node of cluster.nodes) load.set(node.id, 0);

  const hotHash = computeHash(hotKey, hashWidth);
  const hotPlacement = placeReplicas(hotKey, hotHash.token, cluster);
  if (hotPlacement) {
    load.set(hotPlacement.primary.id, (load.get(hotPlacement.primary.id) ?? 0) + hotKeyWrites);
  }

  for (let i = 0; i < spreadKeyCount; i++) {
    const key = `user_${i}`;
    const hash = computeHash(key, hashWidth);
    const placement = placeReplicas(key, hash.token, cluster);
    if (placement) {
      load.set(placement.primary.id, (load.get(placement.primary.id) ?? 0) + 1);
    }
  }

  const values = Array.from(load.values());
  const avg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

  return cluster.nodes.map((node) => {
    const l = load.get(node.id) ?? 0;
    return { nodeId: node.id, nodeName: node.name, load: l, isHot: l > avg * 2 && l > 0 };
  });
}
