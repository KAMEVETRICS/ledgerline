import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

// These literals are synthetic edge cases, not recorded API observations.
const NOW = Date.parse("2026-10-04T12:00:00Z");
const PARTY = "operator::1220abc";
const token = "unit-test-token";
const base = "https://cc-api.itrocket.space/api/v1";
const subject = await import("./ccspace.mjs").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
function need(name) {
  assert.equal(typeof subject[name], "function", `${name} must be implemented`);
  return subject[name];
}
const recording = (name) => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url)));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const validator = { party_id: PARTY, is_validator: true, is_sv: false, liveness: "active", sponsor: "sv::1220def" };
const app = { party_id: PARTY, featured_since: "2026-01-01T00:00:00Z", total_markers: 15, total_cc_earned: "2.50" };
const activity = { granularity: "daily", series: [
  { date: "2026-10-03", sub_type: "command", count: 3, total_volume: "12.5" },
  { date: "2026-10-03", sub_type: "instruction", count: 2, total_volume: "0.5" },
] };
const reward = (at, fields = {}) => ({ event_id: at, record_time: at, reward_type: "validator_liveness", beneficiary: PARTY, amount: "1.25", ...fields });

test("validator mapping keeps actual identity, confirmed liveness and unavailable metrics", () => {
  assert.deepEqual(need("toValidator")(validator), {
    id: PARTY, name: PARTY, party: PARTY, sponsor: "sv::1220def", version: null,
    active: true, lastActiveAt: null, uptime30d: null, rewards30dCC: null,
  });
  assert.equal(subject.toValidator({ ...validator, liveness: "stale", sponsor: null }).active, false);
  assert.equal(subject.toValidator({ ...validator, liveness: null }), null);
  assert.equal(subject.toValidator({ ...validator, party_id: undefined }), null);
});

test("app mapping preserves zero, missing metrics and absent current rights", () => {
  assert.deepEqual(need("toApp")(app), {
    id: PARTY, name: PARTY, provider: PARTY, party: PARTY, featured: true,
    activity30d: 15, rewards30dCC: 2.5, activityDaily: [], url: null,
  });
  const sparse = subject.toApp({ party_id: PARTY, total_markers: 0, total_cc_earned: null });
  assert.equal(sparse.activity30d, 0);
  assert.equal(sparse.rewards30dCC, null);
  assert.equal(sparse.featured, false);
  assert.equal(subject.toApp({}), null);
});

test("CC holding adds unlocked and locked without double-counting total_balance", () => {
  assert.deepEqual(need("toHolding")({ total_balance: "10", unlocked_balance: "10", locked_balance: "3" }),
    { instrument: "CC", admin: null, amount: 13, valueUsd: null });
  assert.equal(subject.toHolding({ unlocked_balance: "0", locked_balance: "0" }).amount, 0);
  for (const bad of [null, undefined, "", " ", "NaN", "Infinity", true, -1]) {
    assert.equal(subject.toHolding({ unlocked_balance: bad, locked_balance: "0" }), null);
  }
});

test("operations never turn private amounts, pending weights or missing amounts into CC", () => {
  const raw = { event_id: "event-1", operation_type: "transfer", direction: "received", record_time: "2026-10-04T08:00:00+02:00", amount: "3.5", counterparty: "other::1220def" };
  assert.deepEqual(need("toOperation")(raw), {
    id: "event-1", at: "2026-10-04T06:00:00.000Z", type: "transfer", direction: "in",
    counterparty: "other::1220def", instrument: "CC", amount: 3.5,
  });
  assert.equal(subject.toOperation({ ...raw, direction: "sent" }).direction, "out");
  assert.equal(subject.toOperation({ ...raw, amount: null, weight: "900" }).amount, null);
  assert.equal(subject.toOperation({ ...raw, amount_pending: true }).amount, null);
  const hidden = subject.toOperation({ ...raw, operation_type: "private_transfer", amount: "999", counterparty: "", tokens: [{ symbol: "CBTC" }] });
  assert.equal(hidden.amount, null);
  assert.equal(hidden.counterparty, null);
  assert.equal(hidden.instrument, "CBTC");
  assert.equal(subject.toOperation({ ...raw, direction: undefined }).direction, "other");
  assert.equal(subject.toOperation({ ...raw, record_time: "bad" }), null);
  assert.equal(subject.toOperation({ ...raw, event_id: undefined }), null);
});

