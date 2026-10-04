// Server-only CC Space adapter. See docs/data-sources.md for field semantics.
import { debuglog } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const BASE = "https://cc-api.itrocket.space/api/v1";
const ONESWAP = "https://api.oneswap.cc/swapv2/api/rt";
const DAY = 86_400_000;
const NETWORK_TTL = 60_000;
const PARTY_TTL = 30_000;
const MAX_CALLS = 20;
const debug = debuglog("ccspace");
const text = (value) => typeof value === "string" && value.trim() ? value : null;
const decimal = (value) => {
  if (typeof value !== "number" && !(typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const count = (value) => {
  const number = decimal(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};
const iso = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  if (!isDate(value.slice(0, 10))) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
};
const dayStart = (now) => Math.floor(now / DAY) * DAY;
const date = (at) => new Date(at).toISOString().slice(0, 10);
const isDate = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value)
  && Number.isFinite(Date.parse(value)) && date(Date.parse(value)) === value;
const rows = (body, field) => {
  if (!body || !Array.isArray(body[field])) throw new Error("Unexpected CC Space response envelope");
  return body[field];
};

/** URL-keyed raw-response cache; injected IO/clock keep production behavior testable. */
export function createClient({ fetchImpl = globalThis.fetch, now = Date.now,
  getKey = () => process.env.CCSPACE_API_KEY, sleep = delay } = {}) {
  const cache = new Map();
  const inflight = new Map();
  let credential;

  async function get(url, { ttl = NETWORK_TTL, budget = { calls: 0 } } = {}) {
    const origin = new URL(url).origin;
    const authenticated = origin === "https://cc-api.itrocket.space";
    if (!authenticated && origin !== "https://api.oneswap.cc") throw new Error("Unsupported upstream origin");
    const key = authenticated ? getKey() : undefined;
    if (authenticated) {
      if (!text(key)) throw new Error("CC Space API key is missing");
      if (credential !== key) {
        credential = key;
        cache.clear();
        inflight.clear();
      }
    }
    // Remove expired entries so lookups of different parties do not retain them forever.
    for (const [cachedUrl, entry] of cache) if (now() - entry.fetchedAt >= NETWORK_TTL) cache.delete(cachedUrl);
    const cached = cache.get(url);
    const observe = (entry) => {
      budget.asOf = Math.min(budget.asOf ?? Infinity, entry.fetchedAt);
      budget.lastFetchedAt = entry.fetchedAt;
      return entry.body;
    };
    if (cached && now() - cached.fetchedAt < ttl) return observe(cached);
    if (inflight.has(url)) return observe(await inflight.get(url));

    const label = authenticated ? "CC Space" : "OneSwap";
    const request = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (budget.calls >= MAX_CALLS) throw new Error("Upstream request budget exhausted");
        budget.calls++;
        let response;
        try {
          response = await fetchImpl(url, {
            headers: authenticated ? { Authorization: `Bearer ${key}` } : {},
            signal: AbortSignal.timeout(8000),
            redirect: "error",
          });
        } catch {
          throw new Error(`${label} request failed or timed out`);
        }
        if (!response.ok) {
          const status = response.status;
          try { await response.body?.cancel(); } catch { /* No error bodies are exposed. */ }
          if (attempt === 0 && (status === 429 || status >= 500 && status <= 599)) {
            await sleep(1000);
            continue;
          }
          throw new Error(`${label} HTTP ${status}`);
        }
        let body;
        try { body = await response.json(); }
        catch { throw new Error(`${label} returned invalid JSON`); }
        const entry = { body, fetchedAt: now() };
        // An older in-flight response cannot repopulate a rotated credential's cache.
        if (!authenticated || key === credential) cache.set(url, entry);
        return entry;
      }
    })();
    inflight.set(url, request);
    try { return observe(await request); }
    finally { if (inflight.get(url) === request) inflight.delete(url); }
  }
  return { get };
}

export function toValidator(raw, rewards30dCC = null) {
  const party = text(raw?.party_id);
  if (!party || !["active", "stale"].includes(raw.liveness)) return null;
  return { id: party, name: party, party, sponsor: text(raw.sponsor), version: null,
    active: raw.liveness === "active", lastActiveAt: null, uptime30d: null, rewards30dCC };
}

export function toApp(raw, activityDaily = []) {
  const party = text(raw?.party_id);
  if (!party) return null;
  return { id: party, name: party, provider: party, party, featured: iso(raw.featured_since) !== null,
    activity30d: count(raw.total_markers), rewards30dCC: decimal(raw.total_cc_earned), activityDaily, url: null };
}

