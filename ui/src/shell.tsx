// App chrome: sidebar (sections, pages, watchlist, call to action) and the
// top bar (who you are viewing as, primary action, status, party search).
import { useState, type FormEvent, type ReactNode } from "react";
import type { SessionRole } from "./ledger";
import { ROLE_INFO, type Role } from "./model";
import { fetchValidators, useLoad } from "./network/api";
import { NETWORK_PAGES } from "./network/NetworkSection";
import { attentionQueue, networkVersionOf } from "./network/pages/health";
import { parseParty } from "./network/pages/wpb/format";
import { useStore } from "./store";

// ---- icons (24px grid, stroke follows currentColor)

const PATHS: Record<string, ReactNode> = {
  overview: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  validators: <><rect x="4" y="5" width="16" height="5" rx="1.5" /><rect x="4" y="14" width="16" height="5" rx="1.5" /><path d="M8 7.5h.01M8 16.5h.01" /></>,
  apps: <><path d="M4 18V9M10 18V5M16 18v-6M22 18H2" /></>,
  liquidity: <><path d="M12 3c3 4 6 7.2 6 10.5A6 6 0 0 1 6 13.5C6 10.2 9 7 12 3Z" /></>,
  portfolio: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
  parties: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17.5" cy="9" r="2.5" /><path d="M16 14.2c2.9.3 5 2.6 5 5.8" /></>,
  matrix: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 4v16" /></>,
  me: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
  stats: <><path d="M4 19h16M7 16V9M12 16V5M17 16v-4" /></>,
  bolt: <><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></>,
  caret: <><path d="m6 15 6-6 6 6" /></>,
  arrow: <><path d="M7 17 17 7M9 7h8v8" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5" /></>,
  pulse: <><path d="M3 12h4l2-6 4 12 2-6h6" /></>,
  door: <><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" /></>,
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** The Ledgerline mark: three ledger bars, the tallest with a keyhole. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect x="124" y="268" width="72" height="124" rx="14" fill="currentColor" fillOpacity="0.5" />
      <rect x="220" y="204" width="72" height="188" rx="14" fill="currentColor" fillOpacity="0.8" />
      <rect x="316" y="124" width="72" height="268" rx="14" fill="var(--accent)" />
      <circle cx="352" cy="226" r="17" fill="var(--surface-3)" />
      <path d="M344 236 L360 236 L366 290 L338 290 Z" fill="var(--surface-3)" />
      <rect x="108" y="404" width="296" height="16" rx="8" fill="var(--accent)" />
    </svg>
  );
}

// ---- sidebar

export type NavItem = { route: string; label: string; icon: string };

const PAGE_ICONS: Record<string, string> = { overview: "overview", validators: "validators", apps: "apps", liquidity: "liquidity", portfolio: "portfolio" };

/** Private-side pages for the signed-in role (or the identity picker when signed out). */
export function privateNav(role: SessionRole | null): NavItem[] {
  if (role === null) return [{ route: "view-as", label: "Choose a party", icon: "parties" }];
  if (role === "Judge")
    return [
      { route: "parties", label: "Party views", icon: "parties" },
      { route: "matrix", label: "Who holds what", icon: "matrix" },
    ];
  if (role === "Ecosystem") return [{ route: "private-markets", label: "Private markets", icon: "stats" }];
  return [{ route: "me", label: "My dashboard", icon: "me" }];
}

