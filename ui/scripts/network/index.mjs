// Network data gateway: serves /api/network/* in the shapes defined by
// ui/src/network/types.ts. With CCSPACE_API_KEY set (ui/.env.local) it uses the
// live adapter in ./ccspace.mjs; otherwise, or when the adapter fails with no
// saved copy, it serves the sample fixtures in ./fixtures, which the UI labels
// as sample data. The API key stays on this server and is never sent to the
// browser.
//
// Live responses are saved to ui/.network-cache/ and reused for
// NETWORK_CACHE_MINUTES (default 30), across restarts, because CC Space calls
// cost credits. A saved response keeps its original meta.asOf, so the UI shows
// how old it is. If a refresh fails, the last saved copy is served instead of
// sample data.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// NETWORK_FIXTURE_SET=live serves recorded live CC Space responses instead of
// the generic samples: real shapes and gaps, no key or credits needed.
const FIXTURES = path.join(HERE, process.env.NETWORK_FIXTURE_SET === "live" ? "fixtures-live" : "fixtures");
const CACHE = path.resolve(HERE, "..", "..", ".network-cache");
const TTL_MS = Number(process.env.NETWORK_CACHE_MINUTES ?? 30) * 60_000;

const fixture = (name) => JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));

let live = null;
if (process.env.CCSPACE_API_KEY) {
  try {
    live = await import("./ccspace.mjs");
  } catch (e) {
    console.warn(`[network] live adapter unavailable, serving fixtures: ${e.message}`);
  }
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

// Party ids are "hint::fingerprint"; keep the check loose but reject junk.
const PARTY = /^[\w.\-:]{3,512}$/;

const cacheFile = (key) => path.join(CACHE, `${key.replace(/[^\w.-]/g, "_")}.json`);

function readSaved(key) {
  try {
    const saved = JSON.parse(readFileSync(cacheFile(key), "utf8"));
    return { body: saved.body, savedAt: saved.savedAt };
  } catch {
    return null;
  }
}

function save(key, body) {
  try {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(cacheFile(key), JSON.stringify({ savedAt: Date.now(), body }));
  } catch (e) {
    console.warn(`[network] could not save ${key}: ${e.message}`);
  }
}

const inFlight = new Map();

async function serve(res, key, fixtureName, fromLive) {
  if (live && fromLive) {
    const saved = readSaved(key);
    if (saved && Date.now() - saved.savedAt < TTL_MS) return send(res, 200, saved.body);
    try {
      if (!inFlight.has(key)) {
        inFlight.set(
          key,
          fromLive().finally(() => inFlight.delete(key)),
        );
      }
      const body = await inFlight.get(key);
      save(key, body);
      return send(res, 200, body);
    } catch (e) {
      console.warn(`[network] ${key}: live fetch failed: ${e.message}`);
      if (saved) return send(res, 200, saved.body);
    }
  }
  send(res, 200, fixture(fixtureName));
}

/** Handles /api/network/*. Returns true when the request was handled. */
export async function handleNetwork(req, res) {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith("/api/network/")) return false;
  if (req.method !== "GET") return send(res, 405, { error: "GET only" }), true;

  const route = url.pathname.slice("/api/network/".length);
  if (route === "overview") await serve(res, "overview", "overview", live?.overview);
  else if (route === "validators") await serve(res, "validators", "validators", live?.validators);
  else if (route === "apps") await serve(res, "apps", "apps", live?.apps);
  else if (route === "liquidity") await serve(res, "liquidity", "liquidity", live?.liquidity);
  else if (route.startsWith("party/")) {
    const party = decodeURIComponent(route.slice("party/".length));
    if (!PARTY.test(party)) return send(res, 400, { error: "Not a valid party id" }), true;
    await serve(res, `party-${party}`, "party", live?.party && (() => live.party(party)));
  } else send(res, 404, { error: "Unknown network route" });
  return true;
}
