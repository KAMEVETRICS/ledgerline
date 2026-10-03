// Network data gateway: serves /api/network/* in the shapes defined by
// ui/src/network/types.ts. With CCSPACE_API_KEY set (ui/.env.local) it uses the
// live adapter in ./ccspace.mjs; otherwise, or when the adapter fails, it
// serves the sample fixtures in ./fixtures, which the UI labels as sample data.
// The API key stays on this server and is never sent to the browser.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
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

async function serve(res, name, fromLive) {
  if (live && fromLive) {
    try {
      return send(res, 200, await fromLive());
    } catch (e) {
      console.warn(`[network] ${name}: live fetch failed, serving fixture: ${e.message}`);
    }
  }
  send(res, 200, fixture(name));
}

/** Handles /api/network/*. Returns true when the request was handled. */
export async function handleNetwork(req, res) {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith("/api/network/")) return false;
  if (req.method !== "GET") return send(res, 405, { error: "GET only" }), true;

  const route = url.pathname.slice("/api/network/".length);
  if (route === "overview") await serve(res, "overview", live?.overview);
  else if (route === "validators") await serve(res, "validators", live?.validators);
  else if (route === "apps") await serve(res, "apps", live?.apps);
  else if (route === "liquidity") await serve(res, "liquidity", live?.liquidity);
  else if (route.startsWith("party/")) {
    const party = decodeURIComponent(route.slice("party/".length));
    if (!PARTY.test(party)) return send(res, 400, { error: "Not a valid party id" }), true;
    await serve(res, "party", live?.party && (() => live.party(party)));
  } else send(res, 404, { error: "Unknown network route" });
  return true;
}