export function Sidebar({ route, onNetwork, go }: { route: string; onNetwork: boolean; go: (r: string) => void }) {
  const { session } = useStore();
  const page = route.split("/")[1]?.split("?")[0] ?? "overview";
  const priv = privateNav(session?.role ?? null);
  const items: NavItem[] = onNetwork
    ? NETWORK_PAGES.map((p) => ({ route: `network/${p.id}`, label: p.label, icon: PAGE_ICONS[p.id] }))
    : priv;
  const isOn = (item: NavItem) => (onNetwork ? item.route === `network/${page}` : route.split("/")[0] === item.route);

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <span className="logo"><Logo /></span>
        <div>
          <h1>Ledgerline<sup>®</sup></h1>
          <p>Decisions from Canton data</p>
        </div>
      </div>

      <div className="segmented" role="tablist" aria-label="Section">
        <button role="tab" aria-selected={onNetwork} className={onNetwork ? "on" : ""} onClick={() => go("network/overview")}>
          Network
        </button>
        <button role="tab" aria-selected={!onNetwork} className={!onNetwork ? "on" : ""} onClick={() => go(priv[0].route)}>
          Private
        </button>
      </div>

      <nav className="side-nav" aria-label={onNetwork ? "Network pages" : "Private views"}>
        {items.map((item) => (
          <button key={item.route} className={isOn(item) ? "on" : ""} aria-current={isOn(item) ? "page" : undefined} onClick={() => go(item.route)}>
            <Icon name={item.icon} />
            {item.label}
            {item.route === "view-as" && <span className="side-pill">Demo</span>}
          </button>
        ))}
      </nav>

      <Watchlist go={go} />

      {!session && (
        <button className="side-cta" onClick={() => go("view-as")}>
          <Icon name="bolt" />
          <div>
            <strong>Start your own fund</strong>
            <span>Run it on a Canton ledger, privately</span>
          </div>
        </button>
      )}
    </aside>
  );
}

/** Top of the attention queue, always one click away. */
function Watchlist({ go }: { go: (r: string) => void }) {
  const { data } = useLoad(fetchValidators);
  const [open, setOpen] = useState(true);
  if (!data) return null;
  const now = data.meta.source === "fixture" ? Date.parse(data.meta.asOf) : Date.now();
  const queue = attentionQueue(data.validators, networkVersionOf(data.validators, data.networkVersion), now);
  if (queue.length === 0) return null;
  return (
    <div className="side-watch">
      <button className="side-watch-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="pulse" />
        Needs attention
        <span className="side-pill">{queue.length}</span>
        <span className="caret"><Icon name="caret" size={14} /></span>
      </button>
      {open && (
        <ul>
          {queue.slice(0, 4).map((issue, i) => (
            <li key={issue.validator.id} className={i === 3 ? "fade" : undefined}>
              <button onClick={() => go("network/validators")}>
                <span className={`glyph ${issue.tier <= 2 ? "bad" : "warn"}`}>{parseParty(issue.validator.name).hint.slice(0, 2).toUpperCase()}</span>
                <span>
                  <span className="who">{parseParty(issue.validator.name).hint}</span>
                  <span className="why">{issue.reason}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- top bar

export function TopBar({ go }: { go: (r: string) => void }) {
  const { status, session, signOut } = useStore();
  const [q, setQ] = useState("");
  const role = session?.role;
  const hue = role && role !== "Judge" ? ROLE_INFO[role as Role]?.hue : undefined;
  const initials = (session?.name ?? "Public")
    .replace(/\(.*\)/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const lookup = (e: FormEvent) => {
    e.preventDefault();
    const id = q.trim();
    if (id) go(`network/portfolio?party=${encodeURIComponent(id)}`);
  };

  return (
    <header className="topbar">
      <div className="who-chip">
        <span className="avatar" style={hue ? { ["--hue" as string]: hue } : undefined}>{initials}</span>
        <div>
          <span className="handle">
            {session ? (role === "Judge" ? "all parties" : ROLE_INFO[role as Role]?.kind ?? "party") : "no sign-in needed"}
            <b>{session ? "DEMO" : "LIVE"}</b>
          </span>
          <strong>{session ? session.name : "Public view"}</strong>
        </div>
      </div>
      {session ? (
        <button className="btn ghost" onClick={() => signOut().then(() => go("network/overview"))}>
          Leave view <Icon name="door" size={16} />
        </button>
      ) : (
        <button className="btn primary" onClick={() => go("view-as")}>
          View as a party <Icon name="parties" size={16} />
        </button>
      )}

      <div className="topbar-right">
        <span className={`status ${session ? status : "public"}`} title={session ? "Private views run on a local Canton ledger seeded with fictional funds" : "Network pages show live Canton mainnet data"}>
          <span className="dot" />
          {!session ? "Mainnet data" : status === "ready" ? "Demo ledger connected" : status === "offline" ? "Demo ledger offline" : "Connecting…"}
        </span>
        <form className="search" role="search" onSubmit={lookup}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Look up a party ID…" aria-label="Look up a party ID" spellCheck={false} />
        </form>
      </div>
    </header>
  );
}
