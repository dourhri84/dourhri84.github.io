// Step sequences for the Write / Read / Update / Delete animated timelines,
// per cahier des charges §II.4.8 state machine and Modules 8-11. Each
// module's UI drives an index into these arrays with the shared Stepper
// component and renders the SVG diagram accordingly.

import type { OperationStep } from "../domain/types";

export const WRITE_PATH_STEPS: OperationStep[] = [
  { key: "ready", label: "Ready", description: "The client sends a write request to a coordinator node." },
  { key: "hashing", label: "Hashing", description: "The coordinator hashes the partition key." },
  { key: "token", label: "Token", description: "The hash is folded into a token on the ring." },
  { key: "routing", label: "Routing", description: "The coordinator locates the primary replica via the token ring." },
  { key: "commitlog", label: "Commit Log", description: "Each replica appends the write to its Commit Log for durability." },
  { key: "memtable", label: "Memtable", description: "Each replica applies the write to its in-memory Memtable." },
  { key: "replication", label: "Replication", description: "The write is propagated to all replicas per the replication strategy." },
  { key: "consistency", label: "Consistency", description: "The coordinator waits for enough ACKs to satisfy the consistency level." },
  { key: "result", label: "Result", description: "The write is acknowledged to the client." },
];

export const READ_PATH_STEPS: OperationStep[] = [
  { key: "ready", label: "Ready", description: "The client sends a read request to a coordinator node." },
  { key: "hashing", label: "Hashing", description: "The coordinator hashes the partition key." },
  { key: "token", label: "Token", description: "The hash is folded into a token on the ring." },
  { key: "routing", label: "Routing", description: "The coordinator selects replicas to query via the token ring." },
  { key: "bloomfilter", label: "Bloom Filter", description: "Each replica consults its Bloom Filter to skip SSTables that cannot contain the key." },
  { key: "memtable_sstable", label: "Memtable / SSTable", description: "The replica checks the Memtable and any candidate SSTables, merging the most recent data." },
  { key: "consistency", label: "Consistency", description: "The coordinator waits for enough replicas to satisfy the consistency level." },
  { key: "result", label: "Result", description: "The most recent value is returned to the client." },
];

export const UPDATE_PATH_STEPS: OperationStep[] = [
  { key: "ready", label: "Ready", description: "The client wants to modify existing data. In Cassandra, an update is technically identical to a new insertion — this is called an Upsert. There is no 'read before write'." },
  { key: "routing", label: "Routing", description: "The coordinator hashes the partition key and locates the replicas via the token ring." },
  { key: "send", label: "Send", description: "The new value, tagged with a write timestamp, is sent to all replicas." },
  { key: "upsert", label: "Upsert", description: "Each replica writes the new value. The highest timestamp wins (Last-Write-Wins)." },
  { key: "quorum", label: "Quorum", description: "The coordinator waits for enough ACKs to satisfy the consistency level." },
  { key: "result", label: "Result", description: "The update is acknowledged to the client." },
];

export const DELETE_PATH_STEPS: OperationStep[] = [
  { key: "request", label: "Request", description: "The client asks to delete a row or cell." },
  { key: "localization", label: "Localization", description: "The coordinator hashes the partition key and locates the replicas via the token ring." },
  { key: "propagation", label: "Propagation", description: "Instead of a deletion command, the coordinator sends a Tombstone — a special marker that 'masks' the actual value. It is propagated to replicas exactly like a write." },
  { key: "marking", label: "Marking", description: "Each replica marks the data as deleted with the Tombstone, keeping it until compaction." },
  { key: "quorum", label: "Quorum", description: "The coordinator waits for enough ACKs to satisfy the consistency level." },
  { key: "result", label: "Result", description: "After gc_grace_seconds elapses, compaction physically removes the tombstoned data." },
];
