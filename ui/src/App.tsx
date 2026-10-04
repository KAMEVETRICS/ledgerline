import { useEffect, useState } from "react";
import { shortRole } from "./components";
import { identities, type Identity, type SessionRole } from "./ledger";
import { ROLES, ROLE_INFO, TEMPLATE_LABELS, type Role } from "./model";
import { NetworkSection } from "./network/NetworkSection";
import { Pane } from "./panes";
import { EcosystemPrivateMarkets } from "./private/EcosystemPrivateMarkets";
import { useStore } from "./store";

const DEFAULT_PANES: Role[] = ["GP", "GP2", "LP_A", "LP_B"];

// Hash routes: #/network/<page>, #/view-as, #/me, #/parties, #/matrix, #/private-markets
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

const NETWORK: NavItem = { route: "network/overview", label: "Network" };

// The network dashboard is public. Private views need a demo identity.
function navFor(role: SessionRole | null): NavItem[] {
  if (role === null) return [NETWORK, { route: "view-as", label: "Private views" }];
  if (role === "Judge")
    return [{ route: "parties", label: "Party views" }, { route: "matrix", label: "Who holds what" }, NETWORK];
  if (role === "Ecosystem") return [{ route: "private-markets", label: "Private markets" }, NETWORK];
  return [{ route: "me", label: "My dashboard" }, NETWORK];
}

export default function App() {
  const { status, session, toasts } = useStore();
  const [route, go] = useRoute();
  const nav = navFor(session?.role ?? null);
  const active = nav.find((n) => route.split("/")[0] === n.route.split("/")[0]) ?? nav[0];
  const onNetwork = active.route.startsWith("network");

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <nav className="tabs" aria-label="Sections">
          {nav.map((n) => (
            <button key={n.route} className={n === active ? "on" : ""} aria-current={n === active ? "page" : undefined} onClick={() => go(n.route)}>
              {n.label}
            </button>
          ))}
        </nav>
        {session ? <UserChip /> : <button className="btn primary" onClick={() => go("view-as")}>View as a party</button>}
        <span className={`status ${status}`}>
          <span className="dot" />
          {status === "ready" ? "Canton ledger connected" : status === "offline" ? "Ledger offline" : session ? "Connecting…" : "Public view"}
        </span>
      </header>

      {/* Public network data: works for everyone, with or without the local ledger. */}
      {onNetwork && <NetworkSection page={route.split("/")[1] ?? "overview"} go={go} />}
      {!session && active.route === "view-as" && <ViewAs onChosen={(r) => go(r === "Judge" ? "parties" : r === "Ecosystem" ? "private-markets" : "me")} />}
      {session && !onNetwork && status === "offline" && <Offline />}
      {session && status === "ready" && (
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
        <p>Canton data for institutions. Every party sees only its own truth.</p>
      </div>
    </div>
  );
}

function UserChip() {
  const { session, signOut } = useStore();
  return (
    <div className="user">
      <span className="user-name">{session!.name}</span>
      <button className="btn ghost" onClick={() => signOut().then(() => (window.location.hash = "/network/overview"))}>
        Leave view
      </button>
    </div>
  );
}

// Groups for the picker, in the order a judge would explore them.
const GROUPS: { title: string; roles: SessionRole[] }[] = [
  { title: "Investors", roles: ["LP_A", "LP_B", "LP_C"] },
  { title: "Fund managers", roles: ["GP", "GP2", "GP3"] },
  { title: "Operators", roles: ["Administrator", "Auditor", "Ecosystem"] },
  { title: "Demo", roles: ["Judge"] },
];

function ViewAs({ onChosen }: { onChosen: (role: SessionRole) => void }) {
  const { signIn } = useStore();
  const [list, setList] = useState<Identity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    identities().then(setList).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const choose = async (who: Identity) => {
    setPending(who.username);
    const err = await signIn(who.username);
    setPending(null);
    if (err) setError(err);
    else onChosen(who.role);
  };

  return (
    <main className="viewas">
      <header className="page-head">
        <div>
          <h2>View the ledger as a party</h2>
          <p className="muted">
            Each identity is one Canton party. The server lets it read and act only as that party, so what you see is exactly what
            that party's node holds. No password: these are demo identities.
          </p>
        </div>
      </header>
      {error && <p className="signin-error" role="alert">{error}</p>}
      {!list && !error && <p className="empty">Loading identities…</p>}
      {list &&
        GROUPS.map((g) => (
          <section key={g.title} className="viewas-group">
            <h3>{g.title}</h3>
            <div className="viewas-grid">
              {list
                .filter((u) => g.roles.includes(u.role))
                .map((u) => (
                  <button
                    key={u.username}
                    className="viewas-card"
                    style={u.role !== "Judge" ? { ["--hue" as string]: ROLE_INFO[u.role as Role].hue } : undefined}
                    disabled={pending !== null}
                    onClick={() => choose(u)}
                  >
                    <strong>{u.name}</strong>
                    <span className="muted small">{u.description}</span>
                    <span className="viewas-go">{pending === u.username ? "Opening…" : "View as →"}</span>
                  </button>
                ))}
            </div>
          </section>
        ))}
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
