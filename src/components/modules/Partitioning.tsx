import { useState } from "react";
import { ModulePage } from "../layout/ModulePage";
import { Stepper } from "../common/Stepper";
import { TokenRingSvg } from "../common/TokenRingSvg";
import { useCassLabStore } from "../../state/store";
import { computeHash } from "../../engine/hashing";
import { tokenToNode } from "../../engine/ring";
import type { OperationStep } from "../../domain/types";

const STEPS: OperationStep[] = [
  { key: "key", label: "Partition Key", description: "The client provides a partition key to locate." },
  { key: "hashing", label: "Hashing", description: "The coordinator applies the configured hash function to the key." },
  { key: "token", label: "Token", description: "The hash is folded into a signed token on the ring." },
  { key: "ring", label: "Ring Lookup", description: "The ring is walked clockwise from the token to find the first owning node." },
  { key: "coordinator", label: "Coordinator", description: "The owning node is identified as the primary replica / coordinator for this key." },
];

export function PartitioningPage() {
  const cluster = useCassLabStore((s) => s.cluster);
  const [key, setKey] = useState("user_42");
  const [stepIndex, setStepIndex] = useState(0);

  const width = cluster?.config.hashWidth ?? 16;
  const hash = key ? computeHash(key, width) : undefined;
  const owner = hash && cluster ? tokenToNode(hash.token, cluster.nodes, cluster.config.virtualNodesEnabled) : undefined;
  const step = STEPS[stepIndex];

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

  return (
    <ModulePage
      title="Partitioning"
      description="Enter a partition key and watch it turn into a hash, then a token, then a node on the ring, step by step."
      canvas={
        <div>
          <div className="field" style={{ maxWidth: 320 }}>
            <label>Partition key</label>
            <input type="text" value={key} onChange={(e) => setKey(e.target.value)} />
          </div>

          <Stepper steps={STEPS} activeIndex={stepIndex} onChange={setStepIndex} />

          {stepIndex >= 1 && hash && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h4>Hash computation ({width}-bit)</h4>
              <div className="mono" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
                {hash.steps.slice(0, stepIndex >= 2 ? hash.steps.length : Math.max(1, hash.steps.length - 1)).join("\n")}
              </div>
            </div>
          )}

          {stepIndex >= 3 && (
            <TokenRingSvg cluster={cluster} highlightToken={hash?.token} highlightNodeId={stepIndex >= 4 ? owner?.id : undefined} />
          )}

          {stepIndex === 4 && owner && (
            <div className="success-box">
              Coordinator / primary replica for '{key}': <strong>{owner.name}</strong> ({owner.dcId}, {owner.rackId})
            </div>
          )}
        </div>
      }
      panel={
        <div>
          <h4>{step.label}</h4>
          <p className="hint">{step.description}</p>
          {hash && (
            <ul className="param-list" style={{ marginTop: 10 }}>
              <li>
                <span>Key</span>
                <strong>{key}</strong>
              </li>
              <li>
                <span>Hash</span>
                <strong className="mono">{hash.hash.toString()}</strong>
              </li>
              <li>
                <span>Token</span>
                <strong className="mono">{hash.token.toString()}</strong>
              </li>
              {owner && (
                <li>
                  <span>Owner</span>
                  <strong>{owner.name}</strong>
                </li>
              )}
            </ul>
          )}
        </div>
      }
    />
  );
}
