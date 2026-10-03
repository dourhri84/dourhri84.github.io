import { useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { ActiveDataBar } from "../common/ActiveDataBar";
import { useActiveRow } from "../../state/useActiveRow";
import { placeReplicas } from "../../engine/replication";
import { evaluateConsistency } from "../../engine/consistency";
import { useCassLabStore } from "../../state/store";
import { Tooltip } from "../common/Tooltip";
import type { ConsistencyLevel } from "../../domain/types";

// This module keeps five notions explicitly apart:
//  - physical nodes        : the machines of the cluster (UP or DOWN);
//  - replicas              : the nodes that store the active partition;
//  - replication factor    : the CONFIGURED number of copies (per DC with NTS);
//  - replica availability  : how many of those replicas are currently UP;
//  - CL satisfaction       : whether enough replicas are UP for the chosen CL,
//                            otherwise Cassandra rejects the request with an
//                            UnavailableException before contacting replicas.

const LEVELS: ConsistencyLevel[] = ["ONE", "QUORUM", "ALL", "LOCAL_QUORUM", "EACH_QUORUM"];

export function FailurePage() {
  const { key, hash, cluster } = useActiveRow();
  const setNodeStatusAction = useCassLabStore((s) => s.setNodeStatusAction);
  const setDcStatusAction = useCassLabStore((s) => s.setDcStatusAction);
  const resetFailures = useCassLabStore((s) => s.resetFailures);
  const setConsistencyLevel = useCassLabStore((s) => s.setConsistencyLevel);
  const [localDc, setLocalDc] = useState<string>("");

  if (!cluster) {
    return (
      <ModulePage
        title="Failures & Quorum"
        description="Build a cluster first."
        canvas={<p className="hint">No cluster built yet.</p>}
        panel={<p className="hint">Nothing to show.</p>}
      />
    );
  }

  const isNts = cluster.config.strategy === "NetworkTopologyStrategy";
  const level = cluster.config.consistencyLevel;
  const localDcId = localDc || cluster.dataCenters[0]?.id;
  const placement = key && hash ? placeReplicas(key, hash.token, cluster) : undefined;
  const evaluation = placement ? evaluateConsistency(placement, level, localDcId) : undefined;
  const replicaIds = new Set(placement?.replicas.map((r) => r.id) ?? []);

  const upNodes = cluster.nodes.filter((n) => n.status === "UP").length;
  const rfByDc = cluster.dataCenters.map((dc) => ({ dc: dc.id, rf: isNts ? dc.replicationFactor : cluster.config.replicationFactor }));
  const totalRf = isNts ? rfByDc.reduce((a, b) => a + b.rf, 0) : cluster.config.replicationFactor;
  const q = (n: number) => Math.floor(n / 2) + 1;

  // Human-readable derivation of the number of required responses.
  let requirement = "";
  if (evaluation) {
    switch (level) {
      case "ONE":
        requirement = "ONE → 1 replica must respond";
        break;
      case "QUORUM":
        requirement = `QUORUM → floor(${totalRf} / 2) + 1 = ${q(totalRf)} replicas, over all datacenters`;
        break;
      case "ALL":
        requirement = `ALL → all ${totalRf} replicas must respond`;
        break;
      case "LOCAL_QUORUM": {
        const rf = isNts ? (rfByDc.find((d) => d.dc === localDcId)?.rf ?? 0) : totalRf;
        requirement = `LOCAL_QUORUM → floor(${rf} / 2) + 1 = ${q(rf)} replicas in the coordinator's datacenter (${localDcId})`;
        break;
      }
      case "EACH_QUORUM":
        requirement = isNts
          ? `EACH_QUORUM → ${rfByDc.map((d) => `${d.dc}: floor(${d.rf} / 2) + 1 = ${q(d.rf)}`).join("; ")}`
          : `EACH_QUORUM (single DC) → floor(${totalRf} / 2) + 1 = ${q(totalRf)}`;
        break;
    }
  }
  const availableForLevel =
    evaluation && placement
      ? level === "LOCAL_QUORUM"
        ? placement.replicas.filter((r) => r.dcId === localDcId && r.status === "UP").length
        : evaluation.availableReplicas
      : 0;

  return (
    <ModulePage
      title="Failures &amp; Quorum"
      description={
        <>
          Take physical nodes or whole datacenters down and see which <em>replicas</em> of the active partition remain
          available, and whether the <Tooltip term={level} /> consistency level can still be satisfied.
        </>
      }
      canvas={
        <div>
          <ActiveDataBar />

          <div className="flex-row" style={{ gap: 16, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Consistency level</label>
              <select value={level} onChange={(e) => setConsistencyLevel(e.target.value as ConsistencyLevel)}>
                {LEVELS.filter((l) => isNts || (l !== "LOCAL_QUORUM" && l !== "EACH_QUORUM")).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {isNts && cluster.dataCenters.length > 1 && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Coordinator's datacenter (local DC)</label>
                <select value={localDcId} onChange={(e) => setLocalDc(e.target.value)}>
                  {cluster.dataCenters.map((dc) => (
                    <option key={dc.id} value={dc.id}>
                      {dc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn" onClick={resetFailures}>
              Reset (all nodes UP)
            </button>
          </div>

          <h4 style={{ marginTop: 6 }}>
            Physical nodes ({upNodes} UP / {cluster.nodes.length - upNodes} DOWN)
          </h4>
          <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
            Every machine of the cluster. Only the highlighted nodes are replicas of the active partition; a failure of
            any other node does not affect this partition.
          </p>
          {cluster.dataCenters.map((dc) => {
            const dcNodes = cluster.nodes.filter((n) => n.dcId === dc.id);
            const dcDown = dcNodes.every((n) => n.status === "DOWN");
            return (
              <div key={dc.id} className="dc-group">
                <div className="flex-row" style={{ justifyContent: "space-between" }}>
                  <h5>
                    {dc.name}
                    {isNts ? ` — RF ${dc.replicationFactor}` : ""}
                  </h5>
                  {cluster.dataCenters.length > 1 && (
                    <button className="btn" onClick={() => setDcStatusAction(dc.id, dcDown ? "UP" : "DOWN")}>
                      {dcDown ? `Bring ${dc.name} UP` : `Take ${dc.name} DOWN`}
                    </button>
                  )}
                </div>
                <div className="node-grid">
                  {dcNodes.map((node) => {
                    const isReplica = replicaIds.has(node.id);
                    const isPrimary = placement?.primary.id === node.id;
                    return (
                      <div
                        key={node.id}
                        className={`node-card ${node.status === "DOWN" ? "down" : ""} ${isReplica ? "replica" : ""} ${isPrimary ? "primary" : ""}`}
                      >
                        <div className="node-card-name">{node.name}</div>
                        <div className="node-card-meta">
                          {node.ip} · {node.rackId.replace(`${node.dcId}-`, "")}
                        </div>
                        <div className="flex-row" style={{ justifyContent: "center", gap: 4 }}>
                          <span className={`badge ${node.status === "UP" ? "badge-success" : "badge-danger"}`}>
                            {node.status}
                          </span>
                          {placement && (
                            <span className={`badge ${isReplica ? "badge-info" : ""}`}>
                              {isPrimary ? "PRIMARY REPLICA" : isReplica ? "REPLICA" : "not a replica"}
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <button
                            className="btn"
                            onClick={() => setNodeStatusAction(node.id, node.status === "UP" ? "DOWN" : "UP")}
                          >
                            {node.status === "UP" ? "Simulate down" : "Bring up"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {!placement ? (
            <p className="hint">Select active data first (Insertion module) to see its replicas.</p>
          ) : (
            evaluation && (
              <>
                <h4 style={{ marginTop: 16 }}>From physical nodes to the consistency decision</h4>
                <table className="role-table">
                  <tbody>
                    <tr>
                      <th>1. Physical nodes</th>
                      <td>
                        {cluster.nodes.length} nodes in {cluster.dataCenters.length} datacenter(s): {upNodes} UP,{" "}
                        {cluster.nodes.length - upNodes} DOWN
                      </td>
                    </tr>
                    <tr>
                      <th>
                        2. <Tooltip term="Replication Factor (RF)">Replication factor</Tooltip> (configured)
                      </th>
                      <td>
                        {isNts
                          ? `${rfByDc.map((d) => `${d.dc}: ${d.rf}`).join(", ")} → ${totalRf} copies of each partition`
                          : `RF = ${totalRf} → ${totalRf} copies of each partition`}
                      </td>
                    </tr>
                    <tr>
                      <th>3. Replicas of this partition</th>
                      <td>
                        {placement.replicas.map((r) => r.name).join(", ")}
                        {placement.replicas.length < totalRf
                          ? ` (only ${placement.replicas.length}: fewer nodes than the RF)`
                          : ""}
                      </td>
                    </tr>
                    <tr>
                      <th>4. Replica availability</th>
                      <td>
                        {evaluation.availableReplicas} of {evaluation.totalReplicas} replicas UP
                        {evaluation.perDc.length > 1 &&
                          ` (${evaluation.perDc.map((d) => `${d.dcId}: ${d.available}/${d.total}`).join(", ")})`}
                      </td>
                    </tr>
                    <tr>
                      <th>5. Required responses</th>
                      <td>{requirement}</td>
                    </tr>
                    <tr>
                      <th>6. Consistency level satisfied?</th>
                      <td>
                        {level === "EACH_QUORUM" && isNts
                          ? evaluation.perDc.map((d) => `${d.dcId}: ${d.available} ≥ ${d.required}? ${d.satisfied ? "yes" : "no"}`).join("; ")
                          : `${availableForLevel} available ≥ ${evaluation.requiredResponses} required? ${evaluation.satisfied ? "yes" : "no"}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className={evaluation.satisfied ? "success-box" : "error-box"} style={{ marginTop: 12 }}>
                  {evaluation.satisfied ? (
                    <>
                      <strong>SUCCESS</strong> — the coordinator can satisfy {level}: the request is sent to the live
                      replicas.
                    </>
                  ) : (
                    <>
                      <strong>UnavailableException</strong> — too few live replicas for {level}: the coordinator
                      rejects the request without contacting the replicas.
                    </>
                  )}
                </div>
              </>
            )
          )}
        </div>
      }
      panel={
        <div>
          <h4>Five notions not to confuse</h4>
          <ul className="param-list" style={{ display: "block" }}>
            <li style={{ display: "block" }}>
              <strong>Physical node</strong>
              <div className="hint">A machine of the cluster. It can be UP or DOWN.</div>
            </li>
            <li style={{ display: "block" }}>
              <strong>Replica</strong>
              <div className="hint">
                A node that stores a copy of a given partition. The replicas of a key are chosen by the replication
                strategy from the key's token; other nodes hold no copy of it.
              </div>
            </li>
            <li style={{ display: "block" }}>
              <strong>Replication factor (RF)</strong>
              <div className="hint">
                The configured number of copies — per datacenter with NetworkTopologyStrategy. It does not change when
                nodes fail.
              </div>
            </li>
            <li style={{ display: "block" }}>
              <strong>Replica availability</strong>
              <div className="hint">How many replicas of this partition are currently UP.</div>
            </li>
            <li style={{ display: "block" }}>
              <strong>Consistency-level satisfaction</strong>
              <div className="hint">
                The CL fixes how many replicas must answer, computed from the RF (not from the live nodes). If fewer
                replicas are available, Cassandra fails fast with an UnavailableException.
              </div>
            </li>
          </ul>
        </div>
      }
    />
  );
}
