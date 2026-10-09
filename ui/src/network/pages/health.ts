// Validator health: a ranked "needs attention" queue and a per-sponsor
// scorecard, from liveness (CC Space), last-active time and version (Lighthouse).
// Pure functions, so the rules are easy to read and to check.
import type { Validator } from "../types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Silent longer than this is treated as retired, not as an incident. */
export const RETIRED_AFTER_DAYS = 30;

export type Issue = { validator: Validator; tier: 1 | 2 | 3 | 4; reason: string; sinceMs: number | null };

export const TIERS: Record<Issue["tier"], { label: string; hint: string }> = {
  1: { label: "Went offline this week", hint: "Recently live, now silent. Most likely still fixable." },
  2: { label: "Offline 7–30 days", hint: "Silent for over a week; contact the operator or sponsor." },
  3: { label: "Live, two or more releases behind", hint: "Still running, but an upgrade is overdue." },
  4: { label: "Live, one release behind", hint: "Running the previous minor release." },
};

type Version = [number, number, number];
export function parseVersion(v: string | null | undefined): Version | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Minor releases behind the network version (0 = current minor), or null when unknown. */
export function releasesBehind(version: string | null, network: string | null): number | null {
  const v = parseVersion(version), n = parseVersion(network);
  if (!v || !n) return null;
  if (v[0] !== n[0]) return v[0] < n[0] ? 99 : 0;
  return Math.max(0, n[1] - v[1]);
}

/** Network version: the reported one, else the highest version among live validators. */
export function networkVersionOf(validators: Validator[], reported?: string | null): string | null {
  if (parseVersion(reported)) return reported!;
  let best: string | null = null;
  for (const v of validators) {
    const p = parseVersion(v.version), b = parseVersion(best);
    if (v.active && p && (!b || compare(p, b) > 0)) best = v.version;
  }
  return best;
}
const compare = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const silentFor = (v: Validator, nowMs: number) => (v.lastActiveAt ? nowMs - Date.parse(v.lastActiveAt) : null);

export function isRetired(v: Validator, nowMs: number): boolean {
  const silent = silentFor(v, nowMs);
  return !v.active && silent !== null && silent > RETIRED_AFTER_DAYS * DAY;
}

const ago = (ms: number) => {
  if (ms < DAY) return `${Math.max(1, Math.round(ms / HOUR))} h`;
  return `${Math.round(ms / DAY)} days`;
};

/** Validators that need someone to act, most urgent first. Retired validators are left out. */
export function attentionQueue(validators: Validator[], network: string | null, nowMs: number): Issue[] {
  const issues: Issue[] = [];
  for (const v of validators) {
    const silent = silentFor(v, nowMs);
    if (!v.active) {
      if (silent === null) {
        issues.push({ validator: v, tier: 2, reason: "Inactive; last activity unknown", sinceMs: null });
      } else if (silent <= 7 * DAY) {
        issues.push({ validator: v, tier: 1, reason: `Silent for ${ago(silent)}`, sinceMs: silent });
      } else if (silent <= RETIRED_AFTER_DAYS * DAY) {
        issues.push({ validator: v, tier: 2, reason: `Silent for ${ago(silent)}`, sinceMs: silent });
      }
      continue;
    }
    const behind = releasesBehind(v.version, network);
    if (behind !== null && behind >= 1) {
      issues.push({
        validator: v,
        tier: behind >= 2 ? 3 : 4,
        reason: `Runs ${v.version}; network is on ${network}`,
        sinceMs: behind,
      });
    }
  }
  // Within a tier: recently silent first (most fixable), then furthest behind.
  return issues.sort((a, b) => a.tier - b.tier || (a.tier <= 2 ? (a.sinceMs ?? Infinity) - (b.sinceMs ?? Infinity) : (b.sinceMs ?? 0) - (a.sinceMs ?? 0)) || a.validator.name.localeCompare(b.validator.name));
}

export type SponsorScore = {
  sponsor: string;
  /** True for the bucket of validators that list themselves as sponsor. */
  self: boolean;
  total: number;
  retired: number;
  /** Not retired: the validators this sponsor is answerable for today. */
  current: number;
  live: number;
  offline: number;
  liveOnCurrentRelease: number;
  /** Share of current validators that are live and on the network's minor release, 0..1. */
  health: number | null;
};

/**
 * Health per sponsor (the super validator that onboarded each validator).
 * Validators that name themselves as sponsor are pooled into one row.
 */
export function sponsorScorecard(validators: Validator[], network: string | null, nowMs: number): SponsorScore[] {
  const rows = new Map<string, SponsorScore>();
  for (const v of validators) {
    if (!v.sponsor) continue;
    const self = v.sponsor === v.id || v.sponsor === v.party;
    const key = self ? "(self)" : v.sponsor;
    const row = rows.get(key) ?? { sponsor: key, self, total: 0, retired: 0, current: 0, live: 0, offline: 0, liveOnCurrentRelease: 0, health: null };
    row.total++;
    if (isRetired(v, nowMs)) row.retired++;
    else {
      row.current++;
      if (v.active) {
        row.live++;
        if (releasesBehind(v.version, network) === 0) row.liveOnCurrentRelease++;
      } else row.offline++;
    }
    rows.set(key, row);
  }
  for (const row of rows.values()) row.health = row.current === 0 ? null : row.liveOnCurrentRelease / row.current;
  return [...rows.values()].sort((a, b) => Number(a.self) - Number(b.self) || b.current - a.current || a.sponsor.localeCompare(b.sponsor));
}

/** Liveness split that separates retired validators from recent outages. */
export function livenessSplit(validators: Validator[], nowMs: number) {
  let live = 0, offline = 0, retired = 0;
  for (const v of validators) {
    if (v.active) live++;
    else if (isRetired(v, nowMs)) retired++;
    else offline++;
  }
  return { live, offline, retired };
}
