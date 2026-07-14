# CassLab User Guide

CassLab is a virtual laboratory for exploring how Apache Cassandra works internally. It assumes you already know the basics of Cassandra (or are learning them alongside a course) — this guide walks through the app's modules, not Cassandra theory from scratch.

## Getting started

1. Pick **Beginner** or **Advanced** mode in the top-right toggle.
   - **Beginner**: SimpleStrategy only, one datacenter, one rack, no Virtual Nodes, a simplified 16-bit hash, and a single-column (mono-attribute) primary key.
   - **Advanced**: every option is unlockable — NetworkTopologyStrategy, multiple datacenters and racks, Virtual Nodes, 16/32/64-bit hashing (64-bit uses a real Murmur3 implementation, just like Cassandra), and your own custom DDL.
2. On the **Cluster Configuration** page, choose your parameters and click **Build Cluster**.
3. On the **DDL Analysis** page, review (or edit) the pre-filled `CREATE TABLE` statement and click **Validate & Create Table**. CassLab reports the table's Partition Key, Clustering Key(s), and Primary Key separately, or a clear error message if the syntax is invalid.
4. On the **Insertion** page, pick a table and fill in a row (UUID/TimeUUID columns are generated for you). Submitting opens the **Write Path** animation automatically.

From there, every other module reads the same **active data** (shown in the blue "Active Data" bar) so you can follow one row through partitioning, replication, consistency, and every CRUD path.

## Module reference

| Module | What it shows |
|---|---|
| **Cluster Configuration** | Build the simulated cluster: strategy, replication factor, consistency level, datacenters/racks, nodes, Virtual Nodes, hash width. |
| **DDL Analysis** | Validate a `CREATE TABLE` statement; see its Partition Key / Clustering Key / Primary Key breakdown, or a syntax error. |
| **Insertion** | Insert rows into a table; triggers the Write Path. |
| **Partitioning** | Step through hashing a key → computing its token → walking the ring → finding the owning node. |
| **Token Ring** | The full token space as a circle, with each node's arc(s) and a legend. |
| **Replica Placement** | Which nodes hold a copy of the active data, under SimpleStrategy or NetworkTopologyStrategy. |
| **Consistency Level** | Choose ONE / QUORUM / ALL (/ LOCAL_QUORUM / EACH_QUORUM with NetworkTopologyStrategy) and see the required-response math live. |
| **Gossip** | Animated peer-to-peer state exchange between nodes — no central coordinator. |
| **Write Path** | Coordinator → Commit Log → Memtable → Replication → Consistency → Result. |
| **Read Path** | Coordinator → Bloom Filter → Memtable/SSTable → Consistency → Result. |
| **Update** | Shows that an update is an Upsert: old vs. new value, timestamps, Last-Write-Wins. |
| **Delete** | Tombstone creation and propagation, `gc_grace_seconds`, and a "simulate compaction" button to permanently purge the row. |
| **Failure Simulation** | Click nodes (or a whole datacenter) to mark them DOWN and see whether the chosen consistency level still succeeds. |
| **Rebalancing & Hot Partitions** | Add/remove nodes and watch the ring redistribute; simulate a "hot" partition key to see load concentrate on one node. |
| **Virtual Nodes** | Side-by-side comparison of classic single-token assignment vs. Virtual Nodes. |
| **Guided Scenarios** | One-click demonstrations (Hashing, Ring, Replication, QUORUM, Gossip, VNodes, Tombstones, Fault Tolerance) that set everything up for you. |
| **Survey / Feedback** | A short satisfaction survey — tell us what worked and what didn't. |

## Tips

- Tooltips (dotted underline) explain every key concept — hover or focus them anywhere in the app.
- The **Event Log** at the bottom records every action you take, across every module.
- Reloading the page resets the simulation (nothing is stored server-side, by design) — use **Guided Scenarios** for a fast way to get back to a useful starting state.
- If a module says "select active data first," go to **Insertion** and insert a row (or run a Guided Scenario).
