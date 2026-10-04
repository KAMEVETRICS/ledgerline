import { useState } from "react";
import { BarSeriesChart, TimeSeriesChart, compact, usdCompact } from "../../charts";
import { Empty, Stat } from "../../components";
import { useLoad, fetchLiquidity, fetchOverview } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";
import type { LiquidityReport, NetworkOverview } from "../types";
import { formatValue, liquidityMetrics, percentage, percent, sortPools, usd4, type SortDirection } from "./wpc/model";
import "./wpc/wpc.css";

const ccAmount = (n: number) => `${compact(n)} CC`;

export function Liquidity() {
  const { data, error, loading } = useLoad(fetchLiquidity);
  // The current price lives in the overview; the liquidity report only carries price history.
  const overview = useLoad(fetchOverview);
  return (
    <NetworkPage title="Liquidity" lead="Compare CC flows and trading venues before deploying capital or listing an asset." meta={data?.meta}>
      <LoadState loading={loading} error={error} />
      {data && !loading && <LiquidityBody data={data} overview={overview.data} />}
    </NetworkPage>
  );
}

function LiquidityBody({ data, overview }: { data: LiquidityReport; overview: NetworkOverview | null }) {
  const [direction, setDirection] = useState<SortDirection>("desc");
  const metrics = liquidityMetrics(data.cc);
  const currentPrice = metrics.price ?? overview?.ccPriceUsd ?? null;
  const priceFromOverview = metrics.price === null && currentPrice !== null;
  const hasPriceHistory = data.cc.priceUsd.length > 0;
  const hasSupplyHistory = data.cc.supply.length > 0;
  return (
    <div className="wpc-stack">
      <section className="panel" aria-label="Canton Coin metrics">
        <div className="stats wpc-metrics">
          <Stat label="CC price" value={formatValue(currentPrice, usd4)} sub={priceFromOverview ? "USD · current governance price" : "USD · latest observed price"} />
          <Stat label="30-day price change" value={<span className={metrics.change === null ? "" : metrics.change < 0 ? "wpc-down" : "wpc-up"}>{formatValue(metrics.change, n => percent(n, true))}</span>} sub="Computed · first to last observation" />
          <Stat label="CC supply" value={formatValue(metrics.supply, ccAmount)} sub="Latest observed supply" />
          <Stat label="Market cap" value={formatValue(metrics.marketCap, usdCompact)} sub="Computed · price × supply" />
          <Stat label="Avg. daily volume" value={formatValue(metrics.averageVolume, ccAmount)} sub={`Computed · ${metrics.observedDays} observed days in the 30-day window`} />
        </div>
        {data.meta.note && data.pools.length > 0 && <p className="wpc-note">{data.meta.note}</p>}
        <p className="wpc-caption">Compare observed price, supply and transfer volume when sizing a CC treasury.</p>
      </section>
      {/* Charts only for series the source provides; the note above says what is missing. */}
      <div className={hasPriceHistory ? "grid-2" : "wpc-stack"}>
        {hasPriceHistory && (
          <section className="panel" aria-labelledby="wpc-price">
            <h3 id="wpc-price">CC price · USD</h3>
            <TimeSeriesChart series={[{ name: "CC price", points: data.cc.priceUsd }]} area format={usd4} />
            <p className="wpc-caption">Use observed prices to plan CC-denominated payments.</p>
          </section>
        )}
        <section className="panel" aria-labelledby="wpc-transfers">
          <h3 id="wpc-transfers">Daily transfer volume · CC</h3>
          <BarSeriesChart name="CC transferred" points={data.cc.transferVolumeDailyCC} format={compact} />
          <p className="wpc-caption">Compare daily flows when planning how much CC to keep available.</p>
        </section>
      </div>
      {hasSupplyHistory && (
        <section className="panel" aria-labelledby="wpc-supply">
          <h3 id="wpc-supply">CC supply · CC</h3>
          <TimeSeriesChart series={[{ name: "CC supply", points: data.cc.supply }]} format={compact} height={180} />
          <p className="wpc-caption">Track observed supply when assessing changes in the CC market.</p>
        </section>
      )}
      <section className="panel" aria-labelledby="wpc-pools">
        <div className="wpc-section-head"><h3 id="wpc-pools">Trading pools</h3><span className="muted small">{data.pools.length} {data.pools.length === 1 ? "pool" : "pools"}</span></div>
        {data.pools.length === 0 ? <><Empty>No pool data from this source</Empty>{data.meta.note && <p className="wpc-note">{data.meta.note}</p>}</> : (
          <div className="wpc-scroll" tabIndex={0} role="region" aria-label="Trading pools table">
            <table className="table wpc-pools">
              <thead><tr><th scope="col">Venue</th><th scope="col">Pair</th><th scope="col" className="r" aria-sort={direction === "desc" ? "descending" : "ascending"}><button className="wpc-sort" onClick={() => setDirection(d => d === "desc" ? "asc" : "desc")}>TVL · USD <span aria-hidden="true">{direction === "desc" ? "↓" : "↑"}</span></button></th><th scope="col" className="r">24h volume · USD</th><th scope="col" className="r">Turnover <span className="small">(computed)</span></th></tr></thead>
              <tbody>{sortPools(data.pools, direction).map(pool => <tr key={pool.id}>
                <td>{pool.venue}</td><td>{pool.pair}</td><td className="num r">{formatValue(pool.tvlUsd, usdCompact)}</td><td className="num r">{formatValue(pool.volume24hUsd, usdCompact)}</td><td className="num r">{formatValue(percentage(pool.volume24hUsd, pool.tvlUsd), n => percent(n))}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
        {data.pools.length > 0 && <p className="wpc-scroll-hint">Scroll horizontally for all columns.</p>}
        <p className="wpc-caption">Compare reported pool value and activity before choosing a trading venue. Computed turnover is 24h volume ÷ TVL; unavailable values and zero TVL show “—”.</p>
      </section>
    </div>
  );
}
