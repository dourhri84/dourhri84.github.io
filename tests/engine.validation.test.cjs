// Technical validation of the CassLab simulation engine against Apache Cassandra.
//
// Expected values in fixtures/cassandra-reference.json were produced by a
// reference implementation built from the Apache Cassandra 5.0 source code (see validation/README.md):
// token computation runs Cassandra's own MurmurHash.java; replica placement and
// consistency checks transcribe SimpleStrategy, NetworkTopologyStrategy,
// ConsistencyLevel.blockFor and ReplicaPlans.assureSufficientLiveReplicas.
//
// Run: npm test   (compiles src/engine with tsc, then uses node:test; no extra deps)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const BUILD = path.join(__dirname, "..", ".test-build", "engine");
const { computeHash, computePartitionToken, tokenBounds } = require(path.join(BUILD, "hashing"));
const { buildCluster } = require(path.join(BUILD, "clusterBuilder"));
const { tokenToNode, ringShareByNode, clockwiseNodeOrder } = require(path.join(BUILD, "ring"));
const { placeReplicas } = require(path.join(BUILD, "replication"));
const { evaluateConsistency } = require(path.join(BUILD, "consistency"));
const { setNodeStatus, setDcStatus } = require(path.join(BUILD, "failure"));
const { addNode, removeNode } = require(path.join(BUILD, "rebalancing"));
const F = require("./fixtures/cassandra-reference.json");

const { min: MIN, max: MAX } = tokenBounds(64);

// ---------------------------------------------------------------- T1 hashing
test("T1 Murmur3 tokens equal Cassandra's Murmur3Partitioner for every CQL type", async (t) => {
  for (const v of F.tokenVectors) {
    const label = v.components.map((c) => `${c.type}:${c.value}`).join(" + ");
    await t.test(label, () => {
      assert.equal(computePartitionToken(v.components).toString(), v.cassandraToken);
    });
  }
});

test("T1b text key via computeHash (Partitioning module) matches Cassandra", () => {
  for (const v of F.tokenVectors.filter((x) => x.components.length === 1 && x.components[0].type === "text")) {
    assert.equal(computeHash(v.components[0].value, 64).token.toString(), v.cassandraToken);
  }
});

test("T1c tokens lie in [-2^63+1, 2^63-1]; Long.MIN_VALUE is reserved", () => {
  for (let i = 0; i < 2000; i++) {
    const tok = computeHash(`k${i}`, 64).token;
    assert.ok(tok > MIN && tok <= MAX);
  }
});

// ------------------------------------------------------ T2 token assignment
test("T2 token assignment is deterministic and reproduces the fixture ring", () => {
  for (const sc of F.scenarios) {
    const c = buildCluster(sc.config);
    for (const n of c.nodes) {
      const toks = (sc.config.virtualNodesEnabled ? n.vnodeTokens : [n.token]).map(String);
      assert.deepEqual(toks, sc.nodeTokens[n.id], `${sc.name} ${n.id}`);
    }
  }
});

test("T2b single-token rings are evenly balanced; ownership sums to 100%", () => {
  for (const n of [2, 3, 5, 8, 10]) {
    const c = buildCluster({ ...F.scenarios[1].config, nodesPerDataCenter: n });
    const share = ringShareByNode(c.nodes, 64, false);
    for (const s of share) assert.ok(Math.abs(s.percent - 100 / n) < 1e-9);
  }
  for (const sc of F.scenarios) {
    const c = buildCluster(sc.config);
    const total = ringShareByNode(c.nodes, 64, sc.config.virtualNodesEnabled).reduce((a, b) => a + b.percent, 0);
    assert.ok(Math.abs(total - 100) < 1e-9);
  }
});

test("T2c VNode tokens are unique, sorted and within the token range", () => {
  const c = buildCluster({ ...F.scenarios[0].config, numVirtualNodes: 256 });
  const all = c.nodes.flatMap((n) => n.vnodeTokens);
  assert.equal(new Set(all.map(String)).size, all.length);
  for (const n of c.nodes) for (let i = 1; i < n.vnodeTokens.length; i++) assert.ok(n.vnodeTokens[i - 1] < n.vnodeTokens[i]);
  for (const tk of all) assert.ok(tk > MIN && tk <= MAX);
});

// -------------------------------------------- T3 replica placement / T4 coordinator
test("T3 replica sets (and their order) equal Cassandra's natural replicas", async (t) => {
  for (const sc of F.scenarios) {
    const c = buildCluster(sc.config);
    for (const p of sc.placements) {
      await t.test(`${sc.name} / ${p.key}`, () => {
        const pl = placeReplicas(p.key, BigInt(p.token), c);
        assert.deepEqual(pl.replicas.map((n) => n.id), p.cassandraReplicas);
      });
    }
  }
});