export function toHolding(raw) {
  const unlocked = decimal(raw?.unlocked_balance), locked = decimal(raw?.locked_balance);
  if (unlocked === null || locked === null || unlocked < 0 || locked < 0 || !Number.isFinite(unlocked + locked)) return null;
  return { instrument: "CC", admin: null, amount: unlocked + locked, valueUsd: null };
}

export function toOperation(raw) {
  const id = text(raw?.event_id) ?? text(raw?.update_id);
  const at = iso(raw?.record_time), type = text(raw?.operation_type);
  if (!id || !at || !type) return null;
  const privateTransfer = type === "private_transfer";
  const tokens = Array.isArray(raw.tokens) ? raw.tokens : [];
  const instrument = privateTransfer ? tokens.length === 1 ? text(tokens[0]?.symbol) : null
    : ["transfer", "offer", "preapproval", "reward", "burn"].includes(type) ? "CC" : null;
  return { id, at, type, direction: raw.direction === "received" ? "in" : raw.direction === "sent" ? "out" : "other",
    counterparty: text(raw.counterparty), instrument,
    amount: privateTransfer || raw.amount_pending === true ? null : decimal(raw.amount) };
}

export function toPool(raw, ticker) {
  const id = text(raw?.id), x = text(raw?.assetX?.symbol), y = text(raw?.assetY?.symbol);
  if (!id || !x || !y) return null;
  return { id, venue: "OneSwap", pair: `${x}/${y}`, tvlUsd: null,
    volume24hUsd: ticker?.poolId === id ? decimal(ticker.volume24h?.usd) : null };
}

export function toDailySeries(raw, field, now) {
  if (raw?.granularity !== "daily") return [];
  const grouped = new Map();
  const invalid = new Set();
  const from = date(dayStart(now) - 29 * DAY), to = date(now);
  for (const row of rows(raw, "series")) {
    const t = row?.date;
    if (!isDate(t) || t < from || t > to) continue;
    const value = field === "count" ? count(row[field]) : decimal(row[field]);
    if (value === null || value < 0) { invalid.add(t); continue; }
    const sum = (grouped.get(t) ?? 0) + value;
    if (!Number.isFinite(sum) || field === "count" && !Number.isSafeInteger(sum)) invalid.add(t);
    else grouped.set(t, sum);
  }
  return [...grouped].filter(([t]) => !invalid.has(t)).sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => ({ t, v }));
}

// Bounded pagination cannot prove a full oldest day unless the feed is exhausted.
function historyWindow(history, now) {
  const from = dayStart(now) - 29 * DAY;
  const parsed = [];
  const seen = new Set();
  for (const raw of history.rewards) {
    const at = iso(raw?.record_time);
    if (!at) return null;
    const id = text(raw.event_id);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    parsed.push({ raw, at: Date.parse(at) });
  }
  const oldest = parsed.length ? Math.min(...parsed.map((row) => row.at)) : Infinity;
  const coveredFrom = history.exhausted ? from : Math.max(from, dayStart(oldest) + DAY);
  return { from, coveredFrom, parsed, observedUntil: Math.min(now, history.asOf ?? now) };
}

export function toHistorySeries(history, kind, now, partyId) {
  const window = historyWindow(history, now);
  if (!window || !Number.isFinite(window.coveredFrom) || window.coveredFrom > now) return [];
  // The observed coupon feed has validator CC rewards, not a guaranteed liveness feed.
  if (kind === "validators" && !window.parsed.some(({ raw }) => raw.reward_type === "validator_liveness")) return [];
  const values = new Map();
  const invalid = new Set();
  for (const { raw, at } of window.parsed) {
    if (at < window.coveredFrom || at > window.observedUntil) continue;
    const t = date(at);
    if (kind === "validators" && raw.reward_type === "validator_liveness") {
      const beneficiary = text(raw.beneficiary);
      if (!beneficiary) { invalid.add(t); continue; }
      if (!values.has(t)) values.set(t, new Set());
      values.get(t).add(beneficiary);
    } else if (kind === "apps" && ["featured_app_activity", "app_activity"].includes(raw.reward_type)) {
      if (!text(raw.provider) || !text(raw.event_id)) { invalid.add(t); continue; }
      if (raw.provider === partyId) values.set(t, (values.get(t) ?? 0) + 1);
    }
  }
  const points = [];
  for (let at = window.coveredFrom; at <= dayStart(window.observedUntil); at += DAY) {
    const t = date(at);
    if (!invalid.has(t)) points.push({ t, v: kind === "validators" ? values.get(t)?.size ?? 0 : values.get(t) ?? 0 });
  }
  return points;
}