test("real anonymous OneSwap recordings map source identity and null volume without estimating TVL", () => {
  const pool = recording("oneswap-pools")[0];
  const ticker = recording("oneswap-ticker");
  assert.deepEqual(need("toPool")(pool, ticker), {
    id: "rt-36o279", venue: "OneSwap", pair: "CC/CBTC", tvlUsd: null, volume24hUsd: null,
  });
  assert.equal(subject.toPool(pool, { ...ticker, volume24h: { usd: "12.34" } }).volume24hUsd, 12.34);
  assert.equal(subject.toPool(pool, { ...ticker, poolId: "different", volume24h: { usd: "999" } }).volume24hUsd, null);
  assert.equal(subject.toPool({ id: pool.id }), null);
});

test("daily aggregates sum subtypes, sort UTC dates, and reject partial or invalid dates", () => {
  assert.deepEqual(need("toDailySeries")(activity, "count", NOW), [{ t: "2026-10-03", v: 5 }]);
  assert.deepEqual(subject.toDailySeries(activity, "total_volume", NOW), [{ t: "2026-10-03", v: 13 }]);
  const sparse = { granularity: "daily", series: [
    { date: "2026-10-04", count: 0 }, { date: "2026-10-03", count: 3 },
    { date: "2026-10-03", count: null }, { date: "2026-09-01", count: 200 },
    { date: "2026-10-05", count: 2 }, { date: "2026-02-30", count: 2 },
  ] };
  assert.deepEqual(subject.toDailySeries(sparse, "count", NOW), [{ t: "2026-10-04", v: 0 }]);
  assert.deepEqual(subject.toDailySeries({ ...activity, granularity: "monthly" }, "count", NOW), []);
});

test("paged history excludes its partial oldest day and counts distinct liveness parties", () => {
  const history = { exhausted: false, rewards: [
    reward("2026-10-04T10:00:00Z"), reward("2026-10-04T09:00:00Z"),
    reward("2026-10-03T08:00:00Z", { beneficiary: "second::1220" }),
    reward("2026-10-02T23:00:00Z"),
  ] };
  assert.deepEqual(need("toHistorySeries")(history, "validators", NOW), [
    { t: "2026-10-03", v: 1 }, { t: "2026-10-04", v: 1 },
  ]);
  assert.deepEqual(subject.toHistorySeries({ exhausted: false, rewards: history.rewards.slice(0, 1) }, "validators", NOW), []);
});

test("history proves zeros only on covered days and excludes unknown attribution", () => {
  const h = { exhausted: false, rewards: [
    reward("2026-10-04T10:00:00Z", { reward_type: "featured_app_activity", provider: PARTY }),
    reward("2026-10-03T11:00:00Z", { reward_type: "app_activity", provider: null }),
    reward("2026-10-01T00:00:00Z"),
  ] };
  assert.deepEqual(need("toHistorySeries")(h, "apps", NOW, PARTY), [
    { t: "2026-10-02", v: 0 }, { t: "2026-10-04", v: 1 },
  ]);
  assert.deepEqual(subject.toHistorySeries({ exhausted: true, rewards: [reward("not a timestamp")] }, "validators", NOW), []);
});

test("validator rewards require full 30-day history and known CC amounts, not weight", () => {
  const h = { exhausted: true, rewards: [reward("2026-10-04T10:00:00Z"), reward("2026-10-03T11:00:00Z")] };
  assert.equal(need("toValidatorRewards")(h, PARTY, NOW), 2.5);
  assert.equal(subject.toValidatorRewards({ ...h, exhausted: false }, PARTY, NOW), null);
  assert.equal(subject.toValidatorRewards({ ...h, rewards: [{ ...h.rewards[0], amount: null, weight: "100" }] }, PARTY, NOW), null);
});

