import { useEffect, useState } from "react";
import { BarSeriesChart, TimeSeriesChart } from "../../charts";
import { Badge, Empty, Progress, Stat } from "../../components";
import { fetchValidators, useLoad } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";
import type { Validator, ValidatorsReport } from "../types";
import { DASH, ccAmount, cmp, fmt, nextSort, noteLine, parseParty, pct1, relativeTime, sumKnown, type SortState } from "./wpb/format";
import { PartyLabel } from "./wpb/party";
import { SortTh } from "./wpb/sort";
import { attentionQueue, livenessSplit, networkVersionOf, releasesBehind, RETIRED_AFTER_DAYS, sponsorScorecard, TIERS, type Issue } from "./health";
import "./wpb/wpb.css";

const PAGE = 50;
/** Rows per group before "Show all". */
const QUEUE_PREVIEW = 4;

export function Validators() {
  const { data, error, loading } = useLoad(fetchValidators);
  return (
    <NetworkPage
      title="Validators"
      lead="Who needs attention now, how each sponsor's validators are doing, and what validators earn."
      meta={data?.meta}
    >
      <LoadState loading={loading} error={error} />
      {data && <ValidatorsBody data={data} />}
    </NetworkPage>
  );
}

function ValidatorsBody({ data }: { data: ValidatorsReport }) {
  // Sample data has its own clock; live data is judged against now.
  const nowMs = data.meta.source === "fixture" ? Date.parse(data.meta.asOf) : Date.now();
  const note = data.meta.note;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [sort, setSort] = useState<SortState>({ col: "last", dir: "desc" });
  const [shown, setShown] = useState(PAGE);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    setShown(PAGE);
  }, [q, status, sort]);

  const list = data.validators;
  const network = networkVersionOf(list, data.networkVersion);
  const split = livenessSplit(list, nowMs);
  const queue = attentionQueue(list, network, nowMs);
  const allSponsors = sponsorScorecard(list, network, nowMs);
  // Sponsors whose validators are all retired add rows without information.
  const scorecard = allSponsors.filter((r) => r.current > 0);
  const allRetired = allSponsors.length - scorecard.length;
  const rewards = sumKnown(list.map((v) => v.rewards30dCC));
  const hasVersions = list.some((v) => v.version != null);
  const live = list.filter((v) => v.active);
  const liveCurrent = live.filter((v) => releasesBehind(v.version, network) === 0).length;

  const needle = q.trim().toLowerCase();
  const rows = list
    .filter((v) => {
      if (status === "active" && !v.active) return false;
      if (status === "inactive" && v.active) return false;
      if (!needle) return true;
      return (
        v.name.toLowerCase().includes(needle) ||
        (v.sponsor ?? "").toLowerCase().includes(needle) ||
        (v.version ?? "").startsWith(needle)
      );
    })
    .sort((a, b) => {
      if (sort.col === "name") return cmp(a.name, b.name, sort.dir);
      if (sort.col === "sponsor") return cmp(a.sponsor, b.sponsor, sort.dir);
      if (sort.col === "version") return cmp(a.version, b.version, sort.dir);
      if (sort.col === "rewards") return cmp(a.rewards30dCC, b.rewards30dCC, sort.dir);
      if (sort.col === "last") return cmp(a.lastActiveAt, b.lastActiveAt, sort.dir);
      return 0;
    });
  const visible = rows.slice(0, shown);
  const onSort = (col: string, first: "asc" | "desc") => setSort((s) => nextSort(s, col, first));
  const filterTable = (text: string, onlyLive = false) => {
    setQ(text);
    setStatus(onlyLive ? "active" : "all");
    document.getElementById("validator-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const showSponsor = (sponsor: string) => filterTable(parseParty(sponsor).hint);

  const tiers = ([1, 2, 3, 4] as const)
    .map((tier) => ({ tier, issues: queue.filter((i) => i.tier === tier) }))
    .filter((t) => t.issues.length > 0);

  return (
    <div className="wpb-stack">
      <div className="stats">
        <Stat label="Live validators" value={<span className="num">{`${split.live} / ${list.length}`}</span>} sub="live / listed" />
        <Stat label="Need attention" value={<span className="num">{queue.length}</span>} sub="offline under 30 days, or live and a release behind" />
        <Stat label="Retired" value={<span className="num">{split.retired}</span>} sub={`silent over ${RETIRED_AFTER_DAYS} days; not counted as incidents`} />
        <Stat
          label="On current release"
          value={<span className="num">{hasVersions && live.length ? pct1(liveCurrent / live.length) : DASH}</span>}
          sub={network ? `of live validators · network on ${network}` : noteLine(note, "version")}
        />
        <Stat label="Rewards (30d)" value={<span className="num">{fmt(rewards, ccAmount)}</span>} sub={rewards == null ? noteLine(note, "CC reward") : undefined} />
      </div>

      <div className="panel">
        <div className="wpb-head">
          <h3>Needs attention</h3>
          <span className="muted small">Ranked by urgency; most fixable first within each group</span>
        </div>
        {queue.length === 0 ? (
          <Empty>Nothing needs attention.</Empty>
        ) : (
          <>
            <div className="wpb-attn">
              {tiers.map(({ tier, issues }) => {
                const take = queueOpen ? issues : issues.slice(0, QUEUE_PREVIEW);
                return (
                  <div key={tier}>
                    <h4>
                      <span className={`wpb-tier t${tier}`} aria-hidden="true" /> {TIERS[tier].label} ({issues.length})
                    </h4>
                    <p className="muted small wpb-tier-hint">{TIERS[tier].hint}</p>
                    {take.length > 0 && <IssueList issues={take} onSponsor={showSponsor} />}
                  </div>
                );
              })}
            </div>
            {tiers.some((t) => t.issues.length > QUEUE_PREVIEW) && (
              <div className="wpb-pager">
                <button type="button" className="wpb-toggle" onClick={() => setQueueOpen((o) => !o)}>
                  {queueOpen ? "Show fewer" : `Show all ${queue.length}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="wpb-head">
            <h3>Sponsor scorecard</h3>
            <span className="muted small">Health = share live and on the current release</span>
          </div>
          {scorecard.length === 0 ? (
            <Empty>No sponsor data.</Empty>
          ) : (
            <div className="wpb-scroll">
              <table className="table wpb-score">
                <thead>
                  <tr>
                    <th scope="col">Sponsor</th>
                    <th scope="col" className="r">Validators</th>
                    <th scope="col" className="r">Live, behind</th>
                    <th scope="col" className="r">Offline</th>
                    <th scope="col" className="r">Retired</th>
                    <th scope="col" className="r">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.map((r) => (
                    <tr
                      key={r.sponsor}
                      className={r.self ? undefined : "wpb-row"}
                      tabIndex={r.self ? undefined : 0}
                      onClick={r.self ? undefined : () => showSponsor(r.sponsor)}
                      onKeyDown={(e) => !r.self && e.key === "Enter" && showSponsor(r.sponsor)}
                    >
                      <td className="wpb-clip">{r.self ? <span className="muted">Validators that list themselves</span> : <PartyLabel id={r.sponsor} />}</td>
                      <td className="r num">{r.current}</td>
                      <td className={`r num${r.live - r.liveOnCurrentRelease > 0 ? " wpb-lag" : ""}`}>{r.live - r.liveOnCurrentRelease}</td>
                      <td className={`r num${r.offline > 0 ? " wpb-down" : ""}`}>{r.offline}</td>
                      <td className="r num muted">{r.retired}</td>
                      <td className="r">
                        {r.health == null ? (
                          DASH
                        ) : (
                          <div className="wpb-uptime wpb-health">
                            <span className={`num ${r.health >= 0.9 ? "wpb-up" : r.health >= 0.7 ? "wpb-lag" : "wpb-down"}`}>{pct1(r.health)}</span>
                            <Progress value={r.health} label={`${parseParty(r.sponsor).hint} health`} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">
            Sponsor = the super validator that onboarded each validator. Validators excludes retired ones
            {allRetired > 0 ? `; ${allRetired} more sponsors have only retired validators` : ""}. Select a sponsor to list its validators.
          </p>
        </div>

        <div className="panel">
          {data.series.activeDaily.length > 0 ? (
            <>
              <h3>Active validators per day</h3>
              <TimeSeriesChart series={[{ name: "Active validators", points: data.series.activeDaily }]} />
            </>
          ) : (
            <>
              <h3>Liveness</h3>
              <div className="wpb-split" role="img" aria-label={`${split.live} live, ${split.offline} offline, ${split.retired} retired`}>
                <span className="wpb-split-a" style={{ flexGrow: split.live }} />
                <span className="wpb-split-c" style={{ flexGrow: split.offline }} />
                <span className="wpb-split-b" style={{ flexGrow: split.retired }} />
              </div>
              <ul className="wpb-key">
                <li><span className="wpb-dot a" />{split.live.toLocaleString("en-US")} live</li>
                <li><span className="wpb-dot c" />{split.offline.toLocaleString("en-US")} offline under {RETIRED_AFTER_DAYS} days</li>
                <li><span className="wpb-dot b" />{split.retired.toLocaleString("en-US")} retired (silent over {RETIRED_AFTER_DAYS} days)</li>
              </ul>
            </>
          )}
          {hasVersions && <ReleaseBars list={list} network={network} onPick={(minor) => filterTable(minor, true)} />}
          {data.series.rewardsPerRoundCC.length > 0 && (
            <>
              <h3 className="wpb-gap">Rewards per round</h3>
              <BarSeriesChart name="CC per round" points={data.series.rewardsPerRoundCC} />
            </>
          )}
        </div>
      </div>

      <div className="panel" id="validator-table">
        <h3>Validators</h3>
        <div className="wpb-toolbar">
          <label className="wpb-search">
            <span>Filter</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, sponsor or version" />
          </label>
          <div className="wpb-seg" role="group" aria-label="Status">
            {(["all", "active", "inactive"] as const).map((id) => (
              <button key={id} type="button" aria-pressed={status === id} onClick={() => setStatus(id)}>
                {id === "all" ? "All" : id === "active" ? "Live" : "Inactive"}
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
                    <SortTh label="Version" col="version" sort={sort} onSort={onSort} />
                    <th scope="col">Status</th>
                    <SortTh label="Rewards (30d)" col="rewards" sort={sort} onSort={onSort} numeric />
                    <SortTh label="Last active" col="last" sort={sort} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((v) => {
                    const behind = v.active ? releasesBehind(v.version, network) : null;
                    return (
                      <tr key={v.id}>
                        <td className="wpb-clip"><PartyLabel id={v.name} /></td>
                        <td className="wpb-clip">
                          {v.sponsor ? v.sponsor === v.id ? <span className="muted">itself</span> : <PartyLabel id={v.sponsor} /> : DASH}
                        </td>
                        <td className={behind ? "wpb-lag" : undefined}>{v.version ?? DASH}</td>
                        <td><Badge tone={v.active ? "good" : "bad"}>{v.active ? "Live" : "Inactive"}</Badge></td>
                        <td className="r num">{fmt(v.rewards30dCC, ccAmount)}</td>
                        <td className="num">{relativeTime(v.lastActiveAt, nowMs)}</td>
                      </tr>
                    );
                  })}
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
    </div>
  );
}

function IssueList({ issues, onSponsor }: { issues: Issue[]; onSponsor: (sponsor: string) => void }) {
  return (
    <ul className="list">
      {issues.map(({ validator: v, reason }) => (
        <li key={v.id}>
          <PartyLabel id={v.name} copy />
          <span className="muted">
            {reason}
            {v.sponsor && v.sponsor !== v.id && (
              <>
                {" · sponsor "}
                <button type="button" className="wpb-linkish" onClick={() => onSponsor(v.sponsor!)}>
                  {parseParty(v.sponsor).hint}
                </button>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Live validators per minor release, measured against the network version. */
function ReleaseBars({ list, network, onPick }: { list: Validator[]; network: string | null; onPick: (minor: string) => void }) {
  const byMinor = new Map<string, number>();
  for (const v of list) {
    if (!v.active || !v.version) continue;
    const minor = v.version.split(".").slice(0, 2).join(".");
    byMinor.set(minor, (byMinor.get(minor) ?? 0) + 1);
  }
  const rows = [...byMinor].sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <>
      <h3 className="wpb-gap">Live validators by release</h3>
      <ul className="wpb-barlist">
        {rows.map(([minor, n]) => {
          const behind = releasesBehind(`${minor}.0`, network);
          return (
            <li key={minor}>
              <button type="button" className="wpb-linkish" onClick={() => onPick(`${minor}.`)}>
                {minor}.x
              </button>
              <span className="num">
                {n}
                {behind === 0 ? " · current" : behind ? ` · ${behind} behind` : ""}
              </span>
              <div className="track">
                <span className={`fill${behind ? " lag" : ""}`} style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
