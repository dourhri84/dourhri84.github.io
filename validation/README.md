# Technical validation of the CassLab simulation engine

CassLab's simulation engine (`src/engine`) is checked against Apache Cassandra in two complementary ways:

1. **Against a physical Cassandra 5.0 cluster:** see [`real-cluster/`](real-cluster/README.md). This is the experiment reported in the paper (Section 4).
2. **Against a reference implementation built from the Cassandra 5.0 source code:** this folder (`reference/`, `harness.cjs`, `run.sh`). It allows large-scale automated checks without a cluster, and it produces the golden values used by `npm test`.

## Reference implementation

| Mechanism | Reference (Apache Cassandra 5.0, commit `de8fe4b5`) |
|---|---|
| Token computation | `utils/MurmurHash.java`, **compiled unmodified**, plus `Murmur3Partitioner.getToken/normalize` |
| Partition-key bytes | CQL native protocol value encodings; `CompositeType` for multi-column keys |
| Replica placement | line-by-line transcription of `SimpleStrategy.calculateNaturalReplicas` and `NetworkTopologyStrategy.calculateNaturalReplicas` (`DatacenterEndpoints`) |
| Coordinator / primary replica | first replica returned by the placement above (token-aware routing) |
| Consistency levels | `ConsistencyLevel.blockFor`, `quorumFor`, `localQuorumFor` |
| Failure handling | `ReplicaPlans.assureSufficientLiveReplicas` (the check that raises `UnavailableException`) |
| Token ownership | `Murmur3Partitioner.describeOwnership` |

The reference implementation is independent of CassLab: it is written in Java and does not reuse
any CassLab code.

## Run

```bash
./validation/run.sh        # needs git, JDK 11+, Node 20.19+, TypeScript
npm test                   # 315 unit tests that use golden vectors from the reference implementation
```

`run.sh` fetches `MurmurHash.java` at the pinned commit, compiles the reference implementation and
the engine, and runs `harness.cjs`. The harness does the following:

* Hashes 10,022 partition keys: ASCII text, non-ASCII UTF-8, `int`, and composite `(text, int)` keys.
* Builds 800 cluster configurations: SimpleStrategy and NetworkTopologyStrategy; 1–3 DCs;
  1–3 racks; 1–6 nodes per DC; RF 1–5; a single token or 4/16/256 vnodes.
  CassLab's tokens are injected into the reference implementation.
* For each configuration, compares the replica set, replica order and primary replica for boundary tokens
  (node tokens, ±1, min, max) and random tokens (87,492 cases in total).
* Compares the required responses and the availability outcome for ONE, QUORUM, ALL, LOCAL_QUORUM and
  EACH_QUORUM under 6 random failure patterns per cluster (70,560 cases).
* Compares token ownership, and checks bootstrap/decommission behaviour when a node is added or removed.

`gen-fixtures.cjs` regenerates `tests/fixtures/cassandra-reference.json`.

## Results

```
Token computation  ascii 5007/5007 | non-ascii 2010/2010 | int 2005/2005 | composite 1000/1000
Replica placement  87492/87492 sets, 87492/87492 ordered, over 800 clusters
Coordinator/primary 87492/87492
Consistency        blockFor 70560/70560 | availability 70560/70560
Ownership          max abs error 5e-11 %
Rebalancing        existing nodes keep their tokens; moved data = new node's share (±1 %)
```

## Scope

The validation covers the deterministic algorithms that CassLab visualises. It does
**not** cover the following:

* Cassandra's optimised vnode token allocator (`allocate_tokens_for_local_replication_factor`).
  CassLab draws random vnode tokens, which is the legacy allocator. Placement is still
  validated exactly for the tokens CassLab generates.
* Timing, hinted handoff, read repair, speculative retry, pending (bootstrapping) replicas, and
  lightweight transactions.
* The educational 16- and 32-bit hash modes. They are deliberately not Cassandra-compatible.
  Only the 64-bit Murmur3 mode is validated.
