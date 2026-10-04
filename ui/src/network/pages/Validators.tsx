import { useEffect, useState } from "react";
import { BarSeriesChart, TimeSeriesChart } from "../../charts";
import { Badge, Empty, Progress, Stat } from "../../components";
import { fetchValidators, useLoad } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";
import type { Validator, ValidatorsReport } from "../types";
import { DASH, ccAmount, cmp, fmt, median, nextSort, noteLine, pct1, relativeTime, sumKnown, type SortState } from "./wpb/format";
import { PartyLabel } from "./wpb/party";
import { SortTh } from "./wpb/sort";
import "./wpb/wpb.css";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 50;

const ATTN: { key: string; label: string; test: (v: Validator, nowMs: number) => boolean }[] = [
  { key: "stale", label: "Stale", test: (v) => !v.active },
  { key: "uptime", label: "Low uptime", test: (v) => v.uptime30d != null && v.uptime30d < 0.95 },
  {
    key: "unseen",
    label: "Not seen for 24h",
    test: (v, nowMs) => !!(v.lastActiveAt && nowMs - Date.parse(v.lastActiveAt) > DAY_MS),
  },
];

export function Validators() {
  const { data, error, loading } = useLoad(fetchValidators);
  return (
    <NetworkPage
      title="Validators"
      lead="Who is reliable, who is falling behind, and what validators earn."
      meta={data?.meta}
    >
      <LoadState loading={loading} error={error} />
      {data && <ValidatorsBody data={data} />}
    </NetworkPage>
  );
}

function attentionReasons(v: Validator, nowMs: number): string[] {
  const reasons: string[] = [];
  if (!v.active) reasons.push("Inactive");
  if (v.lastActiveAt && nowMs - Date.parse(v.lastActiveAt) > DAY_MS) {
    reasons.push(`Last active ${relativeTime(v.lastActiveAt, nowMs)}`);
  }
  if (v.uptime30d != null && v.uptime30d < 0.95) reasons.push(`Uptime ${pct1(v.uptime30d)}`);
  return reasons;
}

