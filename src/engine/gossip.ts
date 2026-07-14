// Gossip protocol engine, per cahier des charges §II.4.8 / Module 7.
// Each UP node exchanges state with 1-3 random peers per tick; consumers
// (the Gossip module UI) animate these as light pulses along edges.

import type { ClusterNode } from "../domain/types";

export interface GossipExchange {
  from: string;
  to: string;
  crossDc: boolean;
}

export function generateGossipTick(nodes: ClusterNode[]): GossipExchange[] {
  const upNodes = nodes.filter((n) => n.status === "UP");
  const exchanges: GossipExchange[] = [];
  for (const node of upNodes) {
    const peers = upNodes.filter((n) => n.id !== node.id);
    if (peers.length === 0) continue;
    const peerCount = Math.min(peers.length, 1 + Math.floor(Math.random() * 3));
    const shuffled = [...peers].sort(() => Math.random() - 0.5);
    for (const peer of shuffled.slice(0, peerCount)) {
      exchanges.push({ from: node.id, to: peer.id, crossDc: node.dcId !== peer.dcId });
    }
  }
  return exchanges;
}
