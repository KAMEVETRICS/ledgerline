// Shared chart primitives. Every page uses these instead of calling Recharts
// directly, so all charts share one look in light and dark mode.
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Meta, Point } from "./network/types";

export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const shortDate = (t: string) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const usdCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(n);

function TooltipBox({ active, payload, label, format }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  format: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="muted small">{label ? shortDate(label) : ""}</div>
      {payload.map((p) => (
        <div key={p.name} className="num">
          <span className="chart-swatch" style={{ background: p.color }} />
          {p.name}: {format(p.value)}
        </div>
      ))}
    </div>
  );
}

/** Merge named Point[] series into Recharts rows keyed by timestamp. */
function rows(series: { name: string; points: Point[] }[]) {
  const byT = new Map<string, Record<string, number | string>>();
  for (const s of series)
    for (const p of s.points) {
      const row = byT.get(p.t) ?? { t: p.t };
      row[s.name] = p.v;
      byT.set(p.t, row);
    }
  return [...byT.values()].sort((a, b) => String(a.t).localeCompare(String(b.t)));
}

/** One or more time series as lines. Use `area` for a single level series. */
export function TimeSeriesChart({
  series,
  height = 220,
  format = compact,
  area = false,
}: {
  series: { name: string; points: Point[] }[];
  height?: number;
  format?: (n: number) => string;
  area?: boolean;
}) {
  const data = rows(series);
  if (data.length === 0) return <p className="empty">No data for this period.</p>;
  const Chart = area ? AreaChart : LineChart;
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="t" tickFormatter={shortDate} minTickGap={28} {...axis} />
          <YAxis tickFormatter={format} width={52} {...axis} />
          <Tooltip content={<TooltipBox format={format} />} />
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />}
          {series.map((s, i) =>
            area ? (
              <Area key={s.name} dataKey={s.name} type="monotone" stroke={SERIES_COLORS[i % 4]} fill={SERIES_COLORS[i % 4]} fillOpacity={0.12} strokeWidth={2} dot={false} isAnimationActive={false} />
            ) : (
              <Line key={s.name} dataKey={s.name} type="monotone" stroke={SERIES_COLORS[i % 4]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bars over time (daily counts, per-round rewards). */
export function BarSeriesChart({
  name,
  points,
  height = 200,
  format = compact,
}: {
  name: string;
  points: Point[];
  height?: number;
  format?: (n: number) => string;
}) {
  if (points.length === 0) return <p className="empty">No data for this period.</p>;
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows([{ name, points }])} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="t" tickFormatter={shortDate} minTickGap={28} {...axis} />
          <YAxis tickFormatter={format} width={52} {...axis} />
          <Tooltip content={<TooltipBox format={format} />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey={name} fill={SERIES_COLORS[0]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny trend line for table cells and stat tiles. */
export function Sparkline({ points, width = 96, height = 28 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length < 2) return <span className="muted">—</span>;
  return (
    <LineChart width={width} height={height} data={points}>
      <Line dataKey="v" stroke={SERIES_COLORS[0]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </LineChart>
  );
}

/** Where the numbers on a page come from. Sample data is always labelled. */
export function SourceBadge({ meta }: { meta: Meta }) {
  const when = new Date(meta.asOf).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const label =
    meta.source === "fixture"
      ? "Sample data"
      : meta.source === "ccspace"
        ? `Live · CC Space · ${meta.network}`
        : `Live · Canton ledger · ${meta.network}`;
  return (
    <span className={`source ${meta.source}`} title={meta.note ?? `As of ${when}`}>
      {label} <span className="muted">· {when}</span>
    </span>
  );
}
