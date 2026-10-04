#!/usr/bin/env node
// One-command demo: build the DARs, start a Canton sandbox, seed both funds,
// and serve the dashboard. Everything runs as children of this process, so
// Ctrl+C stops it all.
//
//   node scripts/demo.mjs            fresh ledger (or reuse one already running)
//   node scripts/demo.mjs --no-build skip `dpm build --all`
//   node scripts/demo.mjs --ci-dars  use DARs built by GitHub Actions (scripts/fetch-dars.mjs)


import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { existsSync, mkdirSync, createWriteStream, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CI_DARS, fetchDars } from "./fetch-dars.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UI = path.join(ROOT, "ui");
const JSON_API = "http://localhost:7575";
const LEDGER_PORT = 6865;
const UI_URL = "http://localhost:5173";
const isWindows = process.platform === "win32";
const args = new Set(process.argv.slice(2));
let dars = {
  main: "main/.daml/dist/ledgerline-0.1.0.dar",
  test: "test/.daml/dist/ledgerline-test-0.1.0.dar",
};

const children = [];
const log = (msg) => console.log(`\x1b[36m[demo]\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\x1b[31m[demo]\x1b[0m ${msg}`);
  shutdown(1);
};

// dpm is installed as dpm.cmd on Windows, which needs a shell to launch.
function findDpm() {
  const fromAppData = process.env.APPDATA && path.join(process.env.APPDATA, "dpm", "bin", "dpm.cmd");
  if (isWindows && fromAppData && existsSync(fromAppData)) return fromAppData;
  return "dpm";
}
const DPM = findDpm();

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: isWindows, ...opts });
  return r.status === 0;
}

function capture(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8", shell: isWindows });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function start(name, cmd, cmdArgs, opts = {}) {
  const child = spawn(cmd, cmdArgs, { cwd: ROOT, shell: isWindows, ...opts });
  children.push({ name, child });
  child.on("exit", (code) => {
    if (!shuttingDown) fail(`${name} exited unexpectedly (code ${code}).`);
  });
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children.reverse()) {
    if (child.exitCode !== null) continue;
    // A shell-launched dpm leaves Java grandchildren; kill the whole tree.
    if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    log("Stopping…");
    shutdown(0);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonApi(pathname) {
  try {
    const res = await fetch(`${JSON_API}${pathname}`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const seeded = async () =>
  ((await jsonApi("/v2/parties"))?.partyDetails ?? []).some((p) => p.party.startsWith("GP-"));

async function startSandbox() {
  mkdirSync(path.join(ROOT, "log"), { recursive: true });
  const out = createWriteStream(path.join(ROOT, "log", "sandbox.out"));
  const sandbox = start("Canton sandbox", DPM, [
    "sandbox",
    "--dar", dars.main,
    "--json-api-port", "7575",
    "--canton-port-file", ".sandbox-ports.json",
  ]);
  sandbox.stdout.pipe(out);
  sandbox.stderr.pipe(out);

  log("Starting Canton sandbox (log: log/sandbox.out)…");
  for (let i = 0; i < 180; i++) {
    if (await jsonApi("/v2/state/ledger-end")) return;
    await sleep(1000);
  }
  fail("Sandbox did not come up within 3 minutes. See log/sandbox.out.");
}

// The JSON API answers before the participant has joined its synchronizer,
// and party allocation fails until it has. Retry only on that error.
async function seed() {
  log("Seeding four quarters of history: three funds, three managers, five LPs…");
  const unit = path.join(ROOT, "log", "unit.json"); // Demo.Setup:setup takes ()
  writeFileSync(unit, "{}");
  for (let attempt = 1; attempt <= 20; attempt++) {
    const r = capture(DPM, [
      "script",
      "--input-file", unit,
      "--dar", dars.test,
      "--script-name", "Demo.Setup:setup",
      "--ledger-host", "localhost",
      "--ledger-port", String(LEDGER_PORT),
    ]);
    if (r.ok) return;
    if (!r.out.includes("PARTY_ALLOCATION_WITHOUT_CONNECTED_SYNCHRONIZER")) {
      console.error(r.out.split("\n").filter((l) => /error|exception|failed/i.test(l)).slice(0, 8).join("\n"));
      fail("Seeding failed.");
    }
    await sleep(3000);
  }
  fail("Sandbox never connected to its synchronizer.");
}

const portFree = (port) =>
  new Promise((resolve) => {
    const srv = net.createServer().once("error", () => resolve(false)).once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port);
  });

async function main() {
  if (!(await portFree(5173))) fail("Port 5173 is already in use, probably a dashboard left over from an earlier run. Stop it and try again.");

  const useCi = () => {
    log("Fetching DARs built by GitHub Actions…");
    try {
      const { id, stale } = fetchDars();
      log(`Using DARs from CI run ${id}${stale ? " (a different commit than your checkout)" : ""}.`);
      dars = CI_DARS;
    } catch (e) {
      fail(e.message);
    }
  };
  if (args.has("--ci-dars")) useCi();
  else if (!args.has("--no-build")) {
    log("Building DARs…");
    // On machines where Smart App Control blocks a Daml SDK helper, the test
    // package cannot build locally; fall back to the CI-built DARs.
    if (!run(DPM, ["build", "--all"])) {
      log("Local build failed; falling back to CI-built DARs.");
      useCi();
    }
  }

  if (await jsonApi("/v2/state/ledger-end")) {
    log("A ledger is already running on :7575, reusing it.");
    if (!(await seeded())) await seed();
  } else {
    await startSandbox();
    await seed();
  }

  if (!existsSync(path.join(UI, "node_modules"))) {
    log("Installing UI dependencies…");
    if (!run("npm", ["install"], { cwd: UI })) fail("npm install failed.");
  }

  const ui = start("Dashboard", process.execPath, ["scripts/dev.mjs"], { cwd: UI, shell: false, stdio: "inherit" });
  ui.on("spawn", () => log(`Ready: ${UI_URL}  (Ctrl+C stops the ledger and the UI)`));
}

main().catch((e) => fail(e.stack ?? String(e)));
