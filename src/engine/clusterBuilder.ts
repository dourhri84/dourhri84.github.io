// Builds a Cluster domain object from a ClusterConfig, per §II.4.1.

import type { Cluster, ClusterConfig, ClusterNode, DataCenter, Rack } from "../domain/types";
import { assignTokens } from "./ring";

const DC_NAMES = ["dc1", "dc2", "dc3", "dc4", "dc5"];

export function buildCluster(config: ClusterConfig): Cluster {
  const numDCs = config.strategy === "SimpleStrategy" ? 1 : Math.max(1, config.numDataCenters);
  const racksPerDc = config.strategy === "SimpleStrategy" ? 1 : Math.max(1, config.racksPerDataCenter);

  const dataCenters: DataCenter[] = [];
  const nodes: ClusterNode[] = [];
  let nodeCounter = 1;
  let ipCounter = 2;

  for (let d = 0; d < numDCs; d++) {
    const dcId = `dc${d + 1}`;
    const racks: Rack[] = Array.from({ length: racksPerDc }, (_, r) => ({
      id: `${dcId}-rack${r + 1}`,
      name: `rack${r + 1}`,
    }));
    dataCenters.push({
      id: dcId,
      name: DC_NAMES[d] ?? dcId,
      racks,
      replicationFactor: config.replicationFactor,
    });

    for (let i = 0; i < config.nodesPerDataCenter; i++) {
      const rack = racks[i % racks.length];
      nodes.push({
        id: `node-${nodeCounter}`,
        name: `Node ${nodeCounter}`,
        dcId,
        rackId: rack.id,
        ip: `172.18.0.${ipCounter++}`,
        status: "UP",
        token: 0n,
        vnodeTokens: [],
      });
      nodeCounter++;
    }
  }

  const tokenized = assignTokens(nodes, config.hashWidth, config.virtualNodesEnabled, config.numVirtualNodes);

  return {
    config: { ...config, numDataCenters: numDCs, racksPerDataCenter: racksPerDc },
    dataCenters,
    nodes: tokenized,
    builtAt: Date.now(),
  };
}

export const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  mode: "beginner",
  strategy: "SimpleStrategy",
  replicationFactor: 3,
  consistencyLevel: "ONE",
  numDataCenters: 1,
  racksPerDataCenter: 1,
  nodesPerDataCenter: 3,
  virtualNodesEnabled: false,
  numVirtualNodes: 16,
  hashWidth: 16,
};

export const ADVANCED_DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  mode: "advanced",
  strategy: "SimpleStrategy",
  replicationFactor: 3,
  consistencyLevel: "QUORUM",
  numDataCenters: 1,
  racksPerDataCenter: 1,
  nodesPerDataCenter: 3,
  virtualNodesEnabled: true,
  numVirtualNodes: 16,
  hashWidth: 64,
};
