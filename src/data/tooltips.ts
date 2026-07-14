// Concept glossary powering the Tooltip component, per cahier des charges §I.10.

export const TOOLTIPS: Record<string, string> = {
  ONE: "Only one replica must respond for the request to succeed. Fastest, weakest consistency.",
  QUORUM: "At least a strict majority of replicas must respond: floor(RF / 2) + 1.",
  ALL: "Every replica must respond. Strongest consistency, but availability suffers if any replica is down.",
  LOCAL_QUORUM: "A strict majority of replicas in the coordinator's local datacenter must respond.",
  EACH_QUORUM: "A strict majority of replicas must respond in every datacenter.",
  "Partition Key": "Determines which partition (and therefore which node) a row belongs to. All rows sharing a partition key are stored together and hashed to the same token.",
  "Clustering Key": "Determines the on-disk sort order of rows within a partition. Does not affect which node stores the data.",
  "Primary Key": "The combination of the Partition Key and the Clustering Key(s). Uniquely identifies a row.",
  Token: "A numeric value produced by hashing the partition key. The token ring is partitioned into ranges, and each range is owned by a node.",
  "Token Ring": "A circular numeric space (e.g. -2^63 to 2^63-1 for 64-bit hashing) that Cassandra's nodes divide among themselves. Data is placed by hashing its partition key onto this ring.",
  "Virtual Node (VNode)": "A node can own many small, non-contiguous token ranges instead of one large contiguous range, improving load balancing and speeding up rebalancing.",
  "Replication Factor (RF)": "The number of copies (replicas) of each row that Cassandra keeps, for fault tolerance.",
  SimpleStrategy: "Places replicas by walking the token ring clockwise, with no awareness of datacenters or racks. Suitable for a single datacenter only.",
  NetworkTopologyStrategy: "Places replicas per-datacenter (each DC can have its own replication factor), spreading them across racks to survive rack failures.",
  Coordinator: "The node that receives a client's request and orchestrates hashing, routing to replicas, and consistency checks. Any node in the cluster can act as coordinator (peer-to-peer, no master).",
  "Commit Log": "An append-only, on-disk log that every write is recorded to first, for durability/crash recovery, before the Memtable is updated.",
  Memtable: "An in-memory, sorted structure holding recent writes for a table. Flushed to disk as an SSTable once it grows large enough.",
  SSTable: "An immutable, on-disk, sorted file that Memtables are flushed into. A partition's data can be spread across several SSTables.",
  "Bloom Filter": "A space-efficient probabilistic structure that can quickly say 'this SSTable definitely does not contain this key', avoiding unnecessary disk reads.",
  Tombstone: "A special marker written on delete instead of physically removing data immediately. It is replicated like a normal write and hides the deleted data until compaction.",
  "gc_grace_seconds": "How long a tombstone is kept before compaction may permanently purge it (default 10 days in real Cassandra), giving offline replicas time to receive the deletion.",
  Compaction: "A background process that merges SSTables, discarding obsolete data and expired tombstones.",
  Upsert: "In Cassandra, INSERT and UPDATE are the same operation internally: a new, timestamped write. The highest timestamp always wins (Last-Write-Wins).",
  "Gossip Protocol": "A peer-to-peer protocol where each node periodically exchanges cluster state (which nodes are up/down, load, etc.) with a few random peers, letting information spread across the whole cluster without a central coordinator.",
  "Hinted Handoff": "When a replica is temporarily down, the coordinator stores a 'hint' of the missed write and replays it once the replica comes back up.",
  "Read Repair": "When a read detects that replicas disagree, Cassandra repairs the stale replicas in the background (or inline) using the most recent value.",
  "Hot Partition": "A partition key that receives a disproportionate share of reads/writes, overloading the single node responsible for it — a common anti-pattern to avoid via better key design.",
  Rack: "A logical grouping of nodes (usually mapped to a physical failure domain) within a datacenter. NetworkTopologyStrategy spreads replicas across racks when possible.",
};

export function tooltipFor(term: string): string | undefined {
  return TOOLTIPS[term];
}
