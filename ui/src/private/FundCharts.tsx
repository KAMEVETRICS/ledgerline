// Private-markets charts built from the contracts on one party's own node.
// Every number here comes from that party's ledger view; nothing is fetched
// from anywhere else.
import { TimeSeriesChart, usdCompact } from "../charts";
import { Row, Section, Stat } from "../components";
import type { Contract } from "../ledger";
import {
  date,
  money,
  num,
  of,
  today,
  type CallNotice,
  type ContributionReceipt,
  type DistributionReceipt,
  type LpStatement,
  type NavStatement,
} from "../model";
import type { Point } from "../network/types";

const times = (n: number) => `${n.toFixed(2)}×`;

/** Last day of the calendar quarter containing an ISO date. */
function quarterEnd(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const q = Math.floor((Number(iso.slice(5, 7)) - 1) / 3);
  return new Date(Date.UTC(y, q * 3 + 3, 0)).toISOString().slice(0, 10);
}

/** Running total per quarter end, from dated amounts. */
function cumulativeByQuarter(items: { date: string; amount: number }[], quarters: string[]): Point[] {
  return quarters.map((q) => ({ t: q, v: items.filter((i) => i.date <= q).reduce((s, i) => s + i.amount, 0) }));
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

// ---------------------------------------------------------------- investor

/** TVPI per quarter for each fund, from the administrator-signed statements this LP holds. */
export function LpPerformance({ mine }: { mine: Contract[] | undefined }) {
  const statements = of<LpStatement>(mine, "Reporting:LpStatement");
  const funds = [...new Set(statements.map((s) => s.payload.fundId))].sort();
  const series = funds.map((fundId) => ({
    name: fundId,
    points: statements
      .filter((s) => s.payload.fundId === fundId && s.payload.tvpi != null)
      .map((s) => ({ t: s.payload.asOf, v: num(s.payload.tvpi) }))
      .sort((a, b) => a.t.localeCompare(b.t)),
  }));
  if (series.every((s) => s.points.length < 2)) return null;
  return (
    <Section title="Performance by quarter">
      <TimeSeriesChart series={series} format={times} height={200} />
      <p className="hint">TVPI from each quarter's statement, signed by the administrator. Each manager sees only its own line.</p>
    </Section>
  );
}

/** Cumulative capital paid in and returned, by quarter, across every fund this LP is in. */
export function LpCashFlows({ mine }: { mine: Contract[] | undefined }) {
  const paid = of<ContributionReceipt>(mine, "Fund:ContributionReceipt").map((r) => ({
    date: r.payload.valueDate,
    amount: num(r.payload.amount),
  }));
  const received = of<DistributionReceipt>(mine, "Fund:DistributionReceipt").map((r) => ({
    date: r.payload.valueDate,
    amount: num(r.payload.amount),
  }));
  const quarters = [...new Set([...paid, ...received].map((i) => quarterEnd(i.date)))].sort();
  if (quarters.length < 2) return null;
  return (
    <Section title="Cash flows by quarter">
      <TimeSeriesChart
        format={usdCompact}
        height={200}
        series={[
          { name: "Paid in", points: cumulativeByQuarter(paid, quarters) },
          { name: "Received", points: cumulativeByQuarter(received, quarters) },
        ]}
      />
      <p className="hint">Cumulative, by value date. Combined across managers on this node only.</p>
    </Section>
  );
}

// ---------------------------------------------------------------- manager

/** Fund NAV against capital paid in, per quarter, from the manager's NAV statements. */
export function FundTrend({ mine, fundId }: { mine: Contract[] | undefined; fundId: string }) {
  const navs = of<NavStatement>(mine, "Reporting:NavStatement")
    .filter((n) => n.payload.fundId === fundId)
    .sort((a, b) => a.payload.asOf.localeCompare(b.payload.asOf));
  if (navs.length < 2) return null;
  return (
    <Section title="NAV against capital paid in">
      <TimeSeriesChart
        format={usdCompact}
        height={200}
        series={[
          { name: "NAV", points: navs.map((n) => ({ t: n.payload.asOf, v: num(n.payload.nav) })) },
          { name: "Paid in", points: navs.map((n) => ({ t: n.payload.asOf, v: num(n.payload.totalContributed) })) },
        ]}
      />
      <p className="hint">From the administrator's quarterly NAV statements for this fund.</p>
    </Section>
  );
}

// ---------------------------------------------------------------- administrator

/** Operational health of one fund, as the administrator's node sees it. */
export function FundHealth({ mine, fundId }: { mine: Contract[] | undefined; fundId: string }) {
  const open = of<CallNotice>(mine, "Fund:CapitalCallNotice").filter((n) => n.payload.fundId === fundId);
  const receipts = of<ContributionReceipt>(mine, "Fund:ContributionReceipt").filter((r) => r.payload.fundId === fundId);
  const nav = of<NavStatement>(mine, "Reporting:NavStatement")
    .filter((n) => n.payload.fundId === fundId)
    .map((n) => n.payload.asOf)
    .sort()
    .at(-1);

  const days = median(receipts.map((r) => daysBetween(r.payload.calledOn, r.payload.valueDate)));
  const onTime = receipts.length ? receipts.filter((r) => r.payload.valueDate <= r.payload.dueDate).length / receipts.length : null;
  const overdue = open.filter((n) => n.payload.dueDate < today());
  const navAge = nav ? daysBetween(nav, today()) : null;

  return (
    <div className="fund-health">
      <div className="stats">
        <Stat
          label="Open calls"
          value={open.length}
          sub={open.length ? `${money(open.reduce((s, n) => s + num(n.payload.amount), 0))}${overdue.length ? `, ${overdue.length} overdue` : ""}` : "nothing outstanding"}
        />
        <Stat label="Days to pay" value={days == null ? "—" : days.toFixed(1)} sub="median, all calls" />
        <Stat label="Paid on time" value={onTime == null ? "—" : `${Math.round(onTime * 100)}%`} sub={`${receipts.length} payments`} />
        <Stat label="NAV age" value={navAge == null ? "—" : `${navAge}d`} sub={nav ? `as of ${date(nav)}` : "no NAV yet"} />
      </div>
      {navAge != null && navAge > 100 && <Row k="Attention" v="NAV is more than a quarter old" />}
    </div>
  );
}