test("client coalesces concurrent URLs and respects 60s/30s caller TTLs", async () => {
  let at = NOW, calls = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const client = need("createClient")({ getKey: () => token, now: () => at, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.signal instanceof AbortSignal, true);
    await gate;
    return json({ price: calls });
  } });
  const a = client.get(`${base}/price`, { ttl: 60_000 });
  const b = client.get(`${base}/price`, { ttl: 60_000 });
  release();
  assert.deepEqual(await a, await b);
  assert.equal(calls, 1);
  at += 30_001;
  await client.get(`${base}/price`, { ttl: 60_000 });
  assert.equal(calls, 1);
  await client.get(`${base}/price`, { ttl: 30_000 });
  assert.equal(calls, 2);
  at += 60_000;
  await client.get(`${base}/price`, { ttl: 60_000 });
  assert.equal(calls, 3);
});

test("client retries 429 and 5xx once after 1s, including attempts in its budget", async () => {
  for (const status of [429, 500, 503]) {
    let calls = 0;
    const delays = [];
    const budget = { calls: 0 };
    const client = need("createClient")({ getKey: () => token, sleep: async (ms) => delays.push(ms), fetchImpl: async () => {
      calls++; return json(calls === 1 ? { error: token } : { ok: true }, calls === 1 ? status : 200);
    } });
    assert.deepEqual(await client.get(`${base}/price`, { ttl: 60_000, budget }), { ok: true });
    assert.equal(calls, 2);
    assert.equal(budget.calls, 2);
    assert.deepEqual(delays, [1000]);
  }
});

test("client does not retry 401, cache failures or expose upstream error details", async () => {
  let calls = 0;
  const client = need("createClient")({ getKey: () => token, fetchImpl: async () => {
    calls++; return json({ error: `Authorization: Bearer ${token}` }, 401);
  } });
  for (let i = 0; i < 2; i++) await assert.rejects(client.get(`${base}/price`, { ttl: 60_000 }), (error) => {
    assert.equal(error.message.includes(token), false); return /401/.test(error.message);
  });
  assert.equal(calls, 2);
});

test("network failures and JSON errors are sanitized; secrets never leave the CC Space origin", async () => {
  const client = need("createClient")({ getKey: () => token, fetchImpl: async (url, options) => {
    if (url.startsWith("https://api.oneswap.cc")) {
      assert.equal(options.headers.Authorization, undefined); return json([]);
    }
    throw new Error(`fetch failed: ${token}`);
  } });
  await assert.rejects(client.get(`${base}/price`, { ttl: 60_000 }), (error) => !error.message.includes(token));
  await client.get("https://api.oneswap.cc/swapv2/api/rt/pools", { ttl: 60_000 });
  const invalid = subject.createClient({ getKey: () => token, fetchImpl: async () => new Response(`invalid ${token}`) });
  await assert.rejects(invalid.get(`${base}/price`, { ttl: 60_000 }), (error) => !error.message.includes(token));
});

test("credential rotation invalidates cached successes and missing keys cannot use them", async () => {
  let key = token, calls = 0;
  const client = need("createClient")({ getKey: () => key, fetchImpl: async () => { calls++; return json({ ok: true }); } });
  await client.get(`${base}/price`, { ttl: 60_000 });
  key = "rotated-unit-token";
  await client.get(`${base}/price`, { ttl: 60_000 });
  assert.equal(calls, 2);
  key = undefined;
  await assert.rejects(client.get(`${base}/price`, { ttl: 60_000 }), /key/i);
});

test("20-attempt budget stops a retry before a 21st request", async () => {
  let calls = 0;
  const budget = { calls: 19 };
  const client = need("createClient")({ getKey: () => token, sleep: async () => {}, fetchImpl: async () => { calls++; return json({}, 503); } });
  await assert.rejects(client.get(`${base}/price`, { ttl: 60_000, budget }), /budget/i);
  assert.equal(budget.calls, 20);
  assert.equal(calls, 1);
});

