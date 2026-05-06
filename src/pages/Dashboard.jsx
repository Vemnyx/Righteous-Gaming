import { useId, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import "./Dashboard.css";

const TABS = [
  { id: "announcements", label: "Announcements" },
  { id: "data", label: "Data" },
  { id: "resources", label: "Resources" },
  { id: "users", label: "Users" },
];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState(TABS[0].id);
  const tablistId = useId();

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-header-main">
          <h1 className="dashboard-brand">Team Dashboard</h1>
          {user?.email ? (
            <p className="dashboard-user" title={user.email}>
              {user.email}
            </p>
          ) : null}
        </div>
        <button type="button" className="dashboard-signout" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <div className="dashboard-body">
        <nav className="dashboard-tabs" role="tablist" aria-label="Dashboard sections" id={tablistId}>
          {TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${tablistId}-${tab.id}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`dashboard-tab${selected ? " dashboard-tab--active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div
          className="dashboard-panel"
          role="tabpanel"
          aria-labelledby={`${tablistId}-${activeTab}`}
        >
          <div className="dashboard-coming-soon">
            <span className="dashboard-coming-soon-glow" aria-hidden />
            <p className="dashboard-coming-soon-text">Coming Soon!</p>
            <p className="dashboard-coming-soon-hint">
              {TABS.find((t) => t.id === activeTab)?.label ?? "This section"} will appear here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
