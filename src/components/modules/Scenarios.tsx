import { useNavigate } from "react-router-dom";
import { ModulePage } from "../layout/ModulePage";
import { SCENARIOS, runScenario } from "../../data/scenarios";

export function ScenariosPage() {
  const navigate = useNavigate();

  const handleStart = (id: string) => {
    const path = runScenario(id);
    navigate(path);
  };

  return (
    <ModulePage
      title="Guided Scenarios"
      description="Ready-to-use pedagogical demonstrations. Each one configures a small cluster and sample data for you, then takes you to the module where the concept is best observed."
      canvas={
        <div className="table-list">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="table-list-item"
              onClick={() => handleStart(s.id)}
              style={{ alignItems: "flex-start", width: "100%", textAlign: "left" }}
            >
              <div>
                <strong>{s.title}</strong>
                <p className="hint" style={{ marginTop: 4 }}>
                  {s.description}
                </p>
              </div>
              <span className="badge badge-info">{s.concept}</span>
            </button>
          ))}
        </div>
      }
      panel={
        <div>
          <h4>How it works</h4>
          <p className="hint">
            Starting a scenario switches to Advanced mode, builds a small cluster tailored to the concept,
            creates a sample table if none exists yet, and inserts one sample row so there is always
            "active data" to explore in every module.
          </p>
        </div>
      }
    />
  );
}
