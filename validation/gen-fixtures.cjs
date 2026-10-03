// Generates golden test vectors from the Cassandra reference implementation.
// Usage: node gen-fixtures.cjs <engine-build-dir> <out.json>
"use strict";
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const B = path.resolve(process.argv[2]);
const { buildCluster } = require(path.join(B, "engine", "clusterBuilder"));

const reference = (lines) => execFileSync("java", ["-cp", path.join(__dirname, "build"), "CassandraReference"], { input: lines.join("\n") + "\n", stdio: ["pipe", "pipe", "ignore"] }).toString().trim().split("\n");
const u8 = (s) => Buffer.from(s, "utf8");
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const f32 = (n) => { const b = Buffer.alloc(4); b.writeFloatBE(n); return b; };
const f64 = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b; };
const date = (s) => { const b = Buffer.alloc(4); b.writeUInt32BE((Math.floor(Date.parse(s + "T00:00:00Z") / 864e5) + 2 ** 31) >>> 0); return b; };
const ts = (s) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(Date.parse(s + "Z"))); return b; };
const uuid = (s) => Buffer.from(s.replace(/-/g, ""), "hex");
const comp = (parts) => Buffer.concat(parts.flatMap((p) => { const l = Buffer.alloc(2); l.writeUInt16BE(p.length); return [l, p, Buffer.from([0])]; }));
const hex = (b) => (b.length ? b.toString("hex") : "-");

// ---- token vectors ----
const vec = [
  ["text", "Computer Science", u8("Computer Science")],
  ["text", "Artificial Intelligence", u8("Artificial Intelligence")],
  ["text", "Networks", u8("Networks")],
  ["text", "user_42", u8("user_42")],
  ["text", "a", u8("a")],
  ["text", "exactly16bytes!!", u8("exactly16bytes!!")],
  ["text", "Génie Informatique", u8("Génie Informatique")],
  ["text", "Réseaux", u8("Réseaux")],
  ["text", "é", u8("é")],
  ["text", "数据库", u8("数据库")],
  ["text", "Mathématiques appliquées", u8("Mathématiques appliquées")],
  ["int", 0, i32(0)], ["int", 1, i32(1)], ["int", 2, i32(2)], ["int", 42, i32(42)], ["int", -1, i32(-1)], ["int", 2147483647, i32(2147483647)],
  ["float", 3.5, f32(3.5)],
  ["real", 2.25, f64(2.25)],
  ["boolean", true, Buffer.from([1])], ["boolean", false, Buffer.from([0])],
  ["uuid", "123e4567-e89b-12d3-a456-426614174000", uuid("123e4567-e89b-12d3-a456-426614174000")],
  ["timeuuid", "50554d6e-29bb-11e5-b345-feff819cdc9f", uuid("50554d6e-29bb-11e5-b345-feff819cdc9f")],
  ["date", "2000-04-15", date("2000-04-15")], ["date", "1969-12-31", date("1969-12-31")],
  ["datetime", "2026-05-20T10:30:00", ts("2026-05-20T10:30:00")],
];
const tokens = reference(vec.map((v) => "TOKEN " + hex(v[2])));
const tokenVectors = vec.map(([type, value], i) => ({ components: [{ type, value }], cassandraToken: tokens[i] }));
const comps = [
  [[{ type: "text", value: "Computer Science" }, { type: "int", value: 2026 }], comp([u8("Computer Science"), i32(2026)])],
  [[{ type: "text", value: "dc" }, { type: "text", value: "rack" }], comp([u8("dc"), u8("rack")])],
  [[{ type: "int", value: 1 }, { type: "int", value: 2 }], comp([i32(1), i32(2)])],
];
reference(comps.map((c) => "TOKEN " + hex(c[1]))).forEach((t, i) => tokenVectors.push({ components: comps[i][0], cassandraToken: t }));

