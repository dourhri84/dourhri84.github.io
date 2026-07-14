# CassLab — Interactive Educational Simulator for Apache Cassandra

CassLab is a client-only, dependency-free web application that simulates the internal mechanisms of Apache Cassandra — hashing, the token ring, replication, consistency levels, the gossip protocol, write/read/update/delete paths, node failures, rebalancing, hot partitions, and virtual nodes — for teaching and learning purposes. It does **not** connect to a real Cassandra cluster, Docker, or any backend: every simulation is computed locally, in the browser, in TypeScript.

This project follows the accompanying *cahier des charges* (functional & technical specification): a client-side SPA built with React, TypeScript and SVG, organized as five conceptual layers (Presentation, Simulation Engine, Domain Model, Educational Engine, and an in-memory-only Persistence layer).

## Quick start

```bash
npm install
npm run dev      # local dev server with hot reload
npm run build    # production build -> dist/
npm run preview  # preview the production build locally
```

## Deployment

`npm run build` produces a fully static `dist/` folder. It has no server-side requirements — drag-and-drop it onto Netlify, Vercel, GitHub Pages, Cloudflare Pages, or any static file host. The app uses a hash-based router (`/#/module-name`), so no server rewrite rules are needed.

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
  data/               Tooltip glossary + guided-scenario definitions
  components/
    layout/             AppShell (4-zone layout), NavSidebar, EventLog, ModulePage
    common/              Reusable pieces: Tooltip, Stepper, TokenRingSvg, OperationFlowDiagram, ActiveDataBar
    modules/            One component per pedagogical module (see below)
```

### Why this differs from a "connect to a real cluster" approach

An earlier student project (SimCassandra) wired a React frontend to a real 6-node Dockerized Cassandra cluster via a FastAPI backend. That requires Docker and a server, which fails the "runs entirely in a browser, nothing to install" goal — and it also collapsed Partition Key, Clustering Key and Primary Key into a single "Primary Key" concept. CassLab is a from-scratch simulator: the `engine/` layer re-implements Cassandra's logic (including a real Murmur3 hash) directly in TypeScript, and `cqlParser.ts` explicitly separates Partition Key from Clustering Key from Primary Key when analyzing a `CREATE TABLE` statement.

### Modules

Cluster Configuration · DDL Analysis · Insertion · Partitioning · Token Ring · Replica Placement · Consistency Level · Gossip · Write Path · Read Path · Update (Upsert) · Delete (Tombstones) · Failure Simulation · Rebalancing & Hot Partitions · Virtual Nodes · Guided Scenarios · Survey/Feedback.

### Beginner vs Advanced mode

Beginner mode locks the configuration to SimpleStrategy, a single datacenter/rack, no VNodes, a simplified 16-bit hash, and a mono-attribute primary key — matching the spec's teaching-first default. Advanced mode unlocks NetworkTopologyStrategy, multiple datacenters/racks, VNodes, 16/32/64-bit hashing (64-bit uses a real Murmur3 implementation), and custom DDL.

### State & persistence

All simulation state (cluster, tables, rows, event log) lives in a single Zustand store, in memory only — reloading the page resets it, by design (no database, no localStorage for simulation state; only the Survey module persists locally via `localStorage` as a fallback when no external form endpoint is configured).

### Extending CassLab

The engine layer is pure functions operating on plain domain objects — to add a new mechanism, add a function to `engine/`, wire it into the Zustand store if it needs shared state, and build a module component under `components/modules/` using the existing `ModulePage`, `Stepper`, `TokenRingSvg` and `OperationFlowDiagram` building blocks for visual consistency.

## Survey / Feedback

The in-app Survey module is designed to collect satisfaction data from ~1000 users (Cassandra practitioners and CS students) without requiring CassLab itself to run a backend. Configure `VITE_SURVEY_ENDPOINT` (a `.env` file, e.g. a Formspree endpoint) at build time to have responses POSTed there; responses are always also saved to the visitor's own browser `localStorage` as a fallback/export option.

## License

See the project's chosen license for the CassLab codebase (align with the intended SoftwareX submission).
