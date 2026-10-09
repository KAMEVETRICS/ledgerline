import { useEffect, useState } from "react";
import { shortRole } from "./components";
import { identities, type Identity, type SessionRole } from "./ledger";
import { ROLES, ROLE_INFO, TEMPLATE_LABELS, type Role } from "./model";
import { NetworkSection } from "./network/NetworkSection";
import { Pane } from "./panes";
import { EcosystemPrivateMarkets } from "./private/EcosystemPrivateMarkets";
import { privateNav, Sidebar, TopBar } from "./shell";
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

export default function App() {
  const { status, session, toasts } = useStore();
  const [route, go] = useRoute();
  const section = route.split("/")[0];
  const priv = privateNav(session?.role ?? null);
  const onNetwork = section === "network" || !priv.some((p) => p.route === section);
  const privateRoute = onNetwork ? null : section;

  return (
    <div className="shell">
      <Sidebar route={route || "network/overview"} onNetwork={onNetwork} go={go} />
      <div className="main">
        <TopBar go={go} />
        {session && !onNetwork && <DemoBanner judge={session.role === "Judge"} />}

        {/* Public network data: works for everyone, with or without the local ledger. */}
        {onNetwork && <NetworkSection page={route.split("/")[1] ?? "overview"} />}
        {!session && privateRoute === "view-as" && <ViewAs onChosen={(r) => go(r === "Judge" ? "parties" : r === "Ecosystem" ? "private-markets" : "me")} />}
        {session && !onNetwork && status === "offline" && <Offline />}
        {session && status === "ready" && (
          <>
            {privateRoute === "parties" && <JudgeView />}
            {privateRoute === "matrix" && <Matrix />}
            {privateRoute === "private-markets" && <EcosystemPrivateMarkets />}
            {privateRoute === "me" && (
              <main className="solo">
                <Pane role={session.role as Role} />
              </main>
            )}
          </>
        )}
      </div>

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

/** Shown on every private view: the funds are fictional, the privacy is real. */
function DemoBanner({ judge }: { judge: boolean }) {
  return (
    <div className="demo-banner" role="note">
      <strong>Demo mode</strong>
      <span className="muted">
        {judge
          ? "This all-parties view exists only for the demo. In production no account can see more than one party."
          : "Fictional funds and investors on a local Canton ledger. The privacy is real: this session can read and act only as one party, and the server refuses everything else."}{" "}
        The Network pages use live mainnet data.
      </span>
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
            that party's node holds.
          </p>
        </div>
      </header>
      <div className="demo-note" role="note">
        <p>
          <strong>Demo mode.</strong> The funds, managers and investors here are fictional, seeded on a local Canton ledger. There
          are no passwords so you can switch between parties and compare what each one sees.
        </p>
        <p>
          Switching identity is not a way around privacy. Each session is bound to one party, and the server refuses any read or
          command for another party (HTTP 403). Contracts a party is not entitled to never reach its node in the first place.
        </p>
        <p>
          In production each organisation signs in with its own Canton wallet and runs on its own node, so there is nothing to
          switch to. The all-parties Judge view exists only in this demo.
        </p>
      </div>
      <StartFund onStarted={() => onChosen("GP")} />
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
          Counts of active contracts on each party's node, read straight from the demo Canton ledger. An empty cell
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

// Self-serve: a visitor creates a real fund on the ledger and runs it.
function StartFund({ onStarted }: { onStarted: () => void }) {
  const { startFund } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const err = await startFund(name);
    setPending(false);
    if (err) setError(err);
    else onStarted();
  };

  return (
    <section className="viewas-group">
      <h3>Start your own fund</h3>
      <form className="startfund" onSubmit={submit}>
        <p className="muted small">
          Creates a new manager party and a fund on the Canton ledger. Invite the demo investors, issue capital calls, publish a
          NAV, and see your fund counted in the network statistics.
        </p>
        <div className="startfund-row">
          <input aria-label="Fund name" placeholder="Fund name, e.g. Harbourside Credit Fund I" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" type="submit" disabled={pending || name.trim().length < 3}>
            {pending ? "Creating on the ledger…" : "Start fund"}
          </button>
        </div>
        {error && <p className="signin-error" role="alert">{error}</p>}
      </form>
    </section>
  );
}
