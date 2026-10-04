import { useState } from "react";
import { BarSeriesChart, TimeSeriesChart } from "../../charts";
import { Badge, Empty, Progress, Stat } from "../../components";
import { fetchValidators, useLoad } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";
import type { Validator, ValidatorsReport } from "../types";
import { DASH, ccAmount, cmp, fmt, median, nextSort, pct1, relativeTime, sumKnown, type SortState } from "./wpb/format";
import { SortTh } from "./wpb/sort";
import "./wpb/wpb.css";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [sort, setSort] = useState<SortState>({ col: "uptime", dir: "desc" });

  const list = data.validators;
  const active = list.filter((v) => v.active).length;
  const flagged = list
    .map((v) => ({ v, reasons: attentionReasons(v, nowMs) }))
    .filter((row) => row.reasons.length > 0);
  const uptimes = list.map((v) => v.uptime30d).filter((n): n is number => n != null);
  const rewards = sumKnown(list.map((v) => v.rewards30dCC));

  const versions = new Map<string, Validator[]>();
  for (const v of list) {
    const key = v.version ?? "Unknown";
    const bucket = versions.get(key);
    if (bucket) bucket.push(v);
    else versions.set(key, [v]);
  }
  const versionRows = [...versions.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const commonVersion = versionRows[0]?.[0];

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

  const onSort = (col: string, first: "asc" | "desc") => setSort((s) => nextSort(s, col, first));

  return (
    <div className="wpb-stack">
      <div className="stats">
        <Stat label="Validators" value={<span className="num">{`${active} / ${list.length}`}</span>} sub="active / total" />
        <Stat label="Median 30-day uptime" value={<span className="num">{fmt(median(uptimes), pct1)}</span>} />
        <Stat label="Rewards (30d)" value={<span className="num">{fmt(rewards, ccAmount)}</span>} />
        <Stat label="Needs attention" value={<span className="num">{flagged.length}</span>} />
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Active validators per day</h3>
          <TimeSeriesChart series={[{ name: "Active validators", points: data.series.activeDaily }]} />
        </div>
        <div className="panel">
          <h3>Rewards per round</h3>
          <BarSeriesChart name="CC per round" points={data.series.rewardsPerRoundCC} />
        </div>
      </div>

      <div className="panel">
        <h3>Needs attention</h3>
        {flagged.length === 0 ? (
          <Empty>All validators healthy</Empty>
        ) : (
          <ul className="list">
            {flagged.map(({ v, reasons }) => (
              <li key={v.id}>
                <span>{v.name}</span>
                <span className="muted">{reasons.join(", ")}</span>
              </li>
            ))}
          </ul>
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
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td>{v.sponsor ?? DASH}</td>
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
        )}
      </div>

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
    </div>
  );
}
