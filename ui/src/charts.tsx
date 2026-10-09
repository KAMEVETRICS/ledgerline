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
  ReferenceDot,
  ReferenceLine,
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
          <YAxis tickFormatter={format} width={52} domain={[0, "auto"]} {...axis} />
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
          <YAxis tickFormatter={format} width={52} domain={[0, "auto"]} {...axis} />
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

/**
 * Borderless trend for hero cards: a glowing line, a dashed line at the first
 * value, and the latest point marked and labelled.
 */
export function HeroSpark({
  points,
  tone = "accent",
  label,
  height = 120,
  format = compact,
}: {
  points: Point[];
  tone?: "accent" | "good" | "bad";
  label?: string;
  height?: number;
  format?: (n: number) => string;
}) {
  if (points.length < 2) return null;
  const color = tone === "bad" ? "var(--bad)" : tone === "good" ? "var(--good)" : "var(--accent)";
  const id = `spark-${tone}`;
  const last = points[points.length - 1];
  const values = points.map((p) => p.v);
  const min = Math.min(...values), max = Math.max(...values);
  const pad = (max - min) * 0.25 || max * 0.05 || 1;
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 26, right: 34, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min - pad, max + pad]} />
          <XAxis dataKey="t" hide />
          <Tooltip content={<TooltipBox format={format} />} cursor={{ stroke: "var(--border-strong)" }} />
          <ReferenceLine y={points[0].v} stroke="var(--faint)" strokeDasharray="3 4" />
          <Area dataKey="v" name="Value" type="monotone" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive={false} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
          <ReferenceDot
            x={last.t}
            y={last.v}
            r={4}
            fill="var(--surface)"
            stroke={color}
            strokeWidth={2}
            label={label ? { value: label, position: "top", fill: "var(--text)", fontSize: 12, offset: 10 } : undefined}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Where the numbers on a page come from. Sample data is always labelled. */
export function SourceBadge({ meta }: { meta: Meta }) {
  const when = new Date(meta.asOf).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const label =
    meta.source === "fixture"
      ? "Sample data"
      : meta.source === "ccspace"
        ? `Live · ${(meta.sources ?? ["CC Space"]).join(" + ")} · ${meta.network}`
        : `Demo · local Canton ledger`;
  return (
    <span className={`source ${meta.source}`} title={meta.note ?? `As of ${when}`}>
      {label} <span className="muted">· {when}</span>
    </span>
  );
}