test("T3b NTS spreads replicas over distinct racks before reusing a rack", () => {
  const sc = F.scenarios[2]; // 3 racks, RF=3 per DC
  const c = buildCluster(sc.config);
  for (let i = 0; i < 500; i++) {
    const pl = placeReplicas("k", computeHash(`key-${i}`, 64).token, c);
    for (const dc of ["dc1", "dc2"]) {
      const racks = pl.replicas.filter((n) => n.dcId === dc).map((n) => n.rackId);
      assert.equal(racks.length, 3);
      assert.equal(new Set(racks).size, 3);
    }
  }
});

test("T4 coordinator/primary replica = first node clockwise from the token", () => {
  for (const sc of F.scenarios) {
    const c = buildCluster(sc.config);
    for (const p of sc.placements) {
      const tok = BigInt(p.token);
      const owner = tokenToNode(tok, c.nodes, sc.config.virtualNodesEnabled);
      assert.equal(owner.id, p.cassandraReplicas[0], `${sc.name} / ${p.key}`);
      assert.equal(placeReplicas(p.key, tok, c).primary.id, p.cassandraReplicas[0]);
    }
  }
});

test("T4b ring boundaries: a token equal to a node token belongs to that node; wrap-around", () => {
  const c = buildCluster(F.scenarios[1].config);
  const sorted = [...c.nodes].sort((a, b) => (a.token < b.token ? -1 : 1));
  for (const n of sorted) {
    assert.equal(tokenToNode(n.token, c.nodes, false).id, n.id);
    const next = sorted[(sorted.indexOf(n) + 1) % sorted.length];
    assert.equal(tokenToNode(n.token + 1n, c.nodes, false).id, next.id);
  }
  assert.equal(tokenToNode(MAX, c.nodes, false).id, sorted[0].id);
  assert.equal(clockwiseNodeOrder(MAX, c.nodes, false).length, c.nodes.length);
});

// ------------------------------------- T5 consistency and T6 failure handling
test("T5/T6 required responses and availability equal Cassandra under failures", async (t) => {
  for (const sc of F.scenarios) {
    const base = buildCluster(sc.config);
    for (const f of sc.failures) {
      let c = base;
      for (const id of f.down) c = setNodeStatus(c, id, "DOWN");
      const token = BigInt(sc.placements.find((p) => p.key === f.key).token);
      for (const [level, exp] of Object.entries(f.expected)) {
        await t.test(`${sc.name} / ${f.pattern} / ${f.key} / ${level}`, () => {
          const ev = evaluateConsistency(placeReplicas(f.key, token, c), level, "dc1");
          assert.equal(ev.requiredResponses, exp.blockFor, "blockFor");
          assert.equal(ev.satisfied, exp.available, "UnavailableException expected?");
        });
      }
    }
  }
});

test("T6b datacenter failure (Fig. 6 setting): ONE and LOCAL_QUORUM survive, QUORUM fails", () => {
  const sc = F.scenarios[0];
  const c = setDcStatus(buildCluster(sc.config), "dc2", "DOWN");
  const pl = placeReplicas("Computer Science", BigInt(sc.placements[0].token), c);
  assert.equal(evaluateConsistency(pl, "ONE").satisfied, true);
  assert.equal(evaluateConsistency(pl, "LOCAL_QUORUM", "dc1").satisfied, true);
  assert.equal(evaluateConsistency(pl, "LOCAL_QUORUM", "dc2").satisfied, false);
  assert.equal(evaluateConsistency(pl, "QUORUM").satisfied, false); // 3 live < 4
  assert.equal(evaluateConsistency(pl, "EACH_QUORUM").satisfied, false);
});

// ------------------------------------------------------------- T7 rebalancing
test("T7 bootstrap/decommission keep existing tokens; reported movement = new owner share", () => {
  for (const [vn, nv] of [[false, 1], [true, 16]]) {
    const cfg = { ...F.scenarios[1].config, replicationFactor: 1, virtualNodesEnabled: vn, numVirtualNodes: nv };
    const before = buildCluster(cfg);
    const rep = addNode(before, "dc1");
    for (const n of before.nodes) {
      const after = rep.cluster.nodes.find((x) => x.id === n.id);
      assert.deepEqual((vn ? after.vnodeTokens : [after.token]).map(String), (vn ? n.vnodeTokens : [n.token]).map(String));
    }
    // every key that moves, moves to the new node (consistent hashing property)
    let moved = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const tok = computeHash(`key-${i}`, 64).token;
      const a = tokenToNode(tok, before.nodes, vn).id;
      const b = tokenToNode(tok, rep.cluster.nodes, vn).id;
      if (a !== b) { moved++; assert.equal(b, rep.addedNodeId); }
    }
    assert.ok(Math.abs((100 * moved) / N - rep.estimatedDataMovedPercent) < 3);
    const rem = removeNode(rep.cluster, rep.addedNodeId);
    assert.deepEqual(rem.cluster.nodes.map((n) => n.id), before.nodes.map((n) => n.id));
  }
});