function ValidatorsBody({ data }: { data: ValidatorsReport }) {
  const nowMs = Date.parse(data.meta.asOf);
  const note = data.meta.note;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [sort, setSort] = useState<SortState>({ col: "uptime", dir: "desc" });
  const [shown, setShown] = useState(PAGE);
  const [attnOpen, setAttnOpen] = useState(false);

  useEffect(() => {
    setShown(PAGE);
  }, [q, status, sort]);

  const list = data.validators;
  const active = list.filter((v) => v.active).length;
  const stale = list.length - active;
  const flagged = list
    .map((v) => ({ v, reasons: attentionReasons(v, nowMs) }))
    .filter((row) => row.reasons.length > 0);
  const uptimes = list.map((v) => v.uptime30d).filter((n): n is number => n != null);
  const rewards = sumKnown(list.map((v) => v.rewards30dCC));
  const hasVersions = list.some((v) => v.version != null);

  const versions = new Map<string, Validator[]>();
  if (hasVersions) {
    for (const v of list) {
      const key = v.version ?? DASH;
      const bucket = versions.get(key);
      if (bucket) bucket.push(v);
      else versions.set(key, [v]);
    }
  }
  const versionRows = [...versions.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const commonVersion = versionRows[0]?.[0];

  const bySponsor = new Map<string, number>();
  for (const v of list) {
    if (!v.sponsor) continue;
    bySponsor.set(v.sponsor, (bySponsor.get(v.sponsor) ?? 0) + 1);
  }
  const topSponsors = [...bySponsor.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
  const maxSponsor = topSponsors[0]?.[1] ?? 0;

  const groups = ATTN.map((g) => ({
    key: g.key,
    label: g.label,
    rows: list.filter((v) => g.test(v, nowMs)),
  })).filter((g) => g.rows.length > 0);

  const needle = q.trim().toLowerCase();
  const rows = list
    .filter((v) => {
      if (status === "active" && !v.active) return false;
      if (status === "inactive" && v.active) return false;
      if (!needle) return true;
      return v.name.toLowerCase().includes(needle) || (v.sponsor ?? "").toLowerCase().includes(needle);
    })
    .sort((a, b) => {
      if (sort.col === "name") return cmp(a.name, b.name, sort.dir);
      if (sort.col === "sponsor") return cmp(a.sponsor, b.sponsor, sort.dir);
      if (sort.col === "uptime") return cmp(a.uptime30d, b.uptime30d, sort.dir);
      if (sort.col === "rewards") return cmp(a.rewards30dCC, b.rewards30dCC, sort.dir);
      if (sort.col === "last") return cmp(a.lastActiveAt, b.lastActiveAt, sort.dir);
      return 0;
    });
  const visible = rows.slice(0, shown);

  const onSort = (col: string, first: "asc" | "desc") => setSort((s) => nextSort(s, col, first));

  let attnBudget = attnOpen ? Number.POSITIVE_INFINITY : 10;

  return (
    <div className="wpb-stack">
      <div className="stats">
        <Stat label="Validators" value={<span className="num">{`${active} / ${list.length}`}</span>} sub="active / total" />
        <Stat
          label="Median 30-day uptime"
          value={<span className="num">{fmt(median(uptimes), pct1)}</span>}
          sub={uptimes.length === 0 ? noteLine(note, "uptime") : undefined}
        />
        <Stat
          label="Rewards (30d)"
          value={<span className="num">{fmt(rewards, ccAmount)}</span>}
          sub={rewards == null ? noteLine(note, "CC reward") : undefined}
        />
        <Stat label="Needs attention" value={<span className="num">{flagged.length}</span>} />
      </div>

      <div className="grid-2">
        {data.series.activeDaily.length > 0 ? (
          <div className="panel">
            <h3>Active validators per day</h3>
            <TimeSeriesChart series={[{ name: "Active validators", points: data.series.activeDaily }]} />
          </div>
        ) : (
          <div className="panel">
            <h3>Validators by sponsor</h3>
            {topSponsors.length === 0 ? (
              <Empty>No sponsor data.</Empty>
            ) : (
              <ul className="wpb-barlist">
                {topSponsors.map(([id, n]) => (
                  <li key={id}>
                    <PartyLabel id={id} />
                    <span className="num">{n}</span>
                    <div className="track">
                      <span className="fill" style={{ width: `${maxSponsor === 0 ? 0 : (n / maxSponsor) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {data.series.rewardsPerRoundCC.length > 0 ? (
          <div className="panel">
            <h3>Rewards per round</h3>
            <BarSeriesChart name="CC per round" points={data.series.rewardsPerRoundCC} />
          </div>
        ) : (
          <div className="panel">
            <h3>Liveness</h3>
            <div className="wpb-split" role="img" aria-label={`${active} active, ${stale} stale`}>
              <span className="wpb-split-a" style={{ flexGrow: active }} />
              <span className="wpb-split-b" style={{ flexGrow: stale }} />
            </div>
            <p className="muted">
              {active.toLocaleString("en-US")} active · {stale.toLocaleString("en-US")} stale
            </p>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Needs attention</h3>
        {flagged.length === 0 ? (
          <Empty>All validators healthy</Empty>
        ) : (
          <>
            <div className="wpb-attn">
              {groups.map((g) => {
                const take = g.rows.slice(0, attnBudget);
                if (Number.isFinite(attnBudget)) attnBudget -= take.length;
                return (
                  <div key={g.key}>
                    <h4>
                      {g.label} ({g.rows.length})
                    </h4>
                    {take.length > 0 && (
                      <ul className="list">
                        {take.map((v) => (
                          <li key={v.id}>
                            <PartyLabel id={v.name} copy />
                            <span className="muted">{attentionReasons(v, nowMs).join(", ")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
            {flagged.length > 10 && (
              <div className="wpb-pager">
                <button type="button" className="wpb-toggle" onClick={() => setAttnOpen((o) => !o)}>
                  {attnOpen ? "Show first 10" : `Show all ${flagged.length}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h3>Validators</h3>
        <div className="wpb-toolbar">
          <label className="wpb-search">
            <span>Filter</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or sponsor"
            />
          </label>
          <div className="wpb-seg" role="group" aria-label="Status">
            {(["all", "active", "inactive"] as const).map((id) => (
              <button key={id} type="button" aria-pressed={status === id} onClick={() => setStatus(id)}>
                {id === "all" ? "All" : id === "active" ? "Active" : "Inactive"}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty>No validators match this filter.</Empty>
        ) : (
          <>
            <div className="wpb-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <SortTh label="Name" col="name" sort={sort} onSort={onSort} first="asc" />
                    <SortTh label="Sponsor" col="sponsor" sort={sort} onSort={onSort} first="asc" />
                    <th scope="col">Version</th>
                    <th scope="col">Status</th>
                    <SortTh label="Uptime" col="uptime" sort={sort} onSort={onSort} numeric />
                    <SortTh label="Rewards (30d)" col="rewards" sort={sort} onSort={onSort} numeric />
                    <SortTh label="Last active" col="last" sort={sort} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((v) => (
                    <tr key={v.id}>
                      <td className="wpb-clip">
                        <PartyLabel id={v.name} />
                      </td>
                      <td className="wpb-clip">{v.sponsor ? <PartyLabel id={v.sponsor} /> : DASH}</td>
                      <td>{v.version ?? DASH}</td>
                      <td>
                        <Badge tone={v.active ? "good" : "bad"}>{v.active ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="r">
                        {v.uptime30d == null ? (
                          <span className="num">{DASH}</span>
                        ) : (
                          <div className="wpb-uptime">
                            <span className="num">{pct1(v.uptime30d)}</span>
                            <Progress value={v.uptime30d} label={`${v.name} uptime`} />
                          </div>
                        )}
                      </td>
                      <td className="r num">{fmt(v.rewards30dCC, ccAmount)}</td>
                      <td className="num">{relativeTime(v.lastActiveAt, nowMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="wpb-pager">
              <span>
                Showing {visible.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
              </span>
              {shown < rows.length && (
                <button type="button" className="wpb-toggle" onClick={() => setShown((n) => n + PAGE)}>
                  Show more
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {hasVersions && (
        <div className="panel">
          <h3>Versions in use</h3>
          {versionRows.length === 0 ? (
            <Empty>No version data.</Empty>
          ) : (
            <ul className="wpb-versions">
              {versionRows.map(([ver, vs]) => {
                const behind = ver !== commonVersion;
                return (
                  <li key={ver} className={behind ? "wpb-lag" : undefined}>
                    <span>{ver}</span>
                    <span className="num">
                      {vs.length}
                      {behind ? " · not most common" : " · most common"}
                    </span>
                    {behind && <span className="names">{vs.map((v) => v.name).join(", ")}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
