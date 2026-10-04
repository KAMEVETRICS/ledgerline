import { useEffect, useState, type ReactNode } from "react";
import { compact, usdCompact, SERIES_COLORS } from "../../charts";
import { Badge, Empty, Stat } from "../../components";
import { fetchParty, useLoad } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";
import type { Holding, PartyPortfolio } from "../types";
import { formatValue, normalizeParty, partyFromHash, portfolioHash, portfolioValue, percentage, percent, readRecent, recentWith, shortId, sortHoldings, writeRecent, type SortDirection } from "./wpc/model";
import "./wpc/wpc.css";

const VALIDATION = "Enter a party ID of 3–512 characters containing ::. Use letters, numbers, underscores, dots, hyphens and colons.";
const TITLE = "Portfolio lookup";
const LEAD = "Check a counterparty's public holdings and recent activity, or monitor a treasury.";

export function Portfolio() {
  const [input, setInput] = useState(() => partyFromHash(window.location.hash));
  const [party, setParty] = useState(() => normalizeParty(partyFromHash(window.location.hash)));
  const [generation, setGeneration] = useState(0);
  const [validation, setValidation] = useState(() => input && !normalizeParty(input) ? VALIDATION : "");
  const [recent, setRecent] = useState(() => readRecent(() => window.localStorage));

  useEffect(() => {
    const sync = () => {
      const id = partyFromHash(window.location.hash);
      setInput(id); setParty(normalizeParty(id)); setValidation(id && !normalizeParty(id) ? VALIDATION : "");
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => { if (party) setRecent(ids => recentWith(ids, party)); }, [party]);
  useEffect(() => { writeRecent(() => window.localStorage, recent); }, [recent]);

  function lookup(value: string) {
    const id = normalizeParty(value);
    if (!id) { setValidation(VALIDATION); return; }
    setInput(id); setValidation(""); setParty(id);
    setGeneration(n => n + 1); setRecent(ids => recentWith(ids, id));
    window.location.hash = portfolioHash(id);
  }
  const controls = (
    <section className="panel" aria-label="Party search">
      <form className="wpc-search" onSubmit={e => { e.preventDefault(); lookup(input); }}>
        <label className="field" htmlFor="wpc-party"><span>Party ID</span><input id="wpc-party" value={input} onChange={e => { setInput(e.target.value); setValidation(""); }} placeholder="hint::fingerprint" maxLength={512} autoComplete="off" spellCheck={false} aria-invalid={!!validation} aria-describedby={validation ? "wpc-party-help wpc-party-error" : "wpc-party-help"} /></label>
        <button type="submit" className="btn primary">Look up</button>
      </form>
      <p id="wpc-party-help" className="wpc-help">Enter a Canton party ID. Each lookup has a shareable URL; private or unavailable values remain “—”.</p>
      {validation && <p id="wpc-party-error" className="wpc-error" role="alert">{validation}</p>}
      {recent.length > 0 && <div className="wpc-recents" aria-label="Recent lookups"><span className="muted small">Recent</span>{recent.map(id => <button key={id} type="button" className="wpc-chip" title={id} onClick={() => lookup(id)}>{shortId(id)}</button>)}</div>}
    </section>
  );

  if (party) return <Lookup key={`${party}:${generation}`} party={party} controls={controls} />;
  return <NetworkPage title={TITLE} lead={LEAD}>{controls}<section className="panel wpc-empty"><h3>Look up a public portfolio</h3><p className="muted">Enter a party ID to see reported holdings, valued allocation and recent transfers. Hidden balances and USD values are never estimated.</p><button className="btn ghost" type="button" onClick={() => { setInput("sample-party::12200000"); setValidation(""); }}>Fill example party</button></section></NetworkPage>;
}

/** Mount the data hook only after validation, so the empty form makes no party request. */
function Lookup({ party, controls }: { party: string; controls: ReactNode }) {
  const { data, error, loading } = useLoad(() => fetchParty(party), party);
  const mismatch = data && data.party !== party && data.meta.source !== "fixture" ? "The source returned a different party. No holdings are shown for this lookup." : null;
  return <NetworkPage title={TITLE} lead={LEAD} meta={data?.meta}>
    {controls}<div role="status" aria-live="polite"><LoadState loading={loading} error={error ?? mismatch} /></div>
    {data && !loading && !mismatch && <PortfolioBody data={data} requested={party} />}
  </NetworkPage>;
}

function PortfolioBody({ data, requested }: { data: PartyPortfolio; requested: string }) {
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [copy, setCopy] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const [activityCount, setActivityCount] = useState(20);
  const value = portfolioValue(data.holdings);
  const valued = sortHoldings(data.holdings).filter(h => h.valueUsd !== null);
  const color = (holding: Holding) => SERIES_COLORS[Math.max(0, valued.indexOf(holding)) % SERIES_COLORS.length];
  const activities = [...data.recent].sort((a, b) => b.at.localeCompare(a.at));
  async function copyParty() {
    try { await navigator.clipboard.writeText(data.party); setCopyFailed(false); setCopy("Party ID copied."); }
    catch { setCopyFailed(true); setCopy("Copy unavailable. Select and copy the full party ID below."); }
  }
  return <div className="wpc-stack">
    <section className="panel" aria-labelledby="wpc-result">
      <div className="wpc-result-head">
        <div><h3 id="wpc-result">Reported party</h3><div className="wpc-party"><span className="wpc-id" title={data.party}>{shortId(data.party)}</span><button type="button" className="btn ghost" aria-label="Copy party ID" onClick={copyParty}>Copy ID</button></div><p className="wpc-copy-status" role="status" aria-live="polite">{copy}</p>{copyFailed && <label className="field wpc-copy-fallback"><span>Full party ID</span><input readOnly value={data.party} onFocus={e => e.currentTarget.select()} /></label>}</div>
        <div className="wpc-total"><Stat label="Total reported USD value" value={formatValue(value.total, usdCompact)} sub={`${value.valued} of ${data.holdings.length} holdings valued`} /></div>
      </div>
      <p className="wpc-help">{data.holdings.length === 0 ? "No holdings were reported." : <>{value.unvalued} {value.unvalued === 1 ? "holding has" : "holdings have"} no USD value.{value.unvalued > 0 ? " The reported total and allocation exclude them." : " All listed holdings are valued."}</>}</p>
      {data.party !== requested && <Empty>This sample source returns the same example portfolio for every lookup. Requested: <span className="wpc-id" title={requested}>{shortId(requested)}</span>.</Empty>}
      {data.meta.note && <p className="wpc-note">{data.meta.note}</p>}
      <h3>Allocation of valued holdings</h3>
      {value.allocatable ? <>
        <div className="wpc-allocation" role="img" aria-label={`Valued allocation: ${valued.map(h => `${h.instrument} ${percent(percentage(h.valueUsd, value.total)!)}`).join(", ")}`}>
          {valued.filter(h => h.valueUsd! > 0).map((h, i) => <span key={`${h.instrument}-${h.admin}-${i}`} style={{ width: `${percentage(h.valueUsd, value.total)}%`, background: color(h) }} title={`${h.instrument}: ${percent(percentage(h.valueUsd, value.total)!)}`} />)}
        </div>
        <ul className="wpc-legend">{valued.map((h, i) => <li key={`${h.instrument}-${h.admin}-${i}`}><span className="wpc-swatch" style={{ background: color(h) }} aria-hidden="true" />{h.instrument} <span className="num">{percent(percentage(h.valueUsd, value.total)!)}</span></li>)}</ul>
      </> : <Empty>{value.total === null ? "USD allocation is unavailable because no positive total is reported." : "No positive USD allocation can be shown for these reported values."}</Empty>}
    </section>

    <section className="panel" aria-labelledby="wpc-holdings">
      <div className="wpc-section-head"><h3 id="wpc-holdings">Holdings</h3><span className="muted small">Publicly reported instruments</span></div>
      {data.holdings.length === 0 ? <Empty>No holdings reported by this source.</Empty> : <div className="wpc-scroll" role="region" aria-label="Holdings table" tabIndex={0}>
        <table className="table wpc-holdings"><thead><tr><th scope="col">Instrument</th><th scope="col">Issuer</th><th scope="col" className="r">Amount</th><th scope="col" className="r" aria-sort={direction === "desc" ? "descending" : "ascending"}><button className="wpc-sort" onClick={() => setDirection(d => d === "desc" ? "asc" : "desc")}>Value · USD <span aria-hidden="true">{direction === "desc" ? "↓" : "↑"}</span></button></th><th scope="col" className="r">Share of valued total</th></tr></thead>
          <tbody>{sortHoldings(data.holdings, direction).map((h, i) => {
            const share = value.allocatable ? percentage(h.valueUsd, value.total) : null;
            return <tr key={`${h.instrument}-${h.admin}-${i}`}><td>{h.instrument}</td><td><span className="wpc-id" title={h.admin ?? undefined}>{h.admin ? shortId(h.admin) : "—"}</span></td><td className="num r">{compact(h.amount)}{h.instrument === "CC" ? " CC" : ""}</td><td className="num r">{formatValue(h.valueUsd, usdCompact)}</td><td className="num r"><div className="wpc-share">{share !== null && <div className="wpc-share-bar" role="meter" aria-label={`${h.instrument} share of valued total`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={share}><span style={{ width: `${share}%`, background: color(h) }} /></div>}{formatValue(share, n => percent(n))}</div></td></tr>;
          })}</tbody></table>
      </div>}
      {data.holdings.length > 0 && <p className="wpc-scroll-hint">Scroll horizontally for all columns.</p>}
    </section>
    <section className="panel" aria-labelledby="wpc-activity">
      <div className="wpc-section-head"><h3 id="wpc-activity">Recent activity</h3><span className="muted small">Dates in UTC · {data.recent.length} reported events</span></div>
      {activities.length === 0 ? <Empty>No recent activity reported by this source.</Empty> : <>
        <ul className="wpc-activity">{activities.slice(0, activityCount).map(op => <li key={op.id}>
          <time className="wpc-activity-time" dateTime={op.at} title={op.at}>{new Date(op.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</time>
          <div className="wpc-activity-type"><span>{op.type.replaceAll("_", " ")}</span><Badge tone={op.direction === "in" ? "good" : "neutral"}>{op.direction === "in" ? "In" : op.direction === "out" ? "Out" : "Other"}</Badge></div>
          <div className="wpc-activity-counterparty"><span className="muted small">Counterparty </span><span className="wpc-id" title={op.counterparty ?? undefined}>{op.counterparty ? shortId(op.counterparty) : "—"}</span></div>
          <div className="wpc-activity-amount"><span className="num">{formatValue(op.amount, compact)}</span><div className="muted small">{op.instrument ?? "—"}</div></div>
        </li>)}</ul>
        {activities.length > activityCount && <button type="button" className="btn ghost" onClick={() => setActivityCount(n => n + 20)}>Show more activity ({Math.min(activityCount, activities.length)} of {activities.length})</button>}
      </>}
    </section>
  </div>;
}
