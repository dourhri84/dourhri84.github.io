// Differential validation harness: CassLab simulation engine vs. Cassandra 5.0 reference implementation.
// Usage: node harness.cjs <engine-build-dir> [out.json]
"use strict";
const path = require("path");
const { execFileSync } = require("child_process");
const fs = require("fs");

const B = path.resolve(process.argv[2]);
const E = (m) => require(path.join(B, "engine", m));
const { computeHash } = E("hashing");
const { buildCluster } = E("clusterBuilder");
const { placeReplicas } = E("replication");
const { tokenToNode, ringShareByNode } = E("ring");
const { evaluateConsistency } = E("consistency");
const { setNodeStatus } = E("failure");
const { addNode } = E("rebalancing");
let hashingMod = E("hashing");

// ---------- reference plumbing (batched) ----------
function reference(lines) {
  const out = execFileSync("java", ["-cp", path.join(__dirname, "build"), "CassandraReference"], {
    input: lines.join("\n") + "\n", maxBuffer: 1 << 28, stdio: ["pipe", "pipe", "ignore"],
  }).toString().trim();
  return out.length ? out.split("\n") : [];
}

const jobs = [];
const ask = (lines, cb) => jobs.push([lines, cb]);
function flush() {
  const all = jobs.flatMap((j) => j[0]);
  const res = reference(all); let k = 0;
  for (const [lines, cb] of jobs) { const n = lines.filter((l) => /^(TOKEN|REPLICAS|CL|OWN)\b/.test(l)).length; cb(res.slice(k, k + n)); k += n; }
  jobs.length = 0;
}
// ---------- deterministic PRNG ----------
let s = 0x2f6b1d3; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const MIN = -(1n << 63n), MAX = (1n << 63n) - 1n;
const rtok = () => BigInt.asIntN(64, (BigInt(ri(0, 0xffffffff)) << 32n) | BigInt(ri(0, 0xffffffff)));

// ---------- independent CQL serialisation (native protocol v5 spec, §6) ----------
const utf8 = (v) => Buffer.from(String(v), "utf8");
function ser(type, v) {
  switch (type) {
    case "text": return utf8(v);
    case "int": { const b = Buffer.alloc(4); b.writeInt32BE(Number(v)); return b; }
    case "float": { const b = Buffer.alloc(4); b.writeFloatBE(Number(v)); return b; }
    case "boolean": return Buffer.from([v === true || v === "true" ? 1 : 0]);
    case "uuid": case "timeuuid": return Buffer.from(String(v).replace(/-/g, ""), "hex");
    case "date": { const days = Math.floor(Date.parse(String(v) + "T00:00:00Z") / 86400000); const b = Buffer.alloc(4); b.writeUInt32BE((days + 2 ** 31) >>> 0); return b; }
    default: throw new Error("no serializer for " + type);
  }
}
function composite(parts) { // CompositeType: <u16 len><bytes><0x00> per component
  return Buffer.concat(parts.flatMap((p) => { const l = Buffer.alloc(2); l.writeUInt16BE(p.length); return [l, p, Buffer.from([0])]; }));
}
const hex = (buf) => (buf.length ? buf.toString("hex") : "-");

const report = { hashing: {}, placement: {}, coordinator: {}, consistency: {}, ownership: {}, rebalancing: {}, examples: [] };
const ex = (k, o) => { if (report.examples.filter((e) => e.kind === k).length < 5) report.examples.push({ kind: k, ...o }); };

// =============== 1. Hashing / token computation ===============
{
  const ascii = [];
  const alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-";
  for (let i = 0; i < 5000; i++) { let k = ""; const n = ri(1, 48); for (let j = 0; j < n; j++) k += alpha[ri(0, alpha.length - 1)]; ascii.push(k); }
  ascii.push("Computer Science", "Artificial Intelligence", "Networks", "CS001", "user_0", "a", "jsmith");
  const nonAscii = ["Génie Informatique", "Réseaux", "Sécurité", "é", "Mathématiques appliquées", "数据库", "Ingénierie des données", "naïve", "Überprüfung", "café"];
  const pool = "éèàçüößñ数据库λΩ";
  for (let i = 0; i < 2000; i++) { let k = ""; const n = ri(1, 40); for (let j = 0; j < n; j++) k += rnd() < 0.3 ? pool[ri(0, pool.length - 1)] : alpha[ri(0, alpha.length - 1)]; nonAscii.push(k); }
  const ints = []; for (let i = 0; i < 2000; i++) ints.push(ri(-2147483648, 2147483647)); ints.push(0, 1, 2, 42, -1);
  const comps = []; for (let i = 0; i < 1000; i++) comps.push([ascii[i], ints[i]]);

  const hasRowToken = typeof hashingMod.computePartitionToken === "function";
  const cassText = (k) => computeHash(k, 64).token;
  const cassInt = (n) => hasRowToken ? hashingMod.computePartitionToken([{ type: "int", value: n }]) : computeHash(String(n), 64).token;
  const cassComp = ([t, n]) => hasRowToken ? hashingMod.computePartitionToken([{ type: "text", value: t }, { type: "int", value: n }]) : computeHash(`${t}|${n}`, 64).token;

  const cats = [
    ["text_ascii", ascii, cassText, (k) => utf8(k)],
    ["text_non_ascii", nonAscii, cassText, (k) => utf8(k)],
    ["int", ints, cassInt, (n) => ser("int", n)],
    ["composite_text_int", comps, cassComp, ([t, n]) => composite([utf8(t), ser("int", n)])],
  ];
  for (const [name, keys, cass, bytes] of cats) {
    const exp = reference(keys.map((k) => "TOKEN " + hex(bytes(k)))).map(BigInt);
    let ok = 0;
    keys.forEach((k, i) => { const got = cass(k); if (got === exp[i]) ok++; else ex("hash_" + name, { key: k, casslab: String(got), cassandra: String(exp[i]) }); });
    report.hashing[name] = { cases: keys.length, match: ok };
  }
  // Paper keys for the manuscript table
  report.hashing.paperKeys = ["Computer Science", "Artificial Intelligence", "Networks", "Génie Informatique"].map((k) => ({ key: k, casslab: String(cassText(k)), cassandra: reference(["TOKEN " + hex(utf8(k))])[0] }));
  report.hashing.intKeys = [1, 2, 42].map((n) => ({ key: n, casslab: String(cassInt(n)), cassandra: reference(["TOKEN " + hex(ser("int", n))])[0] }));
}