// ------------------------------------------- T8 additional CQL types (reference implementation)
test("T8 bigint / double / timestamp / time tokens equal Cassandra's", () => {
  const vectors = [
    [{ type: "bigint", value: "1" }, "6292367497774912474"],
    [{ type: "bigint", value: "-9223372036854775808" }, "9204767954415360687"],
    [{ type: "bigint", value: "1234567890123" }, "8056999751681019901"],
    [{ type: "double", value: 3.14 }, "2670027926051588151"],
    [{ type: "timestamp", value: "2026-05-20T10:30:00" }, "-6999447042768627588"],
    [{ type: "time", value: "10:30:15" }, "-5130729518972283938"],
  ];
  for (const [c, exp] of vectors) assert.equal(computePartitionToken([c]).toString(), exp, `${c.type}:${c.value}`);
});

// ------------------------------------------------ T9 supported CQL subset
const { parseCreateTable } = require(path.join(BUILD, "cqlParser"));

test("T9 parser accepts the documented CQL subset", () => {
  const ok = [
    ["CREATE TABLE t (id int PRIMARY KEY, name text);", ["id"], []],
    ["create table if not exists ks.t (a text, b int, c date, PRIMARY KEY (a, b, c))", ["a"], ["b", "c"]],
    ["CREATE TABLE t (a text, b int, c timestamp, PRIMARY KEY ((a, b), c));", ["a", "b"], ["c"]],
    ["CREATE TABLE t (a varchar, b bigint, c double, d uuid, PRIMARY KEY (a)) -- comment", ["a"], []],
    ["/* c */ CREATE TABLE t (\n a text, // x\n b real, c datetime, PRIMARY KEY (a));", ["a"], []],
  ];
  for (const [ddl, pk, ck] of ok) {
    const r = parseCreateTable(ddl);
    assert.ok(r.ok, `${ddl} -> ${r.error && r.error.message}`);
    assert.deepEqual(r.schema.partitionKeyColumns, pk);
    assert.deepEqual(r.schema.clusteringKeyColumns, ck);
  }
  const t = parseCreateTable("CREATE TABLE t (a varchar, b real, c datetime, PRIMARY KEY (a));").schema;
  assert.deepEqual(t.columns.map((c) => c.type), ["text", "double", "timestamp"]);
});

test("T9b parser rejects unsupported constructs with an explicit message", () => {
  const bad = [
    ["CREATE KEYSPACE k WITH replication = {};", /CREATE KEYSPACE/],
    ["SELECT * FROM t;", /SELECT/],
    ["CREATE TABLE t (a text, b int, PRIMARY KEY (a)) WITH CLUSTERING ORDER BY (b DESC);", /Table options/],
    ["CREATE TABLE t (a text, tags set<text>, PRIMARY KEY (a));", /Collection/],
    ["CREATE TABLE t (a text, b int STATIC, PRIMARY KEY (a));", /STATIC/],
    ["CREATE TABLE t (a text, b decimal, PRIMARY KEY (a));", /not supported by CassLab/],
    ['CREATE TABLE t ("A" text, PRIMARY KEY ("A"));', /Quoted/],
    ["CREATE TABLE t (a text PRIMARY KEY, b int, PRIMARY KEY (b));", /only one PRIMARY KEY/],
    ["CREATE TABLE t (a text, b int, PRIMARY KEY (a, a));", /more than once/],
    ["CREATE TABLE t (a text, b int, PRIMARY KEY (z));", /unknown column/],
    ["CREATE TABLE t (a text, b int);", /Missing PRIMARY KEY/],
    ["CREATE TABLE t (a text, a int, PRIMARY KEY (a));", /Duplicate column/],
    ["CREATE TABLE t (a text, PRIMARY KEY (a)); CREATE TABLE u (b text, PRIMARY KEY (b));", /one statement/],
  ];
  for (const [ddl, re] of bad) {
    const r = parseCreateTable(ddl);
    assert.equal(r.ok, false, ddl);
    assert.match(r.error.message, re, ddl);
  }
});

test("T10 token range containing a key: (start, end] and owner = token owner", () => {
  const { tokenRangeContaining } = require(path.join(BUILD, "ring"));
  for (const sc of F.scenarios) {
    const c = buildCluster(sc.config);
    for (let i = 0; i < 300; i++) {
      const tok = computeHash(`k-${i}`, 64).token;
      const r = tokenRangeContaining(tok, c.nodes, sc.config.virtualNodesEnabled);
      assert.equal(r.nodeId, tokenToNode(tok, c.nodes, sc.config.virtualNodesEnabled).id);
      if (r.wraps) assert.ok(tok > r.start || tok <= r.end);
      else assert.ok(tok > r.start && tok <= r.end);
    }
  }
});
