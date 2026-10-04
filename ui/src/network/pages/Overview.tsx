import { BarSeriesChart, TimeSeriesChart, compact } from "../../charts";
import { Stat } from "../../components";
import { fetchOverview, useLoad } from "../api";
import { LoadState, NetworkPage } from "../NetworkSection";
import type { NetworkOverview } from "../types";
import { ccAmount, fmt, usd4 } from "./wpb/format";
import "./wpb/wpb.css";

export function Overview() {
  const { data, error, loading } = useLoad(fetchOverview);
  return (
    <NetworkPage
      title="Network overview"
      lead="See whether the network is healthy enough to operate on: rounds progressing, validators live, apps shipping, CC moving."
      meta={data?.meta}
    >
      <LoadState loading={loading} error={error} />
      {data && <OverviewBody data={data} />}
    </NetworkPage>
  );
}

function OverviewBody({ data }: { data: NetworkOverview }) {
  const v = data.validators;
  return (
    <div className="wpb-stack">
      <div className="stats">
        <Stat label="Latest round" value={<span className="num">{fmt(data.latestRound, (n) => n.toLocaleString("en-US"))}</span>} />
        <Stat label="Validators" value={<span className="num">{`${v.active} / ${v.total}`}</span>} sub="active / total" />
        <Stat label="Featured apps" value={<span className="num">{data.featuredApps.toLocaleString("en-US")}</span>} />
        <Stat label="CC price" value={<span className="num">{fmt(data.ccPriceUsd, usd4)}</span>} />
        <Stat label="CC supply" value={<span className="num">{fmt(data.ccSupply, ccAmount)}</span>} />
        <Stat label="Transfers (24h)" value={<span className="num">{fmt(data.transfers24h, compact)}</span>} />
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Transfers per day</h3>
          <BarSeriesChart name="Transfers" points={data.series.transfersDaily} />
        </div>
        <div className="panel">
          <h3>Active validators per day</h3>
          <TimeSeriesChart series={[{ name: "Active validators", points: data.series.activeValidatorsDaily }]} />
        </div>
      </div>

      <div className="wpb-links">
        <button type="button" className="wpb-link" onClick={() => (window.location.hash = "/network/validators")}>
          <h3>Validators</h3>
          <p>See who is reliable, who is falling behind, and what validators earn.</p>
        </button>
        <button type="button" className="wpb-link" onClick={() => (window.location.hash = "/network/apps")}>
          <h3>App monitoring</h3>
          <p>See which apps are growing and what they earn, including Featured App status.</p>
        </button>
        <button type="button" className="wpb-link" onClick={() => (window.location.hash = "/network/liquidity")}>
          <h3>Liquidity</h3>
          <p>See where CC liquidity sits and how price, supply and transfers are moving.</p>
        </button>
      </div>
    </div>
  );
}
