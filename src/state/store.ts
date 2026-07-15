import { create } from "zustand";
import type {
  Cluster,
  ClusterConfig,
  ConsistencyLevel,
  EventLogEntry,
  RowValue,
  SimulatorMode,
  TableRow,
  TableSchema,
} from "../domain/types";
import { buildCluster, DEFAULT_CLUSTER_CONFIG, ADVANCED_DEFAULT_CLUSTER_CONFIG } from "../engine/clusterBuilder";
import { addNode as engineAddNode, removeNode as engineRemoveNode } from "../engine/rebalancing";
import { setDcStatus, setNodeStatus, setRackStatus, resetAllNodes } from "../engine/failure";

let idCounter = 1;
function nextId(prefix: string): string {
  return `${prefix}-${idCounter++}-${Date.now().toString(36)}`;
}

/** The partition key value, as a string — this is what actually gets
 * hashed to a token (clustering columns don't affect placement, only
 * on-disk ordering within a partition). Use for routing/hashing, not
 * for showing a row to the user: rows sharing a partition key would be
 * indistinguishable. */
export function rowKeyString(schema: TableSchema | undefined, row: TableRow): string {
  if (!schema) return row.id;
  return schema.partitionKeyColumns.map((c) => String(row.values[c] ?? "")).join("|") || row.id;
}

/** Full primary key (partition + clustering columns), for uniquely
 * labeling a row in the UI — several rows can share a partition key, but
 * never a full primary key. */
export function rowDisplayLabel(schema: TableSchema | undefined, row: TableRow): string {
  if (!schema) return row.id;
  return schema.primaryKey.map((c) => String(row.values[c] ?? "")).join(" / ") || row.id;
}

interface CassLabState {
  mode: SimulatorMode;
  setMode: (mode: SimulatorMode) => void;

  clusterConfig: ClusterConfig;
  setClusterConfig: (partial: Partial<ClusterConfig>) => void;
  cluster: Cluster | null;
  buildClusterNow: () => void;

  setNodeStatusAction: (nodeId: string, status: "UP" | "DOWN") => void;
  setRackStatusAction: (rackId: string, status: "UP" | "DOWN") => void;
  setDcStatusAction: (dcId: string, status: "UP" | "DOWN") => void;
  resetFailures: () => void;

  addNodeToCluster: (dcId: string) => void;
  removeNodeFromCluster: (nodeId: string) => void;

  tables: TableSchema[];
  addTable: (schema: TableSchema) => void;

  rows: TableRow[];
  insertRow: (tableId: string, values: Record<string, RowValue>) => TableRow;
  updateRow: (rowId: string, values: Record<string, RowValue>) => void;
  deleteRow: (rowId: string) => void;
  purgeRow: (rowId: string) => void;

  activeTableId: string | null;
  setActiveTableId: (id: string | null) => void;
  activeRowId: string | null;
  setActiveRowId: (id: string | null) => void;

  eventLog: EventLogEntry[];
  log: (message: string, level?: EventLogEntry["level"]) => void;
  clearEventLog: () => void;
}

