import type { ReplicaPlacement } from "../../domain/types";

export type OperationKindFlow = "write" | "read" | "update" | "delete";

interface OperationFlowDiagramProps {
  placement?: ReplicaPlacement;
  stepKey: string;
  kind: OperationKindFlow;
  clientLabel?: string;
}

function coordinatorBadge(kind: OperationKindFlow, stepKey: string): string | null {
  if (kind === "write" && stepKey === "commitlog") return "COMMIT LOG";
  if (kind === "write" && stepKey === "memtable") return "MEMTABLE";
  if (kind === "read" && stepKey === "bloomfilter") return "BLOOM FILTER";
  if (kind === "read" && stepKey === "memtable_sstable") return "SSTABLE";
  if (kind === "update" && stepKey === "upsert") return "UPSERT";
  if (kind === "delete" && (stepKey === "marking" || stepKey === "propagation")) return "TOMBSTONE";
  return null;
}

const ACTIVE_FROM_STEP: Record<OperationKindFlow, Record<string, "client" | "coordinator" | "replicas" | "result">> = {
  write: {
    ready: "client",
    hashing: "coordinator",
    token: "coordinator",
    routing: "coordinator",
    commitlog: "replicas",
    memtable: "replicas",
    replication: "replicas",
    consistency: "replicas",
    result: "result",
  },
  read: {
    ready: "client",
    hashing: "coordinator",
    token: "coordinator",
    routing: "coordinator",
    bloomfilter: "replicas",
    memtable_sstable: "replicas",
    consistency: "replicas",
    result: "result",
  },
  update: {
    ready: "client",
    routing: "coordinator",
    send: "coordinator",
    upsert: "replicas",
    quorum: "replicas",
    result: "result",
  },
  delete: {
    request: "client",
    localization: "coordinator",
    propagation: "replicas",
    marking: "replicas",
    quorum: "replicas",
    result: "result",
  },
};

export function OperationFlowDiagram({ placement, stepKey, kind, clientLabel = "Client" }: OperationFlowDiagramProps) {
  const stage = ACTIVE_FROM_STEP[kind][stepKey] ?? "client";
  const badge = coordinatorBadge(kind, stepKey);
  const ackVisible = stage === "result";

  return (
    <div className="op-flow">
      <div className={`op-flow-node op-flow-client ${stage === "client" ? "active" : ""}`}>
        <div className="op-flow-icon">⌨</div>
        <div>{clientLabel}</div>
      </div>

      <div className={`op-flow-edge ${stage !== "client" ? "flowing" : ""}`} />

      <div className={`op-flow-node op-flow-coordinator ${stage === "coordinator" || badge ? "active" : ""}`}>
        <div className="op-flow-icon">⚙</div>
        <div>Coordinator</div>
        {badge && <span className="badge badge-danger op-flow-tag">{badge}</span>}
      </div>

      <div className={`op-flow-edge ${stage === "replicas" || stage === "result" ? "flowing" : ""}`} />

      <div className="op-flow-replicas">
        {!placement && <div className="hint">Build a cluster and select active data to see replicas.</div>}
        {placement?.replicas.map((node) => (
          <div key={node.id} className={`op-flow-node op-flow-replica ${stage === "replicas" || stage === "result" ? "active" : ""} ${node.status === "DOWN" ? "down" : ""}`}>
            <div className="op-flow-icon">▤</div>
            <div>{node.name}</div>
            <div className="hint">{node.dcId}</div>
            {node.id === placement.primary.id && <span className="badge badge-info op-flow-tag">PRIMARY</span>}
            {ackVisible && node.status === "UP" && <span className="badge badge-success op-flow-tag">ACK ✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
