// Domain model for CassLab. Plain, JSON-serializable objects mirroring
// Cassandra's internal concepts (Cluster, DataCenter, Rack, Node, VNode,
// Token, Partition, Replica, Keyspace, Table, Operation).

export type ReplicationStrategy = "SimpleStrategy" | "NetworkTopologyStrategy";

export type ConsistencyLevel =
  | "ONE"
  | "QUORUM"
  | "ALL"
  | "LOCAL_QUORUM"
  | "EACH_QUORUM";

export type HashWidth = 16 | 32 | 64;

export type SimulatorMode = "beginner" | "advanced";

export interface Rack {
  id: string;
  name: string;
}

export interface VNode {
  id: string;
  token: bigint;
  nodeId: string;
}

export type NodeStatus = "UP" | "DOWN";

export interface ClusterNode {
  id: string;
  name: string;
  dcId: string;
  rackId: string;
  ip: string;
  status: NodeStatus;
  /** Primary token when VNodes are disabled. */
  token: bigint;
  /** Token list when VNodes are enabled (includes `token` split into many). */
  vnodeTokens: bigint[];
}

export interface DataCenter {
  id: string;
  name: string;
  racks: Rack[];
  replicationFactor: number;
}

export interface ClusterConfig {
  mode: SimulatorMode;
  strategy: ReplicationStrategy;
  replicationFactor: number;
  consistencyLevel: ConsistencyLevel;
  numDataCenters: number;
  racksPerDataCenter: number;
  nodesPerDataCenter: number;
  virtualNodesEnabled: boolean;
  numVirtualNodes: number;
  hashWidth: HashWidth;
}

export interface Cluster {
  config: ClusterConfig;
  dataCenters: DataCenter[];
  nodes: ClusterNode[];
  builtAt: number;
}

export type CqlType =
  | "text"
  | "int"
  | "real"
  | "float"
  | "date"
  | "datetime"
  | "uuid"
  | "timeuuid"
  | "time"
  | "boolean";

export interface ColumnDefinition {
  name: string;
  type: CqlType;
}

export interface TableSchema {
  id: string;
  name: string;
  ddl: string;
  columns: ColumnDefinition[];
  partitionKeyColumns: string[];
  clusteringKeyColumns: string[];
  /** Derived: partitionKeyColumns + clusteringKeyColumns, in that order. */
  primaryKey: string[];
  createdAt: number;
}

export interface CqlParseError {
  message: string;
  position?: number;
}

export interface CqlParseResult {
  ok: boolean;
  schema?: TableSchema;
  error?: CqlParseError;
}

export type RowValue = string | number | boolean | null;

export interface TableRow {
  id: string;
  tableId: string;
  values: Record<string, RowValue>;
  /** Write timestamp (microsecond-like epoch used for LWW comparisons). */
  writeTimestamp: number;
  /** Set when the row has been deleted (tombstoned) but not yet compacted. */
  tombstonedAt?: number;
}

export interface HashResult {
  key: string;
  width: HashWidth;
  steps: string[];
  /** Raw unsigned hash before folding to a signed token range. */
  hash: bigint;
  /** Token in Cassandra's signed range for the configured width. */
  token: bigint;
}

export interface TokenRange {
  nodeId: string;
  start: bigint;
  end: bigint;
}

export interface ReplicaPlacement {
  key: string;
  token: bigint;
  primary: ClusterNode;
  replicas: ClusterNode[];
}

export type OperationKind = "write" | "read" | "update" | "delete";

export interface OperationStep {
  key: string;
  label: string;
  description: string;
}

export interface EventLogEntry {
  id: string;
  timestamp: number;
  message: string;
  level: "info" | "success" | "warning" | "error";
}