function routeFake({ forever = false, invalid = false } = {}) {
  const urls = [], counts = [];
  const adapter = need("createAdapter")({ getKey: () => token, network: "mainnet", now: () => NOW, debug: (line) => counts.push(line), sleep: async () => {}, fetchImpl: async (url, options) => {
    urls.push(url);
    const u = new URL(url);
    assert.equal(u.searchParams.has("offset"), false);
    if (u.hostname === "api.oneswap.cc") {
      assert.equal(options.headers.Authorization, undefined);
      return json(u.pathname.endsWith("/pools") ? recording("oneswap-pools") : recording("oneswap-ticker"));
    }
    if (u.pathname.endsWith("/price")) return json({ amulet_price_usd: "0.16", round_number: 123 });
    if (u.pathname.endsWith("/validators/balances")) return json({ count: 2, validators: [validator, { ...validator, party_id: "sv::1220", is_validator: false, is_sv: true }] });
    if (u.pathname.endsWith("/featured-apps")) return json({ total: 1, items: [app] });
    if (u.pathname.endsWith("/transfer-activity")) return json(invalid ? { error: token } : activity);
    if (u.pathname.endsWith("/rewards")) {
      assert.equal(u.searchParams.get("limit"), "100");
      const cursor = u.searchParams.get("before");
      const n = cursor ? Number(cursor.split(":")[1]) : 0;
      return json({ rewards: [reward(`2026-10-0${4 - Math.min(n, 2)}T10:00:00Z`)], has_more: forever || n < 1, next_cursor: `cursor:${n + 1}` });
    }
    if (u.pathname.endsWith("/balance")) return json({ total_balance: "10", unlocked_balance: "10", locked_balance: "3" });
    if (u.pathname.endsWith("/operations")) return json({ party_id: PARTY, operations: [{ event_id: "op1", operation_type: "private_transfer", direction: "sent", record_time: "2026-10-03T12:00:00Z", amount: null }] });
    throw new Error(`Unexpected test URL: ${url}`);
  } });
  return { adapter, urls, counts };
}

test("all five routes expose live shapes without invented supply, market histories or round close times", async () => {
  const { adapter, counts } = routeFake();
  const overview = await adapter.overview();
  assert.equal(overview.meta.source, "ccspace");
  assert.equal(overview.latestRound, 123);
  assert.deepEqual(overview.validators, { total: 1, active: 1 });
  assert.equal(overview.ccPriceUsd, 0.16);
  assert.equal(overview.ccSupply, null);
  assert.equal(overview.transfers24h, null);
  assert.deepEqual(overview.series.transfersDaily, [{ t: "2026-10-03", v: 5 }]);
  const validators = await adapter.validators();
  assert.equal(validators.validators.length, 1);
  assert.deepEqual(validators.series.rewardsPerRoundCC, []);
  assert.equal((await adapter.apps()).apps[0].activity30d, 15);
  const liquidity = await adapter.liquidity();
  assert.deepEqual(liquidity.cc.priceUsd, []);
  assert.deepEqual(liquidity.cc.supply, []);
  assert.deepEqual(liquidity.cc.transferVolumeDailyCC, [{ t: "2026-10-03", v: 13 }]);
  const portfolio = await adapter.party(PARTY);
  assert.equal(portfolio.holdings[0].amount, 13);
  assert.equal(portfolio.recent[0].amount, null);
  assert.equal(counts.length, 5);
  for (const line of counts) assert.equal(line.includes(token), false);
});

test("history uses source cursors and cannot consume more than the route budget", async () => {
  const { adapter, urls, counts } = routeFake({ forever: true });
  const report = await adapter.validators();
  assert.match(report.meta.note, /history|coverage/i);
  assert.ok(urls.length <= 20);
  assert.ok(urls.some((url) => new URL(url).searchParams.get("before") === "cursor:1"));
  assert.match(counts[0], /upstream calls=/);
});

test("unsupported networks and malformed required envelopes throw to fixture fallback", async () => {
  const adapter = need("createAdapter")({ getKey: () => token, network: "testnet", fetchImpl: async () => { assert.fail("must not relabel a mainnet response"); } });
  await assert.rejects(adapter.overview(), /network/i);
  await assert.rejects(routeFake({ invalid: true }).adapter.liquidity(), /response/i);
  await assert.rejects(routeFake().adapter.party("invalid/value"), /party/i);
});

test("gateway survives no key and a bad key, returning fixtures for all routes", () => {
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  for (const key of ["", "bad-unit-token"]) {
    const script = `
      import assert from 'node:assert/strict';
      globalThis.fetch = async () => new Response(JSON.stringify({error: 'unauthorized'}), {status: 401});
      const {handleNetwork} = await import('./scripts/network/index.mjs');
      for (const route of ['overview','validators','apps','liquidity','party/${PARTY}']) {
        let payload, status;
        await handleNetwork({url: '/api/network/'+route, method: 'GET'}, {writeHead(s){status=s},end(x){payload=JSON.parse(x)}});
        assert.equal(status, 200); assert.equal(payload.meta.source, 'fixture');
      }
      console.log('five fixture routes');`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd, encoding: "utf8", env: { ...process.env, CCSPACE_API_KEY: key, CCSPACE_NETWORK: "mainnet", NODE_DEBUG: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /five fixture routes/);
    assert.equal(result.stderr.includes("bad-unit-token"), false);
  }
});

