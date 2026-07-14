import { NavLink } from "react-router-dom";
import { useState } from "react";

interface NavItem {
  path: string;
  label: string;
}

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
  { path: "/virtual-nodes", label: "Virtual Nodes" },
  { path: "/scenarios", label: "Guided Scenarios" },
  { path: "/survey", label: "Survey / Feedback" },
];

export function NavSidebar() {
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

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
          {NAV_ITEMS.map((item) => (
            <li key={item.path}>
              <NavLink to={item.path} className={({ isActive }) => (isActive ? "active" : "")} end={item.path === "/"}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
