import { NavLink } from "react-router-dom";
import { useState } from "react";
import { useCassLabStore } from "../../state/store";

interface NavItem {
  path: string;
  label: string;
  advancedOnly?: boolean;
  external?: boolean;
}

const SURVEY_URL = "https://docs.google.com/forms/d/e/1FAIpQLScmxUqU3yKadeHS0t0j8jhLeUv4EA1GAnX13SQYx2cmdCV6yg/viewform";

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Cluster Configuration" },
  { path: "/ddl-analysis", label: "DDL Analysis" },
  { path: "/insertion", label: "Insertion" },
  { path: "/partitioning", label: "Partitioning" },
  { path: "/token-ring", label: "Token Ring" },
  { path: "/replica-placement", label: "Replica Placement" },
  { path: "/consistency-level", label: "Consistency Level" },
  { path: "/gossip", label: "Gossip" },
  { path: "/write-path", label: "Write Path" },
  { path: "/read-path", label: "Read Path" },
  { path: "/update", label: "Update" },
  { path: "/delete", label: "Delete" },
  { path: "/failure", label: "Failure Simulation" },
  { path: "/rebalancing", label: "Rebalancing" },
  { path: "/virtual-nodes", label: "Virtual Nodes", advancedOnly: true },
  { path: SURVEY_URL, label: "Survey / Feedback", external: true },
];

export function NavSidebar() {
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const mode = useCassLabStore((s) => s.mode);
  const items = NAV_ITEMS.filter((item) => !item.advancedOnly || mode === "advanced");

  return (
    <nav className={`nav-sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="nav-sidebar-header">
        {!collapsed && <span>Navigation</span>}
        <button
          className="nav-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>
      {!collapsed && (
        <ul>
          {items.map((item) =>
            item.external ? (
              <li key={item.path}>
                <a href={item.path} target="_blank" rel="noopener noreferrer">
                  {item.label} <span aria-hidden="true">↗</span>
                </a>
              </li>
            ) : (
              <li key={item.path}>
                <NavLink to={item.path} className={({ isActive }) => (isActive ? "active" : "")} end={item.path === "/"}>
                  {item.label}
                </NavLink>
              </li>
            ),
          )}
        </ul>
      )}
    </nav>
  );
}
