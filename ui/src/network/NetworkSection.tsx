// Network section shell: sub-navigation + one page per module. Pages live in
// ./pages and are owned per docs/PLAN.md; this file only routes between them.
import type { ReactNode } from "react";
import type { Meta } from "./types";
import { SourceBadge } from "../charts";
import { Apps } from "./pages/Apps";
import { Liquidity } from "./pages/Liquidity";
import { Overview } from "./pages/Overview";
import { Portfolio } from "./pages/Portfolio";
import { Validators } from "./pages/Validators";

const PAGES = [
  { id: "overview", label: "Overview", Page: Overview },
  { id: "validators", label: "Validators", Page: Validators },
  { id: "apps", label: "App monitoring", Page: Apps },
  { id: "liquidity", label: "Liquidity", Page: Liquidity },
  { id: "portfolio", label: "Portfolio lookup", Page: Portfolio },
] as const;

export function NetworkSection({ page, go }: { page: string; go: (route: string) => void }) {
  const id = page.split("?")[0]; // pages may carry state in the hash, e.g. portfolio?party=…
  const current = PAGES.find((p) => p.id === id) ?? PAGES[0];
  return (
    <div className="network">
      <nav className="subnav" aria-label="Network pages">
        {PAGES.map((p) => (
          <button key={p.id} className={p === current ? "on" : ""} aria-current={p === current ? "page" : undefined} onClick={() => go(`network/${p.id}`)}>
            {p.label}
          </button>
        ))}
      </nav>
      <main className="network-page">
        <current.Page />
      </main>
    </div>
  );
}

/** Standard page frame: title, one-line purpose, data source, then content. */
export function NetworkPage({
  title,
  lead,
  meta,
  children,
}: {
  title: string;
  lead: string;
  meta?: Meta | null;
  children: ReactNode;
}) {
  return (
    <>
      <header className="page-head">
        <div>
          <h2>{title}</h2>
          <p className="muted">{lead}</p>
        </div>
        {meta && <SourceBadge meta={meta} />}
      </header>
      {children}
    </>
  );
}

/** Loading and error states every page shares. */
export function LoadState({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <p className="empty">Could not load network data: {error}</p>;
  if (loading) return <p className="empty">Loading network data…</p>;
  return null;
}