export function toValidatorRewards(history, partyId, now) {
  const window = historyWindow(history, now);
  if (!window || window.coveredFrom > window.from) return null;
  let sum = 0;
  for (const { raw, at } of window.parsed) {
    if (at < window.from || at > now || !["validator", "validator_reward", "validator_liveness", "validator_faucet"].includes(raw.reward_type)) continue;
    if (!text(raw.beneficiary)) return null;
    if (raw.beneficiary !== partyId) continue;
    const amount = decimal(raw.amount);
    if (amount === null || raw.amount_pending === true) return null;
    sum += amount;
    if (!Number.isFinite(sum)) return null;
  }
  return sum;
}

const HISTORY_NOTE = "Reward history is bounded by the request budget; activity shows only UTC days with proven coverage. Unknown attribution is omitted. Daily validator activity is unavailable when the coupon feed supplies no liveness markers. Per-round rewards are unavailable because coupon record times are not round close times.";
const APP_NOTE = "Apps are providers with markers in the last 30 UTC days including today, not a registry of all applications. Names are party identifiers; URLs are unavailable. CC rewards may remain zero until issuance closes.";

/** Five gateway routes share one raw URL cache, without modifying the contract. */
export function createAdapter(options = {}) {
  const now = options.now ?? Date.now;
  const getKey = options.getKey ?? (() => process.env.CCSPACE_API_KEY);
  const client = createClient({ ...options, now, getKey });
  const log = options.debug ?? debug;

  async function route(name, build) {
    const ctx = { calls: 0, notes: [], at: now() };
    try {
      const network = options.network ?? process.env.CCSPACE_NETWORK ?? "mainnet";
      if (network !== "mainnet") throw new Error("CC Space network has no documented supported API host");
      if (!text(getKey())) throw new Error("CC Space API key is missing");
      const body = await build(ctx);
      const note = [...new Set(ctx.notes)].join(" ");
      return { meta: { source: "ccspace", network, asOf: new Date(ctx.asOf ?? ctx.at).toISOString(), ...(note ? { note } : {}) }, ...body };
    } finally {
      log(`[ccspace] ${name} upstream calls=${ctx.calls}`);
    }
  }
  const get = (ctx, path, ttl = NETWORK_TTL) => client.get(`${BASE}${path}`, { ttl, budget: ctx });
  const getPublic = (ctx, path) => client.get(`${ONESWAP}${path}`, { ttl: NETWORK_TTL, budget: ctx });

  async function validatorRows(ctx) {
    const raw = await get(ctx, "/validators/balances");
    return rows(raw, "validators").filter((row) => row?.is_validator === true);
  }
  async function appPage(ctx) {
    const raw = await get(ctx, "/featured-apps?period=30d&view=providers&limit=100");
    const items = rows(raw, "items"), total = count(raw.total);
    if (total === null || total < items.length) throw new Error("Unexpected CC Space featured-app response");
    if (total > items.length) ctx.notes.push(`Featured-app page contains ${items.length} of ${total} providers; remaining rows are omitted.`);
    return { items, total };
  }
  async function transferActivity(ctx) {
    const raw = await get(ctx, "/transfer-activity?period=30d");
    rows(raw, "series");
    if (raw.granularity !== "daily") throw new Error("Unexpected CC Space activity response granularity");
    return raw;
  }
  async function history(ctx, maxPages) {
    const result = { rewards: [], exhausted: false };
    let cursor;
    const seen = new Set();
    for (let page = 0; page < maxPages && MAX_CALLS - ctx.calls >= 2; page++) {
      const raw = await get(ctx, `/rewards?limit=100${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`);
      if (page === 0) result.asOf = ctx.lastFetchedAt;
      const rewards = rows(raw, "rewards");
      if (typeof raw.has_more !== "boolean") throw new Error("Unexpected CC Space history response");
      result.rewards.push(...rewards);
      if (!raw.has_more) { result.exhausted = true; break; }
      const times = rewards.map((row) => iso(row?.record_time)).filter(Boolean);
      if (times.some((at) => Date.parse(at) < dayStart(ctx.at) - 29 * DAY)) break;
      const next = text(raw.next_cursor);
      if (!next || seen.has(next) || rewards.length === 0) {
        ctx.notes.push("Reward history pagination ended without a usable new cursor; incomplete days are omitted.");
        break;
      }
      seen.add(next);
      cursor = next;
    }
    ctx.notes.push(HISTORY_NOTE);
    return result;
  }

  return {
    overview: () => route("overview", async (ctx) => {
      const price = await get(ctx, "/price");
      if (!price || typeof price !== "object" || Array.isArray(price) || "error" in price) throw new Error("Unexpected CC Space price response");
      const validators = await validatorRows(ctx);
      const featured = await appPage(ctx);
      const activity = await transferActivity(ctx);
      const rewards = await history(ctx, 6);
      const unknown = validators.filter((row) => !["active", "stale"].includes(row.liveness)).length;
      if (unknown) ctx.notes.push(`${unknown} validators have unknown liveness; the active count includes confirmed live validators only.`);
      ctx.notes.push("CC price is the DSO/SV governance price, not an exchange quote. CC supply and rolling 24-hour transfer counts are unavailable. Featured-app count is providers with markers in the 30-UTC-day window.");
      return { latestRound: count(price.round_number), validators: { total: validators.length,
        active: validators.filter((row) => row.liveness === "active").length }, featuredApps: featured.total,
        ccPriceUsd: decimal(price.amulet_price_usd), ccSupply: null, transfers24h: null,
        series: { transfersDaily: toDailySeries(activity, "count", ctx.at), activeValidatorsDaily: toHistorySeries(rewards, "validators", ctx.at) } };
    }),
    validators: () => route("validators", async (ctx) => {
      const raw = await validatorRows(ctx);
      const rewards = await history(ctx, 9);
      const validators = raw.map((row) => toValidator(row, toValidatorRewards(rewards, row.party_id, ctx.at))).filter(Boolean);
      if (validators.length !== raw.length) ctx.notes.push(`${raw.length - validators.length} validators omitted because identity or liveness is unknown.`);
      ctx.notes.push("Validator names are party identifiers. Versions, last-active timestamps and 30-day round-based uptime are unavailable; CC reward totals are null unless the full window is covered.");
      return { validators, series: { activeDaily: toHistorySeries(rewards, "validators", ctx.at), rewardsPerRoundCC: [] } };
    }),
    apps: () => route("apps", async (ctx) => {
      const { items } = await appPage(ctx);
      const rewards = await history(ctx, 9);
      const apps = items.map((row) => toApp(row, toHistorySeries(rewards, "apps", ctx.at, row?.party_id))).filter(Boolean);
      if (apps.length !== items.length) ctx.notes.push("Unidentified featured-app rows are omitted.");
      ctx.notes.push(APP_NOTE);
      return { apps };
    }),
    liquidity: () => route("liquidity", async (ctx) => {
      const activity = await transferActivity(ctx);
      ctx.notes.push("CC price and supply histories are unavailable. Transfer volume is publicly indexed CC volume; hidden amounts are excluded. Pools come from OneSwap's anonymous read API; TVL is not supplied and remains null.");
      let rawPools;
      try {
        rawPools = await getPublic(ctx, "/pools");
        if (!Array.isArray(rawPools)) throw new Error("Unexpected OneSwap pool response");
      } catch {
        ctx.notes.push("OneSwap pool listing is unavailable; no pools are shown.");
        rawPools = [];
      }
      const pools = [];
      for (const raw of rawPools) {
        if (!toPool(raw)) { ctx.notes.push("Unidentified OneSwap pools are omitted."); continue; }
        let ticker;
        if (MAX_CALLS - ctx.calls >= 2) {
          try { ticker = await getPublic(ctx, `/pool/${encodeURIComponent(raw.id)}/ticker`); }
          catch { ctx.notes.push("Some OneSwap tickers are unavailable; their 24-hour USD volume remains null."); }
        } else ctx.notes.push("The request budget limits OneSwap ticker coverage; remaining 24-hour USD volumes are null.");
        pools.push(toPool(raw, ticker));
      }
      return { cc: { priceUsd: [], supply: [], transferVolumeDailyCC: toDailySeries(activity, "total_volume", ctx.at) }, pools };
    }),
    party: (partyId) => route("party", async (ctx) => {
      if (typeof partyId !== "string" || !/^[\w.\-:]{3,512}$/.test(partyId)) throw new Error("Invalid party identifier");
      const path = `/parties/${encodeURIComponent(partyId)}`;
      const wallet = await get(ctx, `${path}/balance`, PARTY_TTL);
      if (!wallet || typeof wallet !== "object" || Array.isArray(wallet) || "error" in wallet) throw new Error("Unexpected CC Space wallet response");
      const operations = await get(ctx, `${path}/operations?limit=100`, PARTY_TTL);
      if (operations.party_id !== undefined && operations.party_id !== partyId) throw new Error("Unexpected CC Space party response identity");
      const raw = rows(operations, "operations");
      const recent = raw.map(toOperation).filter(Boolean);
      const holding = toHolding(wallet);
      if (!holding) ctx.notes.push("CC balances are unavailable; no CC holding is shown.");
      if (recent.length !== raw.length) ctx.notes.push("Operations with missing required identity, time or type are omitted.");
      ctx.notes.push("Holdings cover CC only; token-standard holdings and market valuations are unavailable. Private transfer amounts and pending rewards remain null. Recent operations are limited to the newest 100 source rows.");
      return { party: partyId, holdings: holding ? [holding] : [], recent };
    }),
  };
}

const live = createAdapter();
export const overview = live.overview;
export const validators = live.validators;
export const apps = live.apps;
export const liquidity = live.liquidity;
export const party = live.party;