const checker = await import("./check-contract.mjs").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
function contract(route, value, options) {
  assert.equal(typeof checker.assertContract, "function", "runtime contract checker must be implemented");
  return checker.assertContract(route, value, options);
}

test("runtime checker validates all nested fixture shapes and all adapter routes", async () => {
  for (const route of ["overview", "validators", "apps", "liquidity", "party"]) {
    const body = JSON.parse(readFileSync(new URL(`./fixtures/${route}.json`, import.meta.url)));
    contract(route, body, { source: "fixture", now: Date.parse(body.meta.asOf) });
  }
  const { adapter } = routeFake();
  for (const route of ["overview", "validators", "apps", "liquidity", "party"]) {
    contract(route, await adapter[route](PARTY), { now: NOW });
  }
});

test("runtime checker rejects missing or extra keys, wrong types, nonfinite numbers and sources", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/overview.json", import.meta.url)));
  for (const mutate of [
    (x) => { delete x.validators.active; }, (x) => { x.ccPriceUsd = NaN; },
    (x) => { x.latestRound = "12"; }, (x) => { x.meta.asOf = "2026-02-30T12:00:00Z"; },
    (x) => { x.extra = true; }, (x) => { x.validators.active = Infinity; },
    (x) => { x.validators.active = x.validators.total + 1; },
  ]) {
    const copy = structuredClone(raw); mutate(copy);
    assert.throws(() => contract("overview", copy, { source: "fixture", now: Date.parse(raw.meta.asOf) }), /contract/i);
  }
  assert.throws(() => contract("overview", raw, { now: NOW }), /source/i);
});

test("runtime checker rejects duplicate, unsorted, oversized and out-of-window series", async () => {
  const raw = await routeFake().adapter.liquidity();
  contract("liquidity", raw, { now: NOW });
  for (const series of [
    [{ t: "2026-10-03", v: 1 }, { t: "2026-10-02", v: 2 }],
    [{ t: "2026-10-03", v: 1 }, { t: "2026-10-03", v: 2 }],
    [{ t: "2026-01-01", v: 1 }], [{ t: "2026-10-05", v: 1 }],
    [{ t: "2026-10-03T00:00:00Z", v: 1 }],
  ]) {
    const copy = structuredClone(raw); copy.cc.priceUsd = series;
    assert.throws(() => contract("liquidity", copy, { now: NOW }), /contract/i);
  }
});

test("checker CLI prints one failure per route and exits nonzero without the key from root and ui", () => {
  const ui = fileURLToPath(new URL("../../", import.meta.url));
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  for (const [cwd, script] of [[root, "ui/scripts/network/check-contract.mjs"], [ui, "scripts/network/check-contract.mjs"]]) {
    const result = spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: { ...process.env, CCSPACE_API_KEY: "", NODE_DEBUG: "" } });
    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim().split(/\r?\n/).length, 5);
    assert.match(result.stdout, /overview: FAIL/);
    assert.match(result.stdout, /party: FAIL/);
  }
});

test("calendar-invalid operation dates cannot normalize into invented real timestamps", () => {
  assert.equal(need("toOperation")({ event_id: "event", operation_type: "transfer", record_time: "2026-02-30T12:00:00Z" }), null);
});

test("missing validator-reward attribution cannot produce a false zero total", () => {
  const history = { exhausted: true, rewards: [reward("2026-10-03T10:00:00Z", { beneficiary: null })] };
  assert.equal(need("toValidatorRewards")(history, PARTY, NOW), null);
});