// =============== 2-4. Placement, coordinator, consistency ===============
function topoLines(cluster) {
  const L = ["RESET"];
  for (const n of cluster.nodes) {
    const toks = cluster.config.virtualNodesEnabled && n.vnodeTokens.length ? n.vnodeTokens : [n.token];
    L.push(`NODE ${n.id} ${n.dcId} ${n.rackId} ${n.status} ${toks.join(",")}`);
  }
  L.push(cluster.config.strategy === "SimpleStrategy" ? `STRATEGY SIMPLE ${cluster.config.replicationFactor}`
    : `STRATEGY NTS ${cluster.dataCenters.map((d) => `${d.id}:${d.replicationFactor}`).join(",")}`);
  return L;
}
const configs = [];
for (const strategy of ["SimpleStrategy", "NetworkTopologyStrategy"])
  for (const dcs of strategy === "SimpleStrategy" ? [1] : [1, 2, 3])
    for (const racks of strategy === "SimpleStrategy" ? [1] : [1, 2, 3])
      for (const npd of [1, 2, 3, 5, 6])
        for (const rf of [1, 2, 3, 5])
          for (const [vn, nv] of [[false, 1], [true, 4], [true, 16], [true, 256]])
            configs.push({ mode: "advanced", strategy, replicationFactor: rf, consistencyLevel: "ONE", numDataCenters: dcs, racksPerDataCenter: racks, nodesPerDataCenter: npd, virtualNodesEnabled: vn, numVirtualNodes: nv, hashWidth: 64 });

const LEVELS = ["ONE", "QUORUM", "ALL", "LOCAL_QUORUM", "EACH_QUORUM"];
const P = { cases: 0, setMatch: 0, orderMatch: 0 }, C = { cases: 0, primaryMatch: 0, ownerMatch: 0 };
const K = { cases: 0, blockForMatch: 0, availMatch: 0, byLevel: {} };
const Kfit = { cases: 0, blockForMatch: 0, availMatch: 0 }; // RF <= nodes per DC (realistic configs)
const O = { clusters: 0, maxAbsErrPct: 0, sumTo100: 0, tokensInRange: 0, tokensUnique: 0 };

