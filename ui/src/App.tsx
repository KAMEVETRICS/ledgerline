import { useEffect, useState, type FormEvent } from "react";
import { shortRole } from "./components";
import { ROLES, ROLE_INFO, TEMPLATE_LABELS, type Role } from "./model";
import { NetworkSection } from "./network/NetworkSection";
import { Pane } from "./panes";
import { EcosystemPrivateMarkets } from "./private/EcosystemPrivateMarkets";
import { useStore } from "./store";
import type { SessionRole } from "./ledger";

const DEFAULT_PANES: Role[] = ["GP", "GP2", "LP_A", "LP_B"];

// Hash routes: #/network/<page>, #/me, #/parties, #/matrix, #/private-markets
function useRoute(): [string, (r: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, "");
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (r) => (window.location.hash = `/${r}`)];
}

type NavItem = { route: string; label: string };

function navFor(role: SessionRole): NavItem[] {
  const network = { route: "network/overview", label: "Network" };
  if (role === "Judge")
    return [
      { route: "parties", label: "Party views" },
      { route: "matrix", label: "Who holds what" },
      network,
    ];
  if (role === "Ecosystem") return [network, { route: "private-markets", label: "Private markets" }];
  return [{ route: "me", label: "My dashboard" }, network];
}

export default function App() {
  const { status, session, toasts } = useStore();
  const [route, go] = useRoute();
  const nav = session ? navFor(session.role) : [];
  const active = nav.find((n) => route.split("/")[0] === n.route.split("/")[0]) ?? nav[0];

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        {session && nav.length > 0 && (
          <nav className="tabs" aria-label="Sections">
            {nav.map((n) => (
              <button key={n.route} className={n === active ? "on" : ""} aria-current={n === active ? "page" : undefined} onClick={() => go(n.route)}>
                {n.label}
              </button>
            ))}
          </nav>
        )}
        {session && <UserChip />}
        <span className={`status ${status}`}>
          <span className="dot" />
          {status === "ready" ? "Canton ledger connected" : status === "offline" ? "Ledger offline" : status === "signedout" ? "Signed out" : "Connecting…"}
        </span>
      </header>

      {status === "signedout" && <SignIn />}
      {/* Network pages use public data, so they work even when the local ledger is down. */}
      {session && active?.route.startsWith("network") && <NetworkSection page={route.split("/")[1] ?? "overview"} go={go} />}
      {status === "offline" && !active?.route.startsWith("network") && <Offline />}
      {status === "ready" && session && active && (
        <>
          {active.route === "parties" && <JudgeView />}
          {active.route === "matrix" && <Matrix />}
          {active.route === "private-markets" && <EcosystemPrivateMarkets />}
          {active.route === "me" && (
            <main className="solo">
              <Pane role={session.role as Role} />
            </main>
          )}
        </>
      )}

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

function Brand() {
  return (
    <div className="brand">
      <span className="logo" aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path d="M4 5h4v14H4zM10 9h4v10h-4zM16 13h4v6h-4z" fill="currentColor" />
        </svg>
      </span>
      <div>
        <h1>Ledgerline</h1>
        <p>Private-markets data on Canton. Every party sees only its own truth.</p>
      </div>
    </div>
  );
}

function UserChip() {
  const { session, signOut } = useStore();
  return (
    <div className="user">
      <span className="user-name">{session!.name}</span>
      <button className="btn ghost" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  );
}

const DEMO_USERS: [string, string][] = [
  ["harbor", "LP, two funds"],
  ["mesa", "LP, two funds"],
  ["ledgerline-gp", "Fund manager"],
  ["ridgeway-gp", "Fund manager"],
  ["northwind-gp", "Fund manager"],
  ["admin", "Fund administrator"],
  ["auditor", "Auditor"],
  ["ecosystem", "Network statistics"],
  ["judge", "All views side by side"],
];

function SignIn() {
  const { signIn } = useStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(await signIn(username, password));
    setPending(false);
  };

  return (
    <main className="signin">
      <form className="signin-card" onSubmit={submit}>
        <h2>Sign in</h2>
        <p className="muted">Each account is bound to one Canton party. The server only lets it read and act as that party.</p>
        <label className="field">
          <span>Username</span>
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="signin-error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={pending || !username || !password}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <section className="signin-demo">
        <h3>Demo accounts</h3>
        <p className="muted small">Pick one to fill the username. The demo password is in the README.</p>
        <ul>
          {DEMO_USERS.map(([u, label]) => (
            <li key={u}>
              <button type="button" className="chip" onClick={() => setUsername(u)}>
                {u}
              </button>
              <span className="muted small">{label}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

// Demo-only account: every party side by side.
function JudgeView() {
  const { parties } = useStore();
  const [panes, setPanes] = useState<Role[]>(DEFAULT_PANES);

  const toggle = (r: Role) =>
    setPanes((ps) => (ps.includes(r) ? ps.filter((p) => p !== r) : ROLES.filter((x) => x === r || ps.includes(x))));

  return (
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
      <main className="panes">
        {panes.map((r) => (
          <Pane key={r} role={r} />
        ))}
      </main>
    </>
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
