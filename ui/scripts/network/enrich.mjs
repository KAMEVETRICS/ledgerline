// Server-only enrichment of the CC Space responses with two more public sources:
// - 5N Lighthouse (LIGHTHOUSE_API_KEY, free key): validator versions, last-active
//   times and the network's current version.
// - CoinGecko (no key, "Data by CoinGecko"): CC market price, market cap and
//   exchange volume history; supply is derived as market cap / price.
// Both are optional. When one fails, the response is served without it and the
// note says so. Results are kept in memory for 30 minutes; the gateway also
// caches the finished responses on disk.
const LIGHTHOUSE = "https://lighthouse.cantonloop.com/api";
const COINGECKO = "https://api.coingecko.com/api/v3/coins/canton-network";
const TTL = 30 * 60_000;
const DAY = 86_400_000;

const memo = new Map();
async function cached(key, load) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = await load();
  memo.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!res.ok) {
    try { await res.body?.cancel(); } catch { /* error bodies are never exposed */ }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

const finite = (v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const iso = (v) => {
  const at = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
};
const date = (ms) => new Date(ms).toISOString().slice(0, 10);

// ---- Lighthouse

const hasLighthouse = () => !!process.env.LIGHTHOUSE_API_KEY?.trim();
const lighthouse = (path) => getJson(`${LIGHTHOUSE}${path}`, { Authorization: `Bearer ${process.env.LIGHTHOUSE_API_KEY.trim()}` });

/** Map of validator party id -> { version, lastActiveAt }, plus the network's current version. */
function lighthouseValidators() {
  return cached("lh-validators", async () => {
    const [list, stats] = await Promise.all([lighthouse("/validators"), lighthouse("/stats").catch(() => null)]);
    if (!Array.isArray(list?.validators)) throw new Error("unexpected validators response");
    const byId = new Map();
    for (const v of list.validators) {
      if (typeof v?.id !== "string") continue;
      byId.set(v.id, { version: typeof v.version === "string" && v.version.trim() ? v.version.trim() : null, lastActiveAt: iso(v.last_active_at) });
    }
    const networkVersion = typeof stats?.version === "string" && stats.version.trim() ? stats.version.trim() : null;
    return { byId, networkVersion };
  });
}

// ---- CoinGecko

/** Daily series since listing: price (USD), market cap (USD), exchange volume (USD). */
function coingecko() {
  return cached("coingecko", async () => {
    const chart = await getJson(`${COINGECKO}/market_chart?vs_currency=usd&days=365&interval=daily`);
    const daily = (rows) => {
      const byDay = new Map();
      // Keep the last observation of each UTC day (the final row is "now").
      for (const row of Array.isArray(rows) ? rows : []) {
        const t = finite(row?.[0]), v = finite(row?.[1]);
        if (t !== null && v !== null && v >= 0) byDay.set(date(t), v);
      }
      return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => ({ t, v }));
    };
    const price = daily(chart.prices), cap = daily(chart.market_caps), volume = daily(chart.total_volumes);
    if (price.length === 0) throw new Error("no price history");
    const priceOn = new Map(price.map((p) => [p.t, p.v]));
    const supply = cap.filter((p) => priceOn.get(p.t) > 0).map((p) => ({ t: p.t, v: Math.round(p.v / priceOn.get(p.t)) }));
    return { price, supply, volume, asOf: new Date().toISOString() };
  });
}

const lastDays = (points, days, now = Date.now()) => {
  const from = date(Math.floor(now / DAY) * DAY - (days - 1) * DAY);
  return points.filter((p) => p.t >= from);
};

// ---- per-route enrichment

// Sentences in the CC Space notes that an enrichment makes untrue.
function withSource(body, source, note, corrections = []) {
  const meta = { ...body.meta, sources: [...new Set([...(body.meta.sources ?? ["CC Space"]), ...(source ? [source] : [])])] };
  for (const [from, to] of corrections) if (meta.note) meta.note = meta.note.replace(from, to);
  if (note) meta.note = [meta.note, note].filter(Boolean).join(" ");
  return { ...body, meta };
}

async function attempt(body, source, work) {
  try {
    return await work();
  } catch (e) {
    console.warn(`[network] ${source} unavailable: ${e.message}`);
    return withSource(body, null, `${source} data is unavailable right now.`);
  }
}

export async function enrichValidators(body) {
  if (!hasLighthouse()) return body;
  return attempt(body, "5N Lighthouse", async () => {
    const { byId, networkVersion } = await lighthouseValidators();
    let matched = 0;
    const validators = body.validators.map((v) => {
      const lh = byId.get(v.id);
      if (!lh) return v;
      matched++;
      return { ...v, version: v.version ?? lh.version, lastActiveAt: v.lastActiveAt ?? lh.lastActiveAt };
    });
    return withSource({ ...body, validators, networkVersion }, "5N Lighthouse",
      `Versions and last-active times come from 5N Lighthouse (${matched} of ${validators.length} validators matched).`,
      [["Versions, last-active timestamps and 30-day round-based uptime are unavailable", "30-day round-based uptime is unavailable"]]);
  });
}

export async function enrichOverview(body) {
  return attempt(body, "CoinGecko", async () => {
    const cg = await coingecko();
    const supply = cg.supply.at(-1)?.v ?? null;
    if (body.ccSupply != null || supply == null) return body;
    return withSource({ ...body, ccSupply: supply }, "CoinGecko", "CC supply is circulating supply derived from CoinGecko market data.",
      [["CC supply and rolling 24-hour transfer counts are unavailable.", "Rolling 24-hour transfer counts are unavailable."]]);
  });
}

export async function enrichLiquidity(body) {
  return attempt(body, "CoinGecko", async () => {
    const cg = await coingecko();
    const cc = {
      ...body.cc,
      priceUsd: body.cc.priceUsd.length ? body.cc.priceUsd : lastDays(cg.price, 30),
      supply: body.cc.supply.length ? body.cc.supply : lastDays(cg.supply, 30),
      priceHistoryUsd: cg.price,
      marketVolumeDailyUsd: lastDays(cg.volume, 30),
    };
    return withSource({ ...body, cc }, "CoinGecko",
      "Market price, exchange volume and circulating supply (market cap ÷ price) are from CoinGecko.",
      [["CC price and supply histories are unavailable. ", ""]]);
  });
}

export async function enrichParty(body) {
  return attempt(body, "CoinGecko", async () => {
    const price = (await coingecko()).price.at(-1)?.v;
    if (!price) return body;
    const holdings = body.holdings.map((h) => (h.instrument === "CC" && h.valueUsd == null ? { ...h, valueUsd: h.amount * price } : h));
    return withSource({ ...body, holdings }, "CoinGecko", `CC holdings are valued at the CoinGecko market price ($${price.toFixed(4)}).`,
      [["token-standard holdings and market valuations are unavailable", "token-standard holdings are unavailable"]]);
  });
}
