// Generates deterministic SAMPLE data matching ui/src/network/types.ts, so the
// network pages can be built before live data is wired up. Names are generic
// on purpose: these are not real validators, apps or pools.
//   node scripts/network/make-fixtures.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const END = Date.parse("2026-10-02T00:00:00Z");
const DAY = 86_400_000;

// Small seeded PRNG so fixtures are stable across runs.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const days = (n) => Array.from({ length: n }, (_, i) => new Date(END - (n - 1 - i) * DAY).toISOString().slice(0, 10));
const walk = (n, start, drift, noise, min = 0) => {
  let v = start;
  return days(n).map((t) => {
    v = Math.max(min, v * (1 + drift + (rand() - 0.5) * noise));
    return { t, v: round(v) };
  });
};

const meta = (note) => ({ source: "fixture", network: "mainnet", asOf: new Date(END).toISOString(), note });

const validators = Array.from({ length: 24 }, (_, i) => {
  const active = i < 21;
  return {
    id: `validator-${String(i + 1).padStart(2, "0")}`,
    name: `Sample Validator ${i + 1}`,
    party: `sample-validator-${i + 1}::1220${String(i).padStart(4, "0")}`,
    sponsor: `Sample SV ${1 + (i % 5)}`,
    version: i % 4 === 0 ? "0.4.18" : "0.4.19",
    active,
    lastActiveAt: new Date(END - (active ? rand() * 3_600_000 : (2 + rand() * 9) * DAY)).toISOString(),
    uptime30d: round(active ? 0.9 + rand() * 0.1 : 0.3 + rand() * 0.4, 3),
    rewards30dCC: round((active ? 20_000 : 4_000) * (0.5 + rand())),
  };
});

const apps = ["Sample DEX", "Sample Wallet", "Sample Lending", "Sample Payments", "Sample RWA Registry", "Sample Oracle"].map(
  (name, i) => {
    const activityDaily = walk(30, 400 + i * 250, 0.01, 0.3);
    return {
      id: `app-${i + 1}`,
      name,
      provider: `Sample Provider ${i + 1}`,
      party: `sample-app-${i + 1}::1220${String(i).padStart(4, "0")}`,
      featured: i < 4,
      activity30d: Math.round(activityDaily.reduce((s, p) => s + p.v, 0)),
      rewards30dCC: round(30_000 * (0.4 + rand())),
      activityDaily,
      url: null,
    };
  },
);

const transfersDaily = walk(30, 52_000, 0.004, 0.18);
const activeValidatorsDaily = days(30).map((t, i) => ({ t, v: 18 + Math.round(i / 10) + Math.round(rand() * 2) }));
const priceUsd = walk(30, 0.16, 0.002, 0.06, 0.01);
const supply = walk(30, 31_200_000_000, 0.0015, 0.001);

const files = {
  "overview.json": {
    meta: meta("Sample data for UI development. Not real network figures."),
    latestRound: 48_210,
    validators: { total: validators.length, active: validators.filter((v) => v.active).length },
    featuredApps: apps.filter((a) => a.featured).length,
    ccPriceUsd: priceUsd.at(-1).v,
    ccSupply: supply.at(-1).v,
    transfers24h: transfersDaily.at(-1).v,
    series: { transfersDaily, activeValidatorsDaily },
  },
  "validators.json": {
    meta: meta("Sample data for UI development. Not real validators."),
    validators,
    series: {
      activeDaily: activeValidatorsDaily,
      rewardsPerRoundCC: Array.from({ length: 48 }, (_, i) => ({
        t: new Date(END - (47 - i) * 600_000).toISOString(),
        v: round(1_800 + rand() * 600),
      })),
    },
  },
  "apps.json": { meta: meta("Sample data for UI development. Not real apps."), apps },
  "liquidity.json": {
    meta: meta("Sample data for UI development. Not real prices or pools."),
    cc: { priceUsd, supply, transferVolumeDailyCC: walk(30, 210_000_000, 0.003, 0.25) },
    pools: [
      { id: "pool-1", venue: "Sample AMM", pair: "CC/USDCx", tvlUsd: 4_200_000, volume24hUsd: 610_000 },
      { id: "pool-2", venue: "Sample AMM", pair: "CBTC/CC", tvlUsd: 1_350_000, volume24hUsd: 120_000 },
      { id: "pool-3", venue: "Sample AMM", pair: "cETH/USDCx", tvlUsd: 880_000, volume24hUsd: null },
    ],
  },
  "party.json": {
    meta: meta("Sample data for UI development. Not a real party."),
    party: "sample-party::12200000",
    holdings: [
      { instrument: "CC", admin: null, amount: 1_250_000, valueUsd: round(1_250_000 * priceUsd.at(-1).v) },
      { instrument: "USDCx", admin: "sample-issuer::1220aaaa", amount: 340_000, valueUsd: 340_000 },
      { instrument: "CBTC", admin: "sample-issuer::1220bbbb", amount: 2.5, valueUsd: null },
    ],
    recent: Array.from({ length: 12 }, (_, i) => ({
      id: `op-${i + 1}`,
      at: new Date(END - i * 0.7 * DAY).toISOString(),
      type: i % 4 === 3 ? "reward" : "transfer",
      direction: i % 4 === 3 ? "in" : i % 2 ? "out" : "in",
      counterparty: i % 4 === 3 ? null : `sample-counterparty-${1 + (i % 3)}::1220cccc`,
      instrument: i % 5 === 4 ? "USDCx" : "CC",
      amount: round(1_000 + rand() * 40_000),
    })),
  },
};

mkdirSync(OUT, { recursive: true });
for (const [name, body] of Object.entries(files)) writeFileSync(path.join(OUT, name), JSON.stringify(body, null, 2) + "\n");
console.log(`Wrote ${Object.keys(files).length} fixtures to ${OUT}`);
