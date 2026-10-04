import { useState } from "react";
import { Sparkline, TimeSeriesChart, compact } from "../../charts";
import { Badge, Empty, Stat } from "../../components";
import { fetchApps, useLoad } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";
import type { App, AppsReport } from "../types";
import { DASH, ccAmount, cmp, fmt, nextSort, rewardsPerK, sumKnown, trend7d, type SortState } from "./wpb/format";
import { SortTh } from "./wpb/sort";
import "./wpb/wpb.css";

export function Apps() {
  const { data, error, loading } = useLoad(fetchApps);
  return (
    <NetworkPage
      title="App monitoring"
      lead="Which apps are growing and what they earn, for developers and Featured App decisions."
      meta={data?.meta}
    >
      <LoadState loading={loading} error={error} />
      {data && <AppsBody data={data} />}
    </NetworkPage>
  );
}

type Row = App & { trend: number | null; rpk: number | null };

function asRow(app: App): Row {
  return { ...app, trend: trend7d(app.activityDaily), rpk: rewardsPerK(app.activity30d, app.rewards30dCC) };
}

function trendClass(t: number): string {
  if (t > 0) return "num wpb-up";
  if (t < 0) return "num wpb-down";
  return "num";
}

function trendLabel(t: number): string {
  const pct = t * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function MoverRow({ app }: { app: Row }) {
  const t = app.trend;
  if (t == null) return null;
  return (
    <li>
      <span>{app.name}</span>
      <span className={trendClass(t)}>{trendLabel(t)}</span>
    </li>
  );
}

function PartyCopy({ party, copied, onCopy }: { party: string; copied: boolean; onCopy: (party: string) => void }) {
  return (
    <>
      <span className="party">{party}</span>
      <button type="button" className="btn ghost" onClick={() => onCopy(party)}>
        {copied ? "Copied" : "Copy"}
      </button>
    </>
  );
}

function AppsBody({ data }: { data: AppsReport }) {
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sort, setSort] = useState<SortState>({ col: "activity", dir: "desc" });
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rowsAll = data.apps.map(asRow);
  const featured = rowsAll.filter((a) => a.featured).length;
  const activity = sumKnown(rowsAll.map((a) => a.activity30d));
  const rewards = sumKnown(rowsAll.map((a) => a.rewards30dCC));

  const ranked = rowsAll.filter((a) => a.trend != null).sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0));
  const growing = ranked.slice(0, 3);
  const slowing = [...ranked].slice(-3).reverse();

  const rows = [...(featuredOnly ? rowsAll.filter((a) => a.featured) : rowsAll)].sort((a, b) => {
    if (sort.col === "name") return cmp(a.name, b.name, sort.dir);
    if (sort.col === "provider") return cmp(a.provider, b.provider, sort.dir);
    if (sort.col === "activity") return cmp(a.activity30d, b.activity30d, sort.dir);
    if (sort.col === "rewards") return cmp(a.rewards30dCC, b.rewards30dCC, sort.dir);
    if (sort.col === "rpk") return cmp(a.rpk, b.rpk, sort.dir);
    if (sort.col === "trend") return cmp(a.trend, b.trend, sort.dir);
    return 0;
  });

  const selectedApp = rowsAll.find((a) => a.id === selected);
  const onSort = (col: string, first: "asc" | "desc") => setSort((s) => nextSort(s, col, first));

  const copyParty = async (party: string) => {
    await navigator.clipboard.writeText(party);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const openRow = (id: string) => setSelected((cur) => (cur === id ? null : id));

  return (
    <div className="wpb-stack">
      <div className="stats">
        <Stat label="Apps tracked" value={<span className="num">{rowsAll.length}</span>} />
        <Stat label="Featured apps" value={<span className="num">{featured}</span>} />
        <Stat label="Activity (30d)" value={<span className="num">{fmt(activity, compact)}</span>} />
        <Stat label="Rewards (30d)" value={<span className="num">{fmt(rewards, ccAmount)}</span>} />
      </div>

      <div className="panel">
        <h3>Apps</h3>
        <div className="wpb-toolbar">
          <button
            type="button"
            className="wpb-toggle"
            aria-pressed={featuredOnly}
            onClick={() => setFeaturedOnly((v) => !v)}
          >
            Featured only
          </button>
        </div>
        {rows.length === 0 ? (
          <Empty>No apps match this filter.</Empty>
        ) : (
          <div className="wpb-scroll">
            <table className="table">
              <thead>
                <tr>
                  <SortTh label="Name" col="name" sort={sort} onSort={onSort} first="asc" />
                  <SortTh label="Provider" col="provider" sort={sort} onSort={onSort} first="asc" />
                  <th scope="col">Activity</th>
                  <SortTh label="30-day activity" col="activity" sort={sort} onSort={onSort} numeric />
                  <SortTh label="Rewards (30d)" col="rewards" sort={sort} onSort={onSort} numeric />
                  <SortTh label="Rewards / 1k activity" col="rpk" sort={sort} onSort={onSort} numeric />
                  <SortTh label="7-day trend" col="trend" sort={sort} onSort={onSort} numeric />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    className="wpb-row"
                    tabIndex={0}
                    aria-selected={selected === a.id}
                    onClick={() => openRow(a.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRow(a.id);
                      }
                    }}
                  >
                    <td>
                      {a.name}
                      {a.featured && (
                        <>
                          {" "}
                          <Badge tone="neutral">Featured</Badge>
                        </>
                      )}
                    </td>
                    <td>{a.provider}</td>
                    <td>
                      <Sparkline points={a.activityDaily} />
                    </td>
                    <td className="r num">{fmt(a.activity30d, compact)}</td>
                    <td className="r num">{fmt(a.rewards30dCC, ccAmount)}</td>
                    <td className="r num">{fmt(a.rpk, ccAmount)}</td>
                    <td className={a.trend == null ? "r num" : `r ${trendClass(a.trend)}`}>
                      {a.trend == null ? DASH : trendLabel(a.trend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedApp && (
        <div className="panel wpb-detail">
          <h3>{selectedApp.name}</h3>
          <TimeSeriesChart area series={[{ name: "Activity", points: selectedApp.activityDaily }]} />
          <div className="wpb-party">
            <span className="muted">Party</span>
            {selectedApp.party == null ? (
              <span className="num">{DASH}</span>
            ) : (
              <PartyCopy party={selectedApp.party} copied={copied} onCopy={copyParty} />
            )}
          </div>
          {selectedApp.url && (
            <p>
              <a href={selectedApp.url} target="_blank" rel="noreferrer">
                {selectedApp.url}
              </a>
            </p>
          )}
        </div>
      )}

      <div className="panel">
        <h3>Movers</h3>
        {ranked.length === 0 ? (
          <Empty>Not enough daily activity to compute a 7-day trend.</Empty>
        ) : (
          <div className="wpb-movers">
            <div>
              <h4>Top 3 by 7-day growth</h4>
              <ul className="list">
                {growing.map((a) => (
                  <MoverRow key={a.id} app={a} />
                ))}
              </ul>
            </div>
            <div>
              <h4>Bottom 3 by 7-day growth</h4>
              <ul className="list">
                {slowing.map((a) => (
                  <MoverRow key={a.id} app={a} />
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