test("cached history across UTC midnight does not invent a zero on an unobserved day", async () => {
  let at = Date.parse("2026-10-03T23:59:40Z");
  const adapter = need("createAdapter")({ getKey: () => token, now: () => at, fetchImpl: async (url) => {
    if (url.endsWith("/validators/balances")) return json({ validators: [validator] });
    return json({ rewards: [reward("2026-10-03T12:00:00Z")], has_more: false });
  } });
  await adapter.validators();
  at += 30_000;
  const result = await adapter.validators();
  assert.equal(result.series.activeDaily.at(-1).t, "2026-10-03");
  assert.equal(result.meta.asOf, "2026-10-03T23:59:40.000Z");
});

test("recorded CC Space validator status is active, and real coupons use the validator reward type", () => {
  const raw = recording("validators-balances").validators[0];
  const mapped = need("toValidator")(raw);
  assert.ok(mapped);
  assert.equal(mapped.active, true);
  assert.equal(mapped.sponsor, raw.sponsor);
  assert.equal(mapped.party, raw.party_id);
  const coupons = recording("rewards").rewards;
  const coupon = coupons.find((row) => row.reward_type === "validator");
  assert.ok(coupon);
  // The explicit amount below is a synthetic edge case; the recorded type/party are real.
  const history = { exhausted: true, rewards: [{ ...coupon, amount: "1.75" }] };
  assert.equal(subject.toValidatorRewards(history, coupon.beneficiary, NOW), 1.75);
});

test("every pure mapping handles its real CC Space endpoint recording", () => {
  const rawApp = recording("featured-apps").items[0];
  const mappedApp = need("toApp")(rawApp);
  assert.equal(mappedApp.activity30d, 1450023);
  assert.equal(mappedApp.rewards30dCC, 2103857.4975890012);
  assert.equal(mappedApp.featured, true);
  assert.equal(mappedApp.url, null);
  assert.equal(subject.toHolding(recording("party-balance")).amount, 23204.7480688846);
  const op = subject.toOperation(recording("party-operations").operations[0]);
  assert.equal(op.at, "2026-10-03T14:05:00.057Z");
  assert.equal(op.type, "private_transfer");
  assert.equal(op.direction, "out");
  assert.equal(op.amount, null);
  const daily = subject.toDailySeries(recording("transfer-activity"), "count", NOW);
  assert.deepEqual(daily.find((point) => point.t === "2026-10-03"), { t: "2026-10-03", v: 346565 });
  const history = { exhausted: false, rewards: [...recording("rewards").rewards, ...recording("rewards-before").rewards] };
  assert.deepEqual(subject.toHistorySeries(history, "apps", NOW, rawApp.party_id), []);
  assert.deepEqual(subject.toHistorySeries(history, "validators", NOW), []);
  assert.equal(subject.toValidatorRewards(history, rawApp.party_id, NOW), null);
});

test("a fully paged coupon feed without liveness markers cannot invent validator activity zeros", () => {
  const history = { exhausted: true, rewards: [reward("2026-10-03T10:00:00Z", { reward_type: "validator" })] };
  assert.deepEqual(need("toHistorySeries")(history, "validators", NOW), []);
});

test("all five contracts accept the real endpoint recordings, including governance price", async () => {
  const recordedParty = recording("party-operations").party_id;
  const adapter = need("createAdapter")({ getKey: () => token, now: () => NOW, fetchImpl: async (url) => {
    const parsed = new URL(url);
    if (parsed.hostname === "api.oneswap.cc") return json(recording(parsed.pathname.endsWith("/pools") ? "oneswap-pools" : "oneswap-ticker"));
    const name = parsed.pathname.endsWith("/price") ? "price"
      : parsed.pathname.endsWith("/validators/balances") ? "validators-balances"
      : parsed.pathname.endsWith("/featured-apps") ? "featured-apps"
      : parsed.pathname.endsWith("/transfer-activity") ? "transfer-activity"
      : parsed.pathname.endsWith("/rewards") ? (parsed.searchParams.has("before") ? "rewards-before" : "rewards")
      : parsed.pathname.endsWith("/balance") ? "party-balance" : "party-operations";
    return json(recording(name));
  } });
  for (const route of ["overview", "validators", "apps", "liquidity", "party"]) {
    const value = await adapter[route](recordedParty);
    contract(route, value, { now: NOW });
    if (route === "overview") {
      assert.equal(value.latestRound, 115885);
      assert.equal(value.ccPriceUsd, 0.125715);
      assert.match(value.meta.note, /governance price/);
    }
  }
});