export const useCassLabStore = create<CassLabState>((set, get) => ({
  mode: "beginner",
  setMode: (mode) => {
    const config = mode === "beginner" ? DEFAULT_CLUSTER_CONFIG : ADVANCED_DEFAULT_CLUSTER_CONFIG;
    set({ mode, clusterConfig: { ...config, mode } });
    get().log(`Switched to ${mode} mode.`, "info");
  },

  clusterConfig: { ...DEFAULT_CLUSTER_CONFIG },
  setClusterConfig: (partial) => set((s) => ({ clusterConfig: { ...s.clusterConfig, ...partial } })),
  cluster: null,
  buildClusterNow: () => {
    const cluster = buildCluster(get().clusterConfig);
    set({ cluster });
    get().log(
      `Cluster built: ${cluster.config.strategy}, RF=${cluster.config.replicationFactor}, ${cluster.dataCenters.length} DC(s), ${cluster.nodes.length} node(s)${cluster.config.virtualNodesEnabled ? `, VNodes=${cluster.config.numVirtualNodes}` : ""}.`,
      "success",
    );
  },

  setNodeStatusAction: (nodeId, status) => {
    const cluster = get().cluster;
    if (!cluster) return;
    set({ cluster: setNodeStatus(cluster, nodeId, status) });
    const node = cluster.nodes.find((n) => n.id === nodeId);
    get().log(`${node?.name ?? nodeId} marked ${status}.`, status === "DOWN" ? "warning" : "success");
  },
  setRackStatusAction: (rackId, status) => {
    const cluster = get().cluster;
    if (!cluster) return;
    set({ cluster: setRackStatus(cluster, rackId, status) });
    get().log(`Rack ${rackId} marked ${status}.`, status === "DOWN" ? "warning" : "success");
  },
  setDcStatusAction: (dcId, status) => {
    const cluster = get().cluster;
    if (!cluster) return;
    set({ cluster: setDcStatus(cluster, dcId, status) });
    get().log(`Datacenter ${dcId} marked ${status}.`, status === "DOWN" ? "warning" : "success");
  },
  resetFailures: () => {
    const cluster = get().cluster;
    if (!cluster) return;
    set({ cluster: resetAllNodes(cluster) });
    get().log("All nodes reset to UP.", "info");
  },

  addNodeToCluster: (dcId) => {
    const cluster = get().cluster;
    if (!cluster) return;
    const report = engineAddNode(cluster, dcId);
    set({ cluster: report.cluster });
    get().log(
      `Node added to ${dcId}. Estimated ~${report.estimatedDataMovedPercent}% of data redistributed.`,
      "success",
    );
  },
  removeNodeFromCluster: (nodeId) => {
    const cluster = get().cluster;
    if (!cluster) return;
    const node = cluster.nodes.find((n) => n.id === nodeId);
    const report = engineRemoveNode(cluster, nodeId);
    set({ cluster: report.cluster });
    get().log(
      `${node?.name ?? nodeId} removed. Estimated ~${report.estimatedDataMovedPercent}% of data redistributed.`,
      "warning",
    );
  },

  tables: [],
  addTable: (schema) => {
    set((s) => ({ tables: [...s.tables, schema], activeTableId: schema.id }));
    get().log(`Table '${schema.name}' created (partition key: ${schema.partitionKeyColumns.join(", ")}${schema.clusteringKeyColumns.length ? `; clustering: ${schema.clusteringKeyColumns.join(", ")}` : ""}).`, "success");
  },

  rows: [],
  insertRow: (tableId, values) => {
    const row: TableRow = { id: nextId("row"), tableId, values, writeTimestamp: Date.now() };
    set((s) => ({ rows: [...s.rows, row], activeRowId: row.id, activeTableId: tableId }));
    const schema = get().tables.find((t) => t.id === tableId);
    get().log(`Inserted row '${rowDisplayLabel(schema, row)}' into '${schema?.name ?? tableId}'.`, "success");
    return row;
  },
  updateRow: (rowId, values) => {
    set((s) => ({
      rows: s.rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, ...values }, writeTimestamp: Date.now() } : r)),
    }));
    const row = get().rows.find((r) => r.id === rowId);
    const schema = get().tables.find((t) => t.id === row?.tableId);
    get().log(`Updated row '${row ? rowDisplayLabel(schema, row) : rowId}' (upsert, new timestamp).`, "success");
  },
  deleteRow: (rowId) => {
    set((s) => ({ rows: s.rows.map((r) => (r.id === rowId ? { ...r, tombstonedAt: Date.now() } : r)) }));
    const row = get().rows.find((r) => r.id === rowId);
    const schema = get().tables.find((t) => t.id === row?.tableId);
    get().log(`Deleted row '${row ? rowDisplayLabel(schema, row) : rowId}' (tombstone written).`, "warning");
  },
  purgeRow: (rowId) => {
    const row = get().rows.find((r) => r.id === rowId);
    const schema = get().tables.find((t) => t.id === row?.tableId);
    set((s) => ({ rows: s.rows.filter((r) => r.id !== rowId) }));
    get().log(`Compaction purged tombstoned row '${row ? rowDisplayLabel(schema, row) : rowId}'.`, "info");
  },

  activeTableId: null,
  setActiveTableId: (id) => set({ activeTableId: id }),
  activeRowId: null,
  setActiveRowId: (id) => set({ activeRowId: id }),

  eventLog: [],
  log: (message, level = "info") =>
    set((s) => ({
      eventLog: [{ id: nextId("evt"), timestamp: Date.now(), message, level }, ...s.eventLog].slice(0, 200),
    })),
  clearEventLog: () => set({ eventLog: [] }),
}));

export function activeConsistencyLevel(): ConsistencyLevel {
  return useCassLabStore.getState().clusterConfig.consistencyLevel;
}
