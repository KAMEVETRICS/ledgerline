// Network-level private-markets statistics, as held by the ecosystem party:
// aggregates an administrator publishes only above a privacy threshold.
import { BarSeriesChart, TimeSeriesChart, usdCompact } from "../charts";
import { Empty, Stat } from "../components";
import { date, moneyShort, num, of, pct, type FundStatistics } from "../model";
import { useStore } from "../store";

const times = (s: string | null) => (s == null ? "—" : `${num(s).toFixed(2)}×`);
const quarterOf = (iso: string) => `Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1} ${iso.slice(0, 4)}`;

export function EcosystemPrivateMarkets() {
  const { acs } = useStore();
  const stats = of<FundStatistics>(acs.Ecosystem, "Reporting:FundStatistics")
    .map((c) => c.payload)
    .sort((a, b) => a.asOf.localeCompare(b.asOf));

  if (stats.length === 0)
    return (
      <main className="solo">
        <Empty>No statistics published yet. Administrators publish them each quarter once enough funds contribute.</Empty>
      </main>
    );

  const latest = stats.at(-1)!;
  const series = (f: (s: FundStatistics) => string | null) =>
    stats.filter((s) => f(s) != null).map((s) => ({ t: s.asOf, v: num(f(s)) }));
  const committed = num(latest.committed);

  return (
    <main className="network">
      <div className="network-page">
        <header className="page-head">
          <div>
            <h2>Private markets on Canton</h2>
            <p className="muted">
              Network statistics across every fund an administrator runs, {quarterOf(latest.asOf)}. Published only when at
              least {latest.minFunds} funds and {latest.minLps} investors contribute, so no single fund or investor can be
              singled out.
            </p>
          </div>
          <span className="source ledger">Live · Canton ledger · signed by the administrator</span>
        </header>

        <section className="panel">
          <div className="stats">
            <Stat label="Funds" value={latest.funds} />
            <Stat label="Investors" value={latest.lps} />
            <Stat label="Committed" value={moneyShort(committed)} />
            <Stat label="Called" value={moneyShort(num(latest.called))} sub={pct(num(latest.called) / committed)} />
            <Stat label="Distributed" value={moneyShort(num(latest.distributed))} />
            <Stat label="NAV" value={moneyShort(num(latest.nav))} />
            <Stat label="Median TVPI" value={times(latest.tvpiMedian)} sub={`range ${times(latest.tvpiLow)} to ${times(latest.tvpiHigh)}`} />
            <Stat
              label="Days to pay a call"
              value={latest.medianDaysToPay == null ? "—" : num(latest.medianDaysToPay).toFixed(1)}
              sub="median, this quarter"
            />
            <Stat
              label="Calls paid on time"
              value={latest.paidOnTimePct == null ? "—" : `${num(latest.paidOnTimePct).toFixed(0)}%`}
              sub={`${latest.callsPaid} payments this quarter`}
            />
          </div>
        </section>

        <div className="grid-2">
          <section className="panel">
            <h3>Capital flows, cumulative</h3>
            <TimeSeriesChart
              format={usdCompact}
              series={[
                { name: "Called", points: series((s) => s.called) },
                { name: "NAV", points: series((s) => s.nav) },
                { name: "Distributed", points: series((s) => s.distributed) },
              ]}
            />
            <p className="hint">How fast committed capital is being deployed, and how much is coming back.</p>
          </section>
          <section className="panel">
            <h3>Fund performance (TVPI)</h3>
            <TimeSeriesChart
              format={(n) => `${n.toFixed(2)}×`}
              series={[
                { name: "Median", points: series((s) => s.tvpiMedian) },
                { name: "Highest", points: series((s) => s.tvpiHigh) },
                { name: "Lowest", points: series((s) => s.tvpiLow) },
              ]}
            />
            <p className="hint">Total value per dollar paid in, across funds. A benchmark no single manager could publish alone.</p>
          </section>
          <section className="panel">
            <h3>Days from call to payment</h3>
            <BarSeriesChart name="Median days" points={series((s) => s.medianDaysToPay)} format={(n) => n.toFixed(1)} />
            <p className="hint">Operational health of capital calls on the network.</p>
          </section>
          <section className="panel">
            <h3>Calls paid on time</h3>
            <BarSeriesChart name="Paid on time" points={series((s) => s.paidOnTimePct)} format={(n) => `${n.toFixed(0)}%`} />
            <p className="hint">Share of payments with a value date on or before the due date.</p>
          </section>
        </div>

        <section className="panel">
          <h3>Who uses this, and for what</h3>
          <ul className="list">
            <li>
              <span><strong>Ecosystem operators and the Canton Foundation:</strong> is tokenized private-markets activity growing, and where to direct grants and support.</span>
            </li>
            <li>
              <span><strong>App developers:</strong> whether fund workflows are a vertical worth building for.</span>
            </li>
            <li>
              <span><strong>Fund administrators and managers:</strong> how their funds compare with the network median, without seeing anyone else's numbers.</span>
            </li>
            <li>
              <span><strong>Investors:</strong> a benchmark for manager selection, next to their own private portfolio view.</span>
            </li>
          </ul>
        </section>

        <section className="panel">
          <h3>What this node holds</h3>
          <p className="muted small">
            The ecosystem party holds {stats.length} statistics records ({stats.map((s) => quarterOf(s.asOf)).join(", ")}) and no fund,
            commitment, statement or payment. Each record is signed by the administrator and was published on{" "}
            {date(latest.publishedAt)} for the quarter ending {date(latest.asOf)}.
          </p>
        </section>
      </div>
    </main>
  );
}
