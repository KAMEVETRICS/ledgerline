import type { Holding, LiquidityReport, Point, Pool } from "../../types";

const finite = (n: number | null | undefined): number | null => typeof n === "number" && Number.isFinite(n) ? n : null;
const ordered = (points: Point[]) => [...points].filter(p => finite(p.v) !== null).sort((a, b) => a.t.localeCompare(b.t));
export const formatValue = (n: number | null, show: (n: number) => string) => finite(n) === null ? "—" : show(n!);
export const usd4 = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
export const percent = (n: number, signed = false) => new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: signed ? "always" : "auto" }).format(n / 100);
export const shortId = (id: string) => id.length > 32 ? `${id.slice(0, 16)}…${id.slice(-12)}` : id;

/** A missing observation or a zero denominator never becomes a made-up zero. */
export function percentage(numerator: number | null, denominator: number | null): number | null {
  return finite(numerator) !== null && finite(denominator) !== null && denominator! > 0 ? finite(numerator! / denominator! * 100) : null;
}

export function liquidityMetrics(cc: LiquidityReport["cc"]) {
  const prices = ordered(cc.priceUsd), supplies = ordered(cc.supply), volumes = ordered(cc.transferVolumeDailyCC);
  const price = finite(prices.at(-1)?.v), supply = finite(supplies.at(-1)?.v);
  const change = prices.length >= 2 ? percentage(prices.at(-1)!.v - prices[0].v, prices[0].v) : null;
  return { price, change, supply, marketCap: price !== null && supply !== null ? finite(price * supply) : null,
    averageVolume: volumes.length ? finite(volumes.reduce((sum, p) => sum + p.v, 0) / volumes.length) : null,
    observedDays: volumes.length };
}

export type SortDirection = "asc" | "desc";
function compareValue(a: number | null, b: number | null, direction: SortDirection) {
  const av = finite(a), bv = finite(b);
  if (av === null) return bv === null ? 0 : 1;
  if (bv === null) return -1;
  return (av < bv ? -1 : av > bv ? 1 : 0) * (direction === "asc" ? 1 : -1);
}
export const sortPools = (pools: Pool[], direction: SortDirection = "desc") => [...pools].sort((a, b) => compareValue(a.tvlUsd, b.tvlUsd, direction) || a.venue.localeCompare(b.venue) || a.pair.localeCompare(b.pair));
export const sortHoldings = (holdings: Holding[], direction: SortDirection = "desc") => [...holdings].sort((a, b) => compareValue(a.valueUsd, b.valueUsd, direction) || a.instrument.localeCompare(b.instrument));

export function portfolioValue(holdings: Holding[]) {
  const valued = holdings.filter(h => finite(h.valueUsd) !== null);
  const total = valued.length ? finite(valued.reduce((sum, h) => sum + h.valueUsd!, 0)) : null;
  return { total, valued: valued.length, unvalued: holdings.length - valued.length,
    allocatable: total !== null && total > 0 && valued.every(h => h.valueUsd! >= 0) };
}

export function normalizeParty(input: string): string | null {
  const id = input.trim();
  return /^[\w.\-:]{3,512}$/.test(id) && id.includes("::") ? id : null;
}
export function partyFromHash(hash: string): string {
  const [route, query = ""] = hash.replace(/^#\/?/, "").split("?", 2);
  return route === "network/portfolio" ? new URLSearchParams(query).get("party") ?? "" : "";
}
export function portfolioHash(id: string): string {
  const party = normalizeParty(id);
  if (!party) throw new Error("Invalid party ID");
  return `#/network/portfolio?party=${encodeURIComponent(party)}`;
}

const RECENTS = "ledgerline.network.recentParties";
type RecentStore = Pick<Storage, "getItem" | "setItem">;
export const recentWith = (ids: string[], id: string) => [...new Set([id, ...ids].map(normalizeParty).filter((p): p is string => p !== null))].slice(0, 5);
export function readRecent(store: () => RecentStore): string[] {
  try {
    const raw: unknown = JSON.parse(store().getItem(RECENTS) ?? "[]");
    return Array.isArray(raw) ? [...new Set(raw.filter((p): p is string => typeof p === "string").map(normalizeParty).filter((p): p is string => p !== null))].slice(0, 5) : [];
  } catch { return []; }
}
export function writeRecent(store: () => RecentStore, ids: string[]): void {
  try { store().setItem(RECENTS, JSON.stringify(ids)); } catch { /* Lookup still works when storage is blocked. */ }
}
