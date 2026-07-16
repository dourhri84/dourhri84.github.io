# CassLab — Interactive Educational Simulator for Apache Cassandra

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-dourhri84.github.io-1b3358)](https://dourhri84.github.io/)

**Live demo:** [https://dourhri84.github.io/](https://dourhri84.github.io/) — no installation needed, runs directly in the browser.

CassLab is a client-only, dependency-free web application that simulates the internal mechanisms of Apache Cassandra — hashing, the token ring, replication, consistency levels, the gossip protocol, write/read/update/delete paths, node failures, rebalancing, hot partitions, and virtual nodes — for teaching and learning purposes. It does **not** connect to a real Cassandra cluster, Docker, or any backend: every simulation is computed locally, in the browser, in TypeScript.

This project follows an accompanying functional and technical specification: a client-side SPA built with React, TypeScript and SVG, organized as five conceptual layers (Presentation, Simulation Engine, Domain Model, Educational Engine, and an in-memory-only Persistence layer).

## Features

- **Cluster Configuration** — SimpleStrategy or NetworkTopologyStrategy, tunable replication factor, datacenters, racks, nodes, virtual nodes, and 16/32/64-bit hashing (64-bit uses a real Murmur3 implementation).
- **DDL Analysis** — a hand-written CQL parser that validates `CREATE TABLE` statements and explicitly separates Partition Key, Clustering Key, and Primary Key.
- **Full CRUD simulation** — animated Write, Read, Update (upsert), and Delete (tombstone) paths driven by the actual computed token/replica set for the data you enter.
- **Partitioning & Token Ring** — step-by-step hash → token → ring-lookup → coordinator resolution, with the real Murmur3 byte-level computation shown.
- **Failure Simulation** — take nodes, racks, or whole datacenters down and see live QUORUM/consistency math.
- **Rebalancing & Hot Partitions** — add/remove nodes and watch token ownership redistribute; simulate a hot partition to see load concentrate on one node.
- **Beginner / Advanced modes** — Beginner locks the configuration to a single, teaching-friendly setup; Advanced exposes every parameter.

## Quick start

```bash
npm install
npm run dev      # local dev server with hot reload
npm run build    # production build -> dist/
npm run preview  # preview the production build locally
```

## Deployment

`npm run build` produces a fully static `dist/` folder. It has no server-side requirements — drag-and-drop it onto Netlify, Vercel, GitHub Pages, Cloudflare Pages, or any static file host. The app uses a hash-based router (`/#/module-name`), so no server rewrite rules are needed. The live demo above is deployed straight from this repository via the included GitHub Actions workflow (`.github/workflows/deploy.yml`).

## Architecture

```
src/
  domain/            Plain, JSON-serializable domain types (Cluster, Node, TableSchema, ...)
  engine/             Pure-function simulation engine — no Cassandra dependency, no React
    hashing.ts          16/32-bit educational hashes + a real Murmur3 x64-128 implementation
    ring.ts              Token assignment, clockwise lookup, token-range computation
    replication.ts       SimpleStrategy / NetworkTopologyStrategy replica placement
    consistency.ts       ONE / QUORUM / ALL / LOCAL_QUORUM / EACH_QUORUM evaluation
    gossip.ts             Gossip tick simulation
    failure.ts            Node/rack/DC UP-DOWN mutation
    rebalancing.ts        Add/remove node, ring re-assignment
    hotPartitions.ts     Hot-partition load simulation
    operationPaths.ts    Step sequences for write/read/update/delete animations
    cqlParser.ts          Hand-written CREATE TABLE parser
    clusterBuilder.ts    Builds a Cluster from a ClusterConfig
  state/              Zustand global store + selector hooks
  data/               Tooltip glossary
  components/
    layout/             AppShell (4-zone layout), NavSidebar, EventLog, ModulePage
    common/              Reusable pieces: Tooltip, Stepper, TokenRingSvg, OperationFlowDiagram, ActiveDataBar
    modules/            One component per pedagogical module (see below)
```

### Design note: simulated, not connected

CassLab deliberately re-implements Cassandra's logic in TypeScript rather than driving a real, Dockerized cluster from the browser. That keeps the tool dependency-free (no server, no database, no container) and lets every internal step — the hash, the token, the replica set, the quorum decision — be computed and shown live for the learner's own data, rather than replayed from a fixed example. It also lets the tool explicitly separate **Partition Key**, **Clustering Key**, and **Primary Key** as three distinct outputs of the DDL parser, a distinction earlier classroom tools in this space have tended to collapse into a single "primary key" concept.

### Modules

Cluster Configuration · DDL Analysis · Insertion · Partitioning · Token Ring · Replica Placement · Consistency Level · Gossip · Write Path · Read Path · Update (Upsert) · Delete (Tombstones) · Failure Simulation · Rebalancing & Hot Partitions · Virtual Nodes (Advanced mode only).

### Beginner vs Advanced mode

Beginner mode locks the configuration to SimpleStrategy, a single datacenter/rack, no VNodes, a simplified 16-bit hash, and a mono-attribute primary key — matching a teaching-first default. Advanced mode unlocks NetworkTopologyStrategy, multiple datacenters/racks, VNodes, 16/32/64-bit hashing (64-bit uses a real Murmur3 implementation), and custom DDL.

### State & persistence

All simulation state (cluster, tables, rows, event log) lives in a single Zustand store, in memory only — reloading the page resets it, by design (no database, no localStorage for simulation state).

### Extending CassLab

The engine layer is pure functions operating on plain domain objects — to add a new mechanism, add a function to `engine/`, wire it into the Zustand store if it needs shared state, and build a module component under `components/modules/` using the existing `ModulePage`, `Stepper`, `TokenRingSvg` and `OperationFlowDiagram` building blocks for visual consistency.

## Survey / Feedback

"Survey / Feedback" in the navigation is an external link (opens in a new tab) to a Google Form, collecting satisfaction data from Cassandra practitioners and CS students — responses go straight to the linked Google Sheet. It intentionally isn't embedded in-app; see `SURVEY_URL` in `src/components/layout/NavSidebar.tsx` to change the link.

## Documentation

- [USER_GUIDE.md](USER_GUIDE.md) — end-user walkthrough of every module, written for learners.
- This README — architecture and developer-facing documentation.

## Citing this software

If you use CassLab in research or teaching, please cite the accompanying SoftwareX article (citation details to be added once published) and/or this repository directly, e.g.:

```
[Author name(s)]. CassLab: an in-browser simulator for teaching Apache Cassandra's
internal mechanisms [Computer software]. https://github.com/dourhri84/dourhri84.github.io
```

## License

CassLab is released under the [GNU General Public License v3.0](LICENSE).
