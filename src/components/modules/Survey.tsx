import { useState } from "react";
import { ModulePage } from "../layout/ModulePage";

type Role = "cassandra_practitioner" | "cs_student" | "other";

interface SurveyResponse {
  submittedAt: string;
  role: Role;
  clarity: number;
  usefulness: number;
  animationQuality: number;
  wouldRecommend: number;
  comments: string;
}

const LIKERT_LABELS = ["1 — Strongly disagree", "2", "3 — Neutral", "4", "5 — Strongly agree"];
const STORAGE_KEY = "casslab_survey_responses";

function loadLocalResponses(): SurveyResponse[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveLocalResponse(r: SurveyResponse) {
  const all = loadLocalResponses();
  all.push(r);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

const configuredEndpoint = (import.meta.env.VITE_SURVEY_ENDPOINT as string | undefined) ?? "";

export function SurveyPage() {
  const [role, setRole] = useState<Role>("cs_student");
  const [clarity, setClarity] = useState(4);
  const [usefulness, setUsefulness] = useState(4);
  const [animationQuality, setAnimationQuality] = useState(4);
  const [wouldRecommend, setWouldRecommend] = useState(4);
  const [comments, setComments] = useState("");
  const [endpointOverride, setEndpointOverride] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [localCount, setLocalCount] = useState(loadLocalResponses().length);

  const endpoint = endpointOverride.trim() || configuredEndpoint;

  const handleSubmit = async () => {
    const response: SurveyResponse = {
      submittedAt: new Date().toISOString(),
      role,
      clarity,
      usefulness,
      animationQuality,
      wouldRecommend,
      comments,
    };
    saveLocalResponse(response);
    setLocalCount(loadLocalResponses().length);
    setSubmitError(null);

    if (endpoint) {
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(response),
          mode: "cors",
        });
      } catch {
        setSubmitError("Could not reach the external form endpoint — your response was still saved locally.");
      }
    }
    setSubmitted(true);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(loadLocalResponses(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "casslab_survey_responses.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModulePage
      title="Survey / Feedback"
      description="CassLab is dependency-free by design, so this satisfaction survey posts to an external form endpoint you configure, rather than to a database this app would have to host."
      canvas={
        submitted ? (
          <div className="success-box">
            Thank you — your response was recorded.
            {submitError && <div className="hint" style={{ marginTop: 8 }}>{submitError}</div>}
            <div style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => setSubmitted(false)}>
                Submit another response
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="field">
              <label>You are...</label>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="cassandra_practitioner">A Cassandra practitioner / engineer</option>
                <option value="cs_student">A computer science student</option>
                <option value="other">Other</option>
              </select>
            </div>

            {[
              ["The Cassandra concepts were clearly explained", clarity, setClarity] as const,
              ["CassLab helped me understand Cassandra's internals better", usefulness, setUsefulness] as const,
              ["The animations were clear and useful", animationQuality, setAnimationQuality] as const,
              ["I would recommend CassLab to a peer", wouldRecommend, setWouldRecommend] as const,
            ].map(([label, value, setter], i) => (
              <div className="field" key={i}>
                <label>{label}</label>
                <select value={value} onChange={(e) => setter(Number(e.target.value))}>
                  {LIKERT_LABELS.map((l, idx) => (
                    <option key={l} value={idx + 1}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <div className="field">
              <label>Comments (optional)</label>
              <textarea rows={4} value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>

            <button className="btn btn-primary" onClick={handleSubmit}>
              Submit feedback
            </button>
          </div>
        )
      }
      panel={
        <div>
          <h4>External form endpoint</h4>
          <p className="hint">
            Configure <code className="mono">VITE_SURVEY_ENDPOINT</code> at build time (e.g. a Formspree or
            Google Apps Script endpoint) to collect responses centrally from the ~1000 planned respondents. You
            can also paste one here for a quick test — it is not saved.
          </p>
          <div className="field">
            <label>Test endpoint URL</label>
            <input type="text" placeholder="https://formspree.io/f/xxxxxxx" value={endpointOverride} onChange={(e) => setEndpointOverride(e.target.value)} />
          </div>
          <p className="hint">
            {endpoint ? `Responses will also be POSTed to: ${endpoint}` : "No external endpoint configured — responses are only saved locally in this browser."}
          </p>
          <h4 style={{ marginTop: 14 }}>Local responses (this browser)</h4>
          <p className="hint">{localCount} response(s) saved.</p>
          <button className="btn" onClick={handleExport} disabled={localCount === 0}>
            Download as JSON
          </button>
        </div>
      }
    />
  );
}