// ---- scenarios ----
const base = { mode: "advanced", consistencyLevel: "ONE", hashWidth: 64 };
const scenarios = [
  { name: "Fig.2 cluster: NTS, 2 DCs x 5 nodes, 1 rack, RF=3 per DC, 20 vnodes", config: { ...base, strategy: "NetworkTopologyStrategy", replicationFactor: 3, numDataCenters: 2, racksPerDataCenter: 1, nodesPerDataCenter: 5, virtualNodesEnabled: true, numVirtualNodes: 20 } },
  { name: "SimpleStrategy, 5 nodes, single token, RF=3", config: { ...base, strategy: "SimpleStrategy", replicationFactor: 3, numDataCenters: 1, racksPerDataCenter: 1, nodesPerDataCenter: 5, virtualNodesEnabled: false, numVirtualNodes: 1 } },
  { name: "NTS, 2 DCs x 6 nodes, 3 racks, RF=3 per DC, 16 vnodes (rack awareness)", config: { ...base, strategy: "NetworkTopologyStrategy", replicationFactor: 3, numDataCenters: 2, racksPerDataCenter: 3, nodesPerDataCenter: 6, virtualNodesEnabled: true, numVirtualNodes: 16 } },
  { name: "NTS, 3 DCs x 4 nodes, 2 racks, RF=3 per DC (RF > racks), single token", config: { ...base, strategy: "NetworkTopologyStrategy", replicationFactor: 3, numDataCenters: 3, racksPerDataCenter: 2, nodesPerDataCenter: 4, virtualNodesEnabled: false, numVirtualNodes: 1 } },
  { name: "Edge case: SimpleStrategy, 2 nodes, RF=3 (RF > nodes)", config: { ...base, strategy: "SimpleStrategy", replicationFactor: 3, numDataCenters: 1, racksPerDataCenter: 1, nodesPerDataCenter: 2, virtualNodesEnabled: false, numVirtualNodes: 1 } },
];
const keys = ["Computer Science", "Artificial Intelligence", "Networks", "Génie Informatique", "user_42"];
const LEVELS = ["ONE", "QUORUM", "ALL", "LOCAL_QUORUM", "EACH_QUORUM"];
for (const sc of scenarios) {
  const c = buildCluster(sc.config);
  const topo = ["RESET", ...c.nodes.map((n) => `NODE ${n.id} ${n.dcId} ${n.rackId} UP ${(sc.config.virtualNodesEnabled ? n.vnodeTokens : [n.token]).join(",")}`),
    sc.config.strategy === "SimpleStrategy" ? `STRATEGY SIMPLE ${sc.config.replicationFactor}` : `STRATEGY NTS ${c.dataCenters.map((d) => `${d.id}:${d.replicationFactor}`).join(",")}`];
  sc.nodeTokens = Object.fromEntries(c.nodes.map((n) => [n.id, (sc.config.virtualNodesEnabled ? n.vnodeTokens : [n.token]).map(String)]));
  const ktok = reference(keys.map((k) => "TOKEN " + hex(u8(k))));
  sc.placements = keys.map((k, i) => ({ key: k, token: ktok[i], cassandraReplicas: reference([...topo, `REPLICAS ${ktok[i]}`])[0].split(",") }));
  // failure patterns
  const ids = c.nodes.map((n) => n.id);
  const dcs = [...new Set(c.nodes.map((n) => n.dcId))];
  const patterns = [
    { label: "all UP", down: [] },
    { label: "first node DOWN", down: [ids[0]] },
    { label: "first two nodes DOWN", down: ids.slice(0, 2) },
    ...(dcs.length > 1 ? [{ label: `${dcs[1]} DOWN`, down: c.nodes.filter((n) => n.dcId === dcs[1]).map((n) => n.id) }, { label: `${dcs[0]} DOWN`, down: c.nodes.filter((n) => n.dcId === dcs[0]).map((n) => n.id) }] : []),
    { label: "all but one node DOWN", down: ids.slice(1) },
  ];
  sc.failures = [];
  for (const p of patterns) for (const pl of sc.placements.slice(0, 2)) {
    // additionally: primary replica of the key down
    const lines = [...topo, ...p.down.map((id) => `STATUS ${id} DOWN`)];
    const levels = LEVELS.filter((l) => !(l === "LOCAL_QUORUM" && sc.config.strategy === "SimpleStrategy"));
    const res = reference([...lines, ...levels.map((l) => `CL ${pl.token} ${l} dc1`)]);
    sc.failures.push({ pattern: p.label, down: p.down, key: pl.key, expected: Object.fromEntries(levels.map((l, i) => { const [bf, st] = res[i].split(" "); return [l, { blockFor: +bf, available: st === "OK" }]; })) });
  }
}
const out = { generatedBy: "Cassandra 5.0 reference implementation (apache/cassandra@cassandra-5.0 MurmurHash.java + transcribed placement/consistency code)", tokenVectors, scenarios };
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
console.log("vectors", tokenVectors.length, "scenarios", scenarios.length, "failure cases", scenarios.reduce((a, s) => a + s.failures.length, 0));
