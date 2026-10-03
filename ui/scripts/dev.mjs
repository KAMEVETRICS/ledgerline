// Dev server: esbuild-wasm (no native binaries, which Windows Application
// Control blocks on this machine) rebuilds on change; this server serves www/,
// pushes a reload event after each rebuild, and forwards /v2 to the Canton
// sandbox's JSON Ledger API, scoped to the signed-in user's party (auth.mjs).
import * as esbuild from "esbuild-wasm";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import "./env.mjs";
import { authorizeLedger, handleApi } from "./auth.mjs";
import { handleNetwork } from "./network/index.mjs";
import { buildOptions } from "./options.mjs";

const PORT = Number(process.env.PORT ?? 5173);
const LEDGER_PORT = Number(process.env.LEDGER_JSON_PORT ?? 7575);
const ROOT = path.resolve("www");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json" };

const listeners = new Set();
const reload = {
  name: "reload",
  setup(build) {
    build.onEnd(() => listeners.forEach((res) => res.write("event: change\ndata: {}\n\n")));
  },
};

const ctx = await esbuild.context({
  ...buildOptions,
  sourcemap: "inline",
  define: { "process.env.NODE_ENV": '"development"' },
  banner: { js: "new EventSource('/__reload').addEventListener('change', () => location.reload());" },
  plugins: [reload],
});
await ctx.watch();

function ledgerFetch(urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: "127.0.0.1", port: LEDGER_PORT, path: urlPath }, (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function proxyToLedger(req, res) {
  let decision;
  try {
    decision = await authorizeLedger(req, ledgerFetch);
  } catch (e) {
    decision = { ok: false, status: 502, error: `Ledger JSON API on port ${LEDGER_PORT} unavailable: ${e.message}` };
  }
  if (!decision.ok) {
    res.writeHead(decision.status, { "content-type": "application/json" });
    res.end(JSON.stringify({ cause: decision.error }));
    return;
  }
  const headers = { ...req.headers, "content-length": decision.body.length };
  delete headers.cookie; // the session never leaves this server
  const upstream = http.request(
    { hostname: "127.0.0.1", port: LEDGER_PORT, path: req.url, method: req.method, headers },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  upstream.on("error", (e) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`Ledger JSON API on port ${LEDGER_PORT} unavailable: ${e.message}`);
  });
  upstream.end(decision.body);
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}

http
  .createServer(async (req, res) => {
    if (req.url?.startsWith("/api/network/") && (await handleNetwork(req, res))) return;
    if (req.url?.startsWith("/api/") && (await handleApi(req, res))) return;
    if (req.url?.startsWith("/v2/")) return proxyToLedger(req, res);
    if (req.url === "/__reload") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      listeners.add(res);
      req.on("close", () => listeners.delete(res));
      return;
    }
    serveStatic(req, res);
  })
  .listen(PORT, () => console.log(`Ledgerline UI on http://localhost:${PORT} (ledger :${LEDGER_PORT})`));