for (const cfg of configs) {
  let cluster = buildCluster(cfg);
  const toks = [];
  for (const n of cluster.nodes) for (const t of cfg.virtualNodesEnabled ? n.vnodeTokens : [n.token]) toks.push(t);
  const tokens = [MIN + 1n, MAX, 0n, ...toks.slice(0, 20).flatMap((t) => [t, t - 1n, t + 1n])];
  for (let i = 0; i < 60; i++) tokens.push(rtok());

  // ownership & token assignment properties
  O.clusters++;
  if (toks.every((t) => t > MIN && t <= MAX)) O.tokensInRange++;
  if (new Set(toks.map(String)).size === toks.length) O.tokensUnique++;
  const share = ringShareByNode(cluster.nodes, 64, cfg.virtualNodesEnabled);
  const sum = share.reduce((a, b) => a + b.percent, 0); if (Math.abs(sum - 100) < 1e-6) O.sumTo100++;
  ask([...topoLines(cluster), "OWN"], ([line]) => { for (const [id, f] of line.split(",").map((kv) => kv.split("="))) { const c = share.find((x) => x.nodeId === id).percent; O.maxAbsErrPct = Math.max(O.maxAbsErrPct, Math.abs(c - Number(f) * 100)); } });

  const q = [...topoLines(cluster)];
  for (const t of tokens) q.push(`REPLICAS ${t}`);
  const fitsRf = cfg.replicationFactor <= cfg.nodesPerDataCenter;
  ask(q, (exp) => tokens.forEach((t, i) => {
    const pl = placeReplicas("k", t, cluster);
    const got = pl.replicas.map((n) => n.id);
    const want = exp[i].split(",");
    P.cases++;
    if (got.length === want.length && [...got].sort().join() === [...want].sort().join()) P.setMatch++;
    else ex("placement", { cfg: `${cfg.strategy} dc=${cfg.numDataCenters} racks=${cfg.racksPerDataCenter} n/dc=${cfg.nodesPerDataCenter} rf=${cfg.replicationFactor} vnodes=${cfg.virtualNodesEnabled ? cfg.numVirtualNodes : 1}`, token: String(t), casslab: got, cassandra: want });
    if (got.join() === want.join()) P.orderMatch++;
    C.cases++;
    if (pl.primary.id === want[0]) C.primaryMatch++;
    else ex("primary", { cfg: `${cfg.strategy} dc=${cfg.numDataCenters} rf=${cfg.replicationFactor}`, token: String(t), casslabPrimary: pl.primary.id, cassandraPrimary: want[0] });
    if (tokenToNode(t, cluster.nodes, cfg.virtualNodesEnabled).id === want[0]) C.ownerMatch++;
  }));

  // consistency under failures: 6 random DOWN subsets per cluster, 3 tokens each
  for (let f = 0; f < 6; f++) {
    let c2 = cluster;
    for (const n of cluster.nodes) if (rnd() < [0, 0.2, 0.4, 0.6, 0.8, 1][f]) c2 = setNodeStatus(c2, n.id, "DOWN");
    const lines = topoLines(c2); const qs = [];
    for (let j = 0; j < 3; j++) { const t = rtok(); for (const L of LEVELS) { if (L === "LOCAL_QUORUM" && cfg.strategy === "SimpleStrategy") continue; lines.push(`CL ${t} ${L} dc1`); qs.push([t, L]); } }
    ask(lines, (res) => qs.forEach(([t, L], i) => {
      const [bf, st] = res[i].split(" ");
      const ev = evaluateConsistency(placeReplicas("k", t, c2), L, "dc1");
      const okB = ev.requiredResponses === Number(bf), okA = ev.satisfied === (st === "OK");
      K.cases++; if (okB) K.blockForMatch++; if (okA) K.availMatch++;
      const bl = (K.byLevel[L] ??= { cases: 0, blockForMatch: 0, availMatch: 0 }); bl.cases++; if (okB) bl.blockForMatch++; if (okA) bl.availMatch++;
      if (fitsRf) { Kfit.cases++; if (okB) Kfit.blockForMatch++; if (okA) Kfit.availMatch++; }
      if (!okB || !okA) ex("consistency", { cfg: `${cfg.strategy} dc=${cfg.numDataCenters} n/dc=${cfg.nodesPerDataCenter} rf=${cfg.replicationFactor}`, level: L, casslab: `${ev.requiredResponses} ${ev.satisfied ? "OK" : "UNAVAILABLE"}`, cassandra: res[i] });
    }));
  }
}
flush();
report.placement = { clusters: configs.length, ...P };
report.coordinator = C;
report.consistency = { ...K, realisticConfigs: Kfit };
report.ownership = O;

// =============== 5. Rebalancing (node addition) ===============
{
  const R = {};
  for (const [vn, nv] of [[false, 1], [true, 16], [true, 256]]) {
    const cfg = { mode: "advanced", strategy: "SimpleStrategy", replicationFactor: 1, consistencyLevel: "ONE", numDataCenters: 1, racksPerDataCenter: 1, nodesPerDataCenter: 5, virtualNodesEnabled: vn, numVirtualNodes: nv, hashWidth: 64 };
    const before = buildCluster(cfg); const rep = addNode(before, "dc1"); const after = rep.cluster;
    // Cassandra semantics: existing nodes keep their tokens; only ranges now owned by the new node move.
    const oldTok = new Map(before.nodes.map((n) => [n.id, String(vn ? n.vnodeTokens : [n.token])]));
    const kept = after.nodes.filter((n) => oldTok.has(n.id) && oldTok.get(n.id) === String(vn ? n.vnodeTokens : [n.token])).length;
    let moved = 0, toNew = 0; const N = 20000;
    for (let i = 0; i < N; i++) { const t = rtok(); const a = tokenToNode(t, before.nodes, vn).id, b = tokenToNode(t, after.nodes, vn).id; if (a !== b) { moved++; if (b === rep.addedNodeId) toNew++; } }
    R[vn ? `vnodes_${nv}` : "single_token"] = { existingNodesKeepTokens: `${kept}/${before.nodes.length}`, keysMovedPct: +(100 * moved / N).toFixed(2), keysMovedToNewNodePct: +(100 * toNew / N).toFixed(2), casslabReportedPct: rep.estimatedDataMovedPercent };
  }
  report.rebalancing = R;
}

const outFile = process.argv[3];
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, examples: report.examples.map((e) => JSON.stringify(e)) }, null, 2));
