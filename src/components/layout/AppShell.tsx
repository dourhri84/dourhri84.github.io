import { Outlet } from "react-router-dom";
import { NavSidebar } from "./NavSidebar";
import { EventLog } from "./EventLog";
import { useCassLabStore } from "../../state/store";

export function AppShell() {
  const mode = useCassLabStore((s) => s.mode);
  const setMode = useCassLabStore((s) => s.setMode);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>CassLab — Interactive Educational Simulator for Apache Cassandra</h1>
        <div className="mode-toggle" role="group" aria-label="Simulator mode">
          <button className={mode === "beginner" ? "active" : ""} onClick={() => setMode("beginner")}>
            Beginner
          </button>
          <button className={mode === "advanced" ? "active" : ""} onClick={() => setMode("advanced")}>
            Advanced
          </button>
        </div>
      </header>
      <div className="app-body">
        <NavSidebar />
        <main className="app-main scroll-y">
          <Outlet />
        </main>
      </div>
      <EventLog />
    </div>
  );
}
