import { useState } from "react";
import { shortRole } from "./components";
import { ROLES, ROLE_INFO, TEMPLATE_LABELS, type Role } from "./model";
import { Pane } from "./panes";
import { useStore } from "./store";

const DEFAULT_PANES: Role[] = ["GP", "GP2", "LP_A", "LP_B"];

export default function App() {
  const { status, parties, toasts } = useStore();
  const [tab, setTab] = useState<"views" | "matrix">("views");
  const [panes, setPanes] = useState<Role[]>(DEFAULT_PANES);

  const toggle = (r: Role) =>
    setPanes((ps) => (ps.includes(r) ? ps.filter((p) => p !== r) : ROLES.filter((x) => x === r || ps.includes(x))));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M4 5h4v14H4zM10 9h4v10h-4zM16 13h4v6h-4z" fill="currentColor" />
            </svg>
          </span>
          <div>
            <h1>Ledgerline</h1>
            <p>One fund ledger. Every party sees only its own truth.</p>
          </div>
        </div>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "views"} className={tab === "views" ? "on" : ""} onClick={() => setTab("views")}>
            Party views
          </button>
          <button role="tab" aria-selected={tab === "matrix"} className={tab === "matrix" ? "on" : ""} onClick={() => setTab("matrix")}>
            Who holds what
          </button>
        </nav>
        <span className={`status ${status}`}>
          <span className="dot" />
          {status === "ready" ? "Canton sandbox connected" : status === "loading" ? "Connecting…" : "Ledger offline"}
        </span>
      </header>

      {status === "offline" && <Offline />}

      {status === "ready" && tab === "views" && (
        <>
          <div className="lens">
            <span className="muted">Show views for</span>
            {ROLES.filter((r) => parties[r]).map((r) => (
              <button
                key={r}
                className={`chip${panes.includes(r) ? " on" : ""}`}
                style={{ ["--c" as string]: ROLE_INFO[r].hue }}
                aria-pressed={panes.includes(r)}
                onClick={() => toggle(r)}
              >
                {ROLE_INFO[r].name}
              </button>
            ))}
            <span className="muted lens-tip">Hover any contract to see whose node holds it.</span>
          </div>
          <main className="panes" style={{ ["--cols" as string]: panes.length }}>
            {panes.map((r) => (
              <Pane key={r} role={r} />
            ))}
          </main>
        </>
      )}

      {status === "ready" && tab === "matrix" && <Matrix />}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Matrix() {
  const { acs, parties } = useStore();
  const roles = ROLES.filter((r) => parties[r]);
  const templates = Object.keys(TEMPLATE_LABELS).filter((t) => roles.some((r) => acs[r]?.some((c) => c.template === t)));
  const count = (r: Role, t: string) => acs[r]?.filter((c) => c.template === t).length ?? 0;

  return (
    <main className="matrix-wrap">
      <div className="matrix-intro">
        <h2>Who holds what</h2>
        <p>
          Live counts of active contracts on each party's node, read straight from the Canton ledger. An empty cell
          means that party's participant never received the data. Nothing is hidden by the UI.
        </p>
      </div>
      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th>Contract</th>
              {roles.map((r) => (
                <th key={r} style={{ ["--c" as string]: ROLE_INFO[r].hue }}>
                  <span className="col-dot" />
                  {shortRole(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t}>
                <th>{TEMPLATE_LABELS[t]}</th>
                {roles.map((r) => {
                  const n = count(r, t);
                  return (
                    <td key={r} className={n ? "has" : ""} style={{ ["--c" as string]: ROLE_INFO[r].hue }}>
                      {n || "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Offline() {
  return (
    <main className="offline">
      <h2>No ledger found</h2>
      <p>Start the Canton sandbox and seed the demo, then this page connects on its own.</p>
      <pre>{`cd ledgerline
dpm build --all
dpm sandbox --dar main/.daml/dist/ledgerline-0.1.0.dar --json-api-port 7575
dpm script --dar test/.daml/dist/ledgerline-test-0.1.0.dar --script-name Demo.Setup:setup --ledger-host localhost --ledger-port 6865`}</pre>
    </main>
  );
}
