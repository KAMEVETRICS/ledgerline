// Runtime mirror of ui/src/network/types.ts. No UI, dependencies or fixture fallback.
import path from "node:path";
import { fileURLToPath } from "node:url";

const DAY = 86_400_000;
const DEFAULT_PARTY = "ITRocket-validator-1::12200ac965a56eff577aa6754516dbc0dd07265a0bf9361466c573e71ab7491ec369";
class ContractError extends Error {}
const fail = (at, expected) => { throw new ContractError(`Contract: ${at} must be ${expected}`); };
const str = (value, at) => { if (typeof value !== "string") fail(at, "a string"); };
const number = (value, at) => { if (typeof value !== "number" || !Number.isFinite(value)) fail(at, "a finite number"); };
const integer = (value, at) => { if (!Number.isSafeInteger(value) || value < 0) fail(at, "a nonnegative safe integer"); };
const bool = (value, at) => { if (typeof value !== "boolean") fail(at, "a boolean"); };
const nullable = (check) => (value, at) => { if (value !== null) check(value, at); };
const choice = (...allowed) => (value, at) => { if (!allowed.includes(value)) fail(at, "one of the contract's allowed values"); };
const dateOnly = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const timestamp = (value, at) => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)
    || !dateOnly(value.slice(0, 10)) || !Number.isFinite(Date.parse(value)) || Number(value.slice(11, 13)) > 23) fail(at, "a valid UTC ISO timestamp");
};
const object = (shape, optional = []) => (value, at) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(at, "an object");
  for (const [key, check] of Object.entries(shape)) {
    if (!Object.hasOwn(value, key)) {
      if (optional.includes(key)) continue;
      fail(`${at}.${key}`, "present");
    }
    check(value[key], `${at}.${key}`);
  }
  for (const key of Object.keys(value)) if (!Object.hasOwn(shape, key)) fail(at, "an object with only contract keys");
};
const array = (check) => (value, at) => {
  if (!Array.isArray(value)) fail(at, "an array");
  value.forEach((item, index) => check(item, `${at}[${index}]`));
};
const point = object({ t: str, v: number });
const series = (now, daily = true) => (value, at) => {
  array(point)(value, at);
  if (value.length > (daily ? 30 : 48)) fail(at, daily ? "at most 30 daily points" : "at most 48 round points");
  const from = new Date(Math.floor(now / DAY) * DAY - 29 * DAY).toISOString().slice(0, 10);
  const to = new Date(now).toISOString().slice(0, 10);
  let previous;
  for (const item of value) {
    if (daily) {
      if (!dateOnly(item.t) || item.t < from || item.t > to) fail(`${at}.t`, "a UTC date in the last 30 days");
    } else timestamp(item.t, `${at}.t`);
    if (previous !== undefined && item.t <= previous) fail(at, "strictly ascending with no duplicate times");
    previous = item.t;
  }
};
const validator = object({ id: str, name: str, party: nullable(str), sponsor: nullable(str), version: nullable(str),
  active: bool, lastActiveAt: nullable(timestamp), uptime30d: nullable((value, at) => {
    number(value, at); if (value < 0 || value > 1) fail(at, "between 0 and 1");
  }), rewards30dCC: nullable(number) });
const pool = object({ id: str, venue: str, pair: str, tvlUsd: nullable(number), volume24hUsd: nullable(number) });
const holding = object({ instrument: str, admin: nullable(str), amount: number, valueUsd: nullable(number) });
const operation = object({ id: str, at: timestamp, type: str, direction: choice("in", "out", "other"),
  counterparty: nullable(str), instrument: nullable(str), amount: nullable(number) });

export function assertContract(route, value, { source = "ccspace", now = Date.now() } = {}) {
  const meta = object({ source: choice(source), network: choice("mainnet", "testnet", "devnet", "local"),
    asOf: timestamp, note: str, sources: array(str) }, ["note", "sources"]);
  const daily = series(now);
  const app = object({ id: str, name: str, provider: str, party: nullable(str), featured: bool,
    activity30d: nullable(number), rewards30dCC: nullable(number), activityDaily: daily, url: nullable(str) });
  const schemas = {
    overview: object({ meta, latestRound: nullable(integer), validators: object({ total: integer, active: integer }),
      featuredApps: integer, ccPriceUsd: nullable(number), ccSupply: nullable(number), transfers24h: nullable(number),
      series: object({ transfersDaily: daily, activeValidatorsDaily: daily }) }),
    validators: object({ meta, validators: array(validator), networkVersion: nullable(str), series: object({ activeDaily: daily, rewardsPerRoundCC: series(now, false) }) }, ["networkVersion"]),
    apps: object({ meta, apps: array(app) }),
    liquidity: object({ meta, cc: object({ priceUsd: daily, supply: daily, transferVolumeDailyCC: daily, priceHistoryUsd: array(point), marketVolumeDailyUsd: daily }, ["priceHistoryUsd", "marketVolumeDailyUsd"]), pools: array(pool) }),
    party: object({ meta, party: str, holdings: array(holding), recent: array(operation) }),
  };
  if (!Object.hasOwn(schemas, route)) fail("route", "a known network route");
  schemas[route](value, route);
  if (route === "overview" && value.validators.active > value.validators.total) fail("overview.validators.active", "at most the total validator count");
  return value;
}

export async function checkLive(adapter, partyId = DEFAULT_PARTY, write = console.log) {
  let failures = 0;
  for (const route of ["overview", "validators", "apps", "liquidity", "party"]) {
    try {
      assertContract(route, await adapter[route](partyId));
      write(`${route}: PASS`);
    } catch (error) {
      failures++;
      // Contract errors contain field paths only. Never print upstream exception data.
      const reason = error instanceof ContractError ? error.message : "live request failed (check server-side key, network and credits)";
      write(`${route}: FAIL — ${reason}`);
    }
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // env.mjs intentionally resolves .env.local against cwd. Support root and ui invocation.
  process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
  await import("../env.mjs");
  const adapter = await import("./ccspace.mjs");
  process.exitCode = await checkLive(adapter, process.argv[2] ?? DEFAULT_PARTY) ? 1 : 0;
}
