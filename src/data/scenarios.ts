// Guided pedagogical scenarios, per cahier des charges §I.12. Each scenario
// configures the cluster/DDL/data for the learner and deep-links into the
// module where the concept is best observed.

import { useCassLabStore } from "../state/store";
import { parseCreateTable } from "../engine/cqlParser";

export interface ScenarioDef {
  id: string;
  title: string;
  concept: string;
  description: string;
  targetPath: string;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "hashing",
    title: "Understanding Hashing",
    concept: "Hashing",
    description: "Build a small cluster and watch a partition key turn into a hash and a token, step by step.",
    targetPath: "/partitioning",
  },
  {
    id: "ring",
    title: "Understanding the Ring",
    concept: "Token Ring",
    description: "See how the token space is divided into ranges, one per node, arranged in a circle.",
    targetPath: "/token-ring",
  },
  {
    id: "replication",
    title: "Understanding Replication",
    concept: "Replication",
    description: "Compare SimpleStrategy and NetworkTopologyStrategy replica placement for the same key.",
    targetPath: "/replica-placement",
  },
  {
    id: "quorum",
    title: "Understanding QUORUM",
    concept: "Consistency",
    description: "Fail a replica and see whether QUORUM can still be satisfied with RF=3.",
    targetPath: "/failure",
  },
  {
    id: "gossip",
    title: "Understanding Gossip",
    concept: "Gossip Protocol",
    description: "Watch nodes exchange cluster state with random peers, with no central coordinator.",
    targetPath: "/gossip",
  },
  {
    id: "vnodes",
    title: "Understanding VNodes",
    concept: "Virtual Nodes",
    description: "Toggle Virtual Nodes on and off and compare how token ranges are distributed.",
    targetPath: "/virtual-nodes",
  },
  {
    id: "tombstones",
    title: "Understanding Tombstones",
    concept: "Delete",
    description: "Delete a row and follow the tombstone from creation to eventual compaction.",
    targetPath: "/delete",
  },
  {
    id: "fault-tolerance",
    title: "Understanding Fault Tolerance",
    concept: "Failure Simulation",
    description: "Take down a whole datacenter and observe which consistency levels still work.",
    targetPath: "/failure",
  },
];

const SAMPLE_DDL = `CREATE TABLE Student(
  scode text,
  fullName text,
  birthDate date,
  specialty text,
  level int,
  PRIMARY KEY (scode)
);`;

/** Configures the store with a small ready-to-explore cluster + table + row
 * for the given scenario, then returns the path to navigate to. */
export function runScenario(id: string): string {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) return "/";
  const store = useCassLabStore.getState();

  store.setMode("advanced");
  store.setClusterConfig({
    strategy: id === "replication" || id === "fault-tolerance" ? "NetworkTopologyStrategy" : "SimpleStrategy",
    replicationFactor: 3,
    consistencyLevel: "QUORUM",
    numDataCenters: id === "replication" || id === "fault-tolerance" ? 2 : 1,
    nodesPerDataCenter: 3,
    virtualNodesEnabled: id === "vnodes",
    numVirtualNodes: 16,
    hashWidth: 64,
  });
  store.buildClusterNow();

  if (store.tables.length === 0) {
    const result = parseCreateTable(SAMPLE_DDL);
    if (result.ok && result.schema) {
      store.addTable(result.schema);
      const row = store.insertRow(result.schema.id, {
        scode: "cb189404",
        fullName: "Ahmed Dourhri",
        birthDate: "2004-05-12",
        specialty: "Computer Science",
        level: 2,
      });
      store.setActiveRowId(row.id);
    }
  }

  store.log(`Guided scenario started: ${scenario.title}.`, "info");
  return scenario.targetPath;
}
