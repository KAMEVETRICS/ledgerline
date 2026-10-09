// Network overview: three live hero cards (CC price, validators, transfers),
// the private-markets call to action, and a network-health summary built on
// the attention queue. Every number links to the page that explains it.
import { HeroSpark, SourceBadge, compact, usdCompact } from "../../charts";
import { Icon, Logo } from "../../shell";
import { fetchLiquidity, fetchOverview, fetchValidators, useLoad } from "../api";
import { LoadState } from "../NetworkSection";
import type { LiquidityReport, NetworkOverview, Point, ValidatorsReport } from "../types";
import { attentionQueue, livenessSplit, networkVersionOf, releasesBehind, TIERS } from "./health";
import { relativeTime, usd4 } from "./wpb/format";
import "./wpb/wpb.css";

const go = (route: string) => (window.location.hash = `/${route}`);
const pctChange = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : null);

export function Overview() {
  const overview = useLoad(fetchOverview);
  const liquidity = useLoad(fetchLiquidity);
  const validators = useLoad(fetchValidators);
  return (
    <>
      <LoadState loading={overview.loading} error={overview.error} />
      {overview.data && <OverviewBody o={overview.data} l={liquidity.data} v={validators.data} />}
    </>
  );
}

function Delta({ value, suffix = "", tone }: { value: number | null; suffix?: string; tone?: "good" | "bad" | "neutral" }) {
  if (value == null) return <span className="ov-delta neutral">—</span>;
  const t = tone ?? (value >= 0 ? "good" : "bad");
  return (
    <span className={`ov-delta ${t}`}>
      <span className="pip" aria-hidden="true">{t === "bad" ? "↓" : t === "good" ? "↑" : "•"}</span>
      {`${value > 0 ? "+" : ""}${value.toFixed(2)}%${suffix}`}
    </span>
  );
}

function HeroCard({ icon, kicker, title, route, children }: { icon: string; kicker: string; title: string; route: string; children: React.ReactNode }) {
  return (
    <button className="ov-card" onClick={() => go(route)}>
      <div className="ov-card-head">
        <span className="ov-icon"><Icon name={icon} /></span>
        <div>
          <span className="kicker">{kicker}</span>
          <strong>{title}</strong>
        </div>
        <span className="icon-btn go" aria-hidden="true"><Icon name="arrow" size={15} /></span>
      </div>
      {children}
    </button>
  );
}

