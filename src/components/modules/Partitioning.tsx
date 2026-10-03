import { useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { Stepper } from "../common/Stepper";
import { TokenRingSvg } from "../common/TokenRingSvg";
import { Tooltip } from "../common/Tooltip";
import { useCassLabStore } from "../../state/store";
import { computeHash } from "../../engine/hashing";
import { tokenRangeContaining } from "../../engine/ring";
import { placeReplicas } from "../../engine/replication";
import type { ClusterNode, OperationStep } from "../../domain/types";

// Three distinct notions, which this module keeps apart on purpose:
//  1. COORDINATOR      - the node the client sends the request to. Chosen by
//                        the client/driver BEFORE any hashing; any node can
//                        coordinate. It does not depend on data ownership.
//  2. TOKEN OWNER      - the node owning the token range that contains the
//                        partition's token (first ring point clockwise).
//                        It is the primary replica.
//  3. REPLICA SET      - the RF nodes chosen by the replication strategy,
//                        starting from the token owner.
const STEPS: OperationStep[] = [
  {
    key: "coordinator",
    label: "Coordinator",
    description:
      "The client sends the request to one node of the cluster, which becomes the coordinator of this request. Any node can coordinate; the driver chooses it (e.g. round-robin, or token-aware routing that targets a replica). This choice is made before hashing and does not depend on who stores the data.",
  },
  {
    key: "hashing",
    label: "Hashing",
    description: "The coordinator hashes the serialized partition key with the partitioner's hash function (Murmur3 in 64-bit mode).",
  },
  {
    key: "token",
    label: "Token",
    description: "The hash gives the partition's token: its position on the token ring.",
  },
  {
    key: "owner",
    label: "Token ownership",
    description:
      "Walking the ring clockwise from the token, the first ring point met closes the token range (previous point, this point] that contains the partition. The node owning that range is the token owner, i.e. the primary replica.",
  },
  {
    key: "replicas",
    label: "Replica placement",
    description:
      "The replication strategy adds the other replicas, starting from the token owner, until the replication factor is reached (per datacenter with NetworkTopologyStrategy, spreading over racks).",
  },
  {
    key: "routing",
    label: "Request routing",
    description:
      "The coordinator forwards the request to the replicas and waits for as many responses as the consistency level requires. If the coordinator is itself a replica, it also serves the request locally.",
  },
];

const TOKEN_AWARE = "__token_aware__";

export function PartitioningPage() {
  const cluster = useCassLabStore((s) => s.cluster);
  const [key, setKey] = useState("user_42");
  const [stepIndex, setStepIndex] = useState(0);
  const [coordinatorChoice, setCoordinatorChoice] = useState<string>("");

  if (!cluster) {
    return (
      <ModulePage
        title="Partitioning"
        description="Build a cluster first."
        canvas={<p className="hint">No cluster built yet. Go to Cluster Configuration.</p>}
        panel={<p className="hint">Nothing to show.</p>}
      />
    );
  }

  const width = cluster.config.hashWidth;
  const vnodes = cluster.config.virtualNodesEnabled;
  const hash = key ? computeHash(key, width) : undefined;
  const range = hash ? tokenRangeContaining(hash.token, cluster.nodes, vnodes) : undefined;
  const owner = range ? cluster.nodes.find((n) => n.id === range.nodeId) : undefined;
  const placement = hash ? placeReplicas(key, hash.token, cluster) : undefined;
  const replicas = placement?.replicas ?? [];
  const localDcId = cluster.dataCenters[0]?.id;

  // Coordinator: a node explicitly chosen by the user (the client contacts
  // it), or token-aware routing (the driver computes the token itself and
  // contacts a replica of the local datacenter).
  const choice = coordinatorChoice || cluster.nodes[0]?.id || TOKEN_AWARE;
  const tokenAware = choice === TOKEN_AWARE;
  const coordinator: ClusterNode | undefined = tokenAware
    ? replicas.find((r) => r.dcId === localDcId && r.status === "UP") ?? replicas.find((r) => r.status === "UP")
    : cluster.nodes.find((n) => n.id === choice);
  const coordinatorIsReplica = !!coordinator && replicas.some((r) => r.id === coordinator.id);

  const show = (stepKey: string) => STEPS.findIndex((s) => s.key === stepKey) <= stepIndex;
  const pending = <span className="pending">revealed at a later step</span>;
  const nodeLabel = (n: ClusterNode) => `${n.name} (${n.dcId}, ${n.rackId})`;

  const ringHighlight = show("replicas") ? replicas.map((r) => r.id) : show("owner") && owner ? [owner.id] : undefined;
  const markerLabel = show("owner") && owner ? `token → ${owner.name}` : show("token") ? "token" : undefined;

  return (
    <ModulePage
      title="Partitioning"
      description="Follow a request for one partition key and keep apart three roles: the coordinator (the node the client contacts), the token owner (the node owning the token range of the key) and the replicas (the nodes storing a copy)."
      canvas={
        <div>
          <div className="flex-row" style={{ gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ maxWidth: 280, marginBottom: 0 }}>
              <label>
                <Tooltip term="Partition Key" /> (text)
              </label>
              <input type="text" value={key} onChange={(e) => setKey(e.target.value)} />
            </div>
            <div className="field" style={{ maxWidth: 320, marginBottom: 0 }}>
              <label>
                <Tooltip term="Coordinator" /> contacted by the client
              </label>
              <select value={choice} onChange={(e) => setCoordinatorChoice(e.target.value)}>
                {cluster.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {nodeLabel(n)}
                    {n.status === "DOWN" ? " — DOWN" : ""}
                  </option>
                ))}
                <option value={TOKEN_AWARE}>Token-aware driver (contacts a replica)</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <Stepper steps={STEPS} activeIndex={stepIndex} onChange={setStepIndex} />
          </div>

          {show("hashing") && hash && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h4>Hash computation ({width}-bit) — performed by the coordinator</h4>
              <div className="mono" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
                {hash.steps.slice(0, show("token") ? hash.steps.length : Math.max(1, hash.steps.length - 1)).join("\n")}
              </div>
            </div>
          )}

          {show("token") && hash && (
            <TokenRingSvg
              cluster={cluster}
              highlightToken={hash.token}
              highlightNodeIds={ringHighlight}
              markerLabel={markerLabel}
            />
          )}

          {show("routing") && coordinator && (
            <div className={coordinator.status === "DOWN" ? "error-box" : "success-box"} style={{ marginTop: 12 }}>
              {coordinator.status === "DOWN" ? (
                <>
                  {coordinator.name} is DOWN: the client cannot use it as coordinator and must contact another node.
                </>
              ) : coordinatorIsReplica ? (
                <>
                  Coordinator {coordinator.name} is also a replica of this partition: it serves the request locally
                  and forwards it to the {replicas.length - 1} other replica(s).
                </>
              ) : (
                <>
                  Coordinator {coordinator.name} is not a replica of this partition: it stores nothing for this key
                  and forwards the request to the {replicas.length} replica(s).
                </>
              )}
            </div>
          )}
        </div>
      }
      panel={
        <div>
          <h4>Three distinct roles</h4>
          <table className="role-table">
            <tbody>
              <tr>
                <th>Coordinator</th>
                <td>
                  {tokenAware ? (
                    show("replicas") && coordinator ? (
                      <>
                        <strong>{coordinator.name}</strong> — chosen by the token-aware driver among the replicas
                        {localDcId ? ` of the local datacenter (${localDcId})` : ""}
                      </>
                    ) : (
                      <>a replica, selected by the token-aware driver</>
                    )
                  ) : coordinator ? (
                    <>
                      <strong>{coordinator.name}</strong> — the node the client contacts
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
              <tr>
                <th>Partition key</th>
                <td>
                  <strong>{key || "—"}</strong>
                </td>
              </tr>
              <tr>
                <th>
                  <Tooltip term="Token" />
                </th>
                <td className="mono">{show("token") && hash ? hash.token.toString() : pending}</td>
              </tr>
              <tr>
                <th>Token range</th>
                <td className="mono" style={{ fontSize: 11 }}>
                  {show("owner") && range ? (
                    <>
                      ({range.start.toString()}, {range.end.toString()}]{range.wraps ? " (wraps around the ring)" : ""}
                    </>
                  ) : (
                    pending
                  )}
                </td>
              </tr>
              <tr>
                <th>Token owner (primary replica)</th>
                <td>{show("owner") && owner ? <strong>{nodeLabel(owner)}</strong> : pending}</td>
              </tr>
              <tr>
                <th>
                  Replicas (
                  {cluster.config.strategy === "SimpleStrategy"
                    ? `RF=${cluster.config.replicationFactor}`
                    : cluster.dataCenters.map((d) => `${d.id}:${d.replicationFactor}`).join(", ")}
                  )
                </th>
                <td>
                  {show("replicas") ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {replicas.map((r) => (
                        <li key={r.id}>
                          {nodeLabel(r)}
                          {r.id === owner?.id ? " — primary" : ""}
                          {r.status === "DOWN" ? " — DOWN" : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    pending
                  )}
                </td>
              </tr>
              <tr>
                <th>Coordinator is a replica?</th>
                <td>{show("routing") && coordinator ? (coordinatorIsReplica ? "yes" : "no") : pending}</td>
              </tr>
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 12 }}>
            Data ownership is a property of the ring (token → owner → replicas). The coordinator is a property of
            the request: it only routes the request and waits for the replicas' answers.
          </p>
        </div>
      }
    />
  );
}
