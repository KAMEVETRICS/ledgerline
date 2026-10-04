import { compact } from "../../../charts";
import type { Point } from "../../types";

export const DASH = "—";

export function fmt(value: number | null, show: (n: number) => string): string {
  return value == null ? DASH : show(value);
}

export function ccAmount(n: number): string {
  return `${compact(n)} CC`;
}

export function usd4(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n);
}

export function pct1(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function sumKnown(values: (number | null)[]): number | null {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (v != null) {
      sum += v;
      n += 1;
    }
  }
  return n === 0 ? null : sum;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Relative labels and the 24h stale check use meta.asOf so fixture clocks stay consistent. */
export function relativeTime(iso: string | null, nowMs: number): string {
  if (!iso) return DASH;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return DASH;
  const sec = Math.round((nowMs - then) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  return day === 1 ? "1 day ago" : `${day} days ago`;
}

export function trend7d(points: Point[]): number | null {
  if (points.length < 14) return null;
  let prev = 0;
  let last = 0;
  for (const p of points.slice(-14, -7)) prev += p.v;
  for (const p of points.slice(-7)) last += p.v;
  if (prev === 0) return null;
  return (last - prev) / prev;
}

export function rewardsPerK(activity: number | null, rewards: number | null): number | null {
  if (activity == null || rewards == null || activity === 0) return null;
  return (rewards * 1000) / activity;
}

export function cmp(a: string | number | null, b: string | number | null, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const d = a < b ? -1 : a > b ? 1 : 0;
  return dir === "asc" ? d : -d;
}

export type SortState = { col: string; dir: "asc" | "desc" };

export function nextSort(sort: SortState, col: string, first: "asc" | "desc"): SortState {
  if (sort.col === col) return { col, dir: sort.dir === "asc" ? "desc" : "asc" };
  return { col, dir: first };
}