function OverviewBody({ o, l, v }: { o: NetworkOverview; l: LiquidityReport | null; v: ValidatorsReport | null }) {
  const nowMs = o.meta.source === "fixture" ? Date.parse(o.meta.asOf) : Date.now();

  // CC price: market price when CoinGecko is available, else the governance price.
  const history = l?.cc.priceHistoryUsd?.length ? l.cc.priceHistoryUsd : l?.cc.priceUsd ?? [];
  const month = l?.cc.priceUsd ?? [];
  const price = month.at(-1)?.v ?? o.ccPriceUsd;
  const priceChange = month.length >= 2 ? pctChange(month[0].v, month.at(-1)!.v) : null;
  const marketPrice = (l?.meta.sources ?? []).includes("CoinGecko");

  // Transfers: the latest complete UTC day against the seven days before it.
  const days = o.series.transfersDaily;
  const complete = days.length > 1 ? days.slice(0, -1) : days;
  const lastDay = complete.at(-1);
  const prior = complete.slice(-8, -1);
  const priorAvg = prior.length ? prior.reduce((s, p) => s + p.v, 0) / prior.length : null;
  const transferChange = lastDay && priorAvg ? pctChange(priorAvg, lastDay.v) : null;

  // Validators and the attention queue.
  const network = v ? networkVersionOf(v.validators, v.networkVersion) : null;
  const queue = v ? attentionQueue(v.validators, network, nowMs) : [];
  const split = v ? livenessSplit(v.validators, nowMs) : null;
  const live = v ? v.validators.filter((x) => x.active) : [];
  const current = live.filter((x) => releasesBehind(x.version, network) === 0).length;
  const adoption = live.length ? current / live.length : null;
  const tierCount = (t: 1 | 2 | 3 | 4) => queue.filter((i) => i.tier === t).length;
  const sources = [...new Set([o.meta, l?.meta, v?.meta].flatMap((m) => (m ? m.sources ?? ["CC Space"] : [])).concat(l ? ["OneSwap"] : []))];
  const marketCap = price != null && o.ccSupply != null ? price * o.ccSupply : null;

  return (
    <div className="wpb-stack">
      <section className="ov-top">
        <div className="ov-left">
          <div className="ov-headrow">
            <div>
              <div className="eyebrow">
                Canton mainnet, live <Icon name="clock" size={14} />
                <span className="count" title={sources.join(", ")}>{sources.length} public sources</span>
              </div>
              <h2>Network overview</h2>
            </div>
            <SourceBadge meta={o.meta} />
          </div>

          <div className="ov-cards">
            <HeroCard icon="coin" kicker={marketPrice ? "Market price · CoinGecko" : "Governance price"} title="Canton Coin (CC)" route="network/liquidity">
              <span className="ov-label">Price, USD</span>
              <span className="ov-value">{price != null ? usd4(price) : "—"}</span>
              <Delta value={priceChange} suffix=" · 30d" />
              <div className="ov-spark">
                <HeroSpark points={history.slice(-120)} tone={priceChange != null && priceChange < 0 ? "bad" : "accent"} label={price != null ? usd4(price) : undefined} format={usd4} />
              </div>
            </HeroCard>

            <HeroCard icon="validators" kicker="Liveness · 5N Lighthouse" title="Validators" route="network/validators">
              <span className="ov-label">Live now</span>
              <span className="ov-value">
                {o.validators.active.toLocaleString("en-US")}
                <small> / {o.validators.total.toLocaleString("en-US")}</small>
              </span>
              {v ? (
                <span className={`ov-delta ${queue.length ? "bad" : "good"}`}>
                  <span className="pip" aria-hidden="true">!</span>
                  {queue.length} need attention
                </span>
              ) : (
                <span className="ov-delta neutral">Loading attention queue…</span>
              )}
              {o.series.activeValidatorsDaily.length > 1 ? (
                <div className="ov-spark"><HeroSpark points={o.series.activeValidatorsDaily} /></div>
              ) : (
                split && (
                  <div className="ov-split">
                    <div className="wpb-split" role="img" aria-label={`${split.live} live, ${split.offline} offline, ${split.retired} retired`}>
                      <span className="wpb-split-a" style={{ flexGrow: split.live }} />
                      <span className="wpb-split-c" style={{ flexGrow: split.offline }} />
                      <span className="wpb-split-b" style={{ flexGrow: split.retired }} />
                    </div>
                    <ul className="wpb-key">
                      <li><span className="wpb-dot a" />{split.live.toLocaleString("en-US")} live</li>
                      <li><span className="wpb-dot c" />{split.offline} offline under 30 days</li>
                      <li><span className="wpb-dot b" />{split.retired} retired</li>
                    </ul>
                  </div>
                )
              )}
            </HeroCard>

            <HeroCard icon="pulse" kicker="On-ledger · CC Space" title="Transfers per day" route="network/liquidity">
              <span className="ov-label">{lastDay ? `Transfers on ${new Date(`${lastDay.t}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "Transfers"}</span>
              <span className="ov-value">{lastDay ? compact(lastDay.v) : "—"}</span>
              <Delta value={transferChange} suffix=" · vs 7d avg" />
              <div className="ov-spark">
                <HeroSpark points={complete as Point[]} tone={transferChange != null && transferChange < 0 ? "bad" : "accent"} label={lastDay ? compact(lastDay.v) : undefined} />
              </div>
            </HeroCard>
          </div>
        </div>

        <aside className="ov-promo">
          <div className="ov-promo-top">
            <span className="brandmark"><Logo size={22} /> Ledgerline<sup>®</sup></span>
            <span className="ov-new">Demo</span>
          </div>
          <h3>Private markets on Canton</h3>
          <p>Fund flows, one portfolio across managers, and benchmarks no single party can see, each computed on the party's own node.</p>
          <div className="ov-promo-actions">
            <button className="btn primary lg" onClick={() => go("view-as")}>
              View as a party <Icon name="parties" size={17} />
            </button>
            <button className="btn ghost lg" onClick={() => go("view-as")}>
              Start your own fund <Icon name="plus" size={17} />
            </button>
          </div>
        </aside>
      </section>

      <section className="panel">
        <div className="wpb-head">
          <h3>Network health</h3>
          <span className="muted small">From the validator attention queue</span>
        </div>
        <div className="ov-health">
          <div className="ov-health-main">
            <span className="ov-updated">
              Last update · {relativeTime(v?.meta.asOf ?? o.meta.asOf, Date.now())} <Icon name="clock" size={14} />
            </span>
            <div className="ov-title">
              <h3>Validators needing attention</h3>
            </div>
            <span className="muted small">Validators that went offline in the last 30 days, and live ones on an old release, most fixable first.</span>
            <div className="ov-big">
              <span className="ov-value">{v ? queue.length : "—"}</span>
              <button className="btn primary lg" onClick={() => go("network/validators")}>Open the queue</button>
              <button className="btn ghost lg" onClick={() => go("network/validators")}>Sponsor scorecard</button>
            </div>
          </div>
          <div className="ov-side">
            <div className="ov-side-head">
              <div>
                <h4>Release adoption</h4>
                <span className="muted small">Live validators on the current release</span>
              </div>
              {network && <span className="ov-chip">Network {network}</span>}
            </div>
            {adoption != null && (
              <div className="ov-rail" role="img" aria-label={`${Math.round(adoption * 100)}% of live validators on the current release`}>
                <span className="ticks" />
                <span className="line" />
                <span className="fill" style={{ width: `${adoption * 100}%` }} />
                <span className="knob" style={{ left: `${adoption * 100}%` }} />
                <span className="bubble" style={{ left: `${adoption * 100}%` }}>{Math.round(adoption * 100)}% current</span>
              </div>
            )}
            <span className="muted small">
              {live.length - current} live validators run an older release; {tierCount(3)} of them are two or more releases behind.
            </span>
          </div>
        </div>
        <div className="ov-tabs">
          {([1, 2, 3, 4] as const).map((t) => (
            <div key={t}>
              <strong>{v ? tierCount(t) : "—"} · {TIERS[t].label}</strong>
              <span>{TIERS[t].hint}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ov-tiles">
        <div className="ov-tile">
          <span className="label">Latest round</span>
          <span className="ov-chip">Live</span>
          <span className="val">{o.latestRound?.toLocaleString("en-US") ?? "—"}</span>
        </div>
        <div className="ov-tile">
          <span className="label">Featured apps</span>
          <span className="ov-chip">30D</span>
          <span className="val">{o.featuredApps}</span>
        </div>
        <div className="ov-tile">
          <span className="label">CC supply</span>
          <span className="ov-chip">Circ.</span>
          <span className="val">{o.ccSupply != null ? compact(o.ccSupply) : "—"}</span>
        </div>
        <div className="ov-tile">
          <span className="label">Market cap</span>
          <span className="ov-chip">USD</span>
          <span className="val">{marketCap != null ? usdCompact(marketCap) : "—"}</span>
        </div>
      </section>
    </div>
  );
}
