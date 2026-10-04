#!/usr/bin/env node
// Downloads the DARs built by the "Daml build and test" GitHub Actions
// workflow for the current branch (latest successful run) into .ci-dars/.
// Used on machines that cannot build the test package locally.
//
//   node scripts/fetch-dars.mjs

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".ci-dars");
export const CI_DARS = {
  main: path.join(OUT, "main", ".daml", "dist", "ledgerline-0.1.0.dar"),
  test: path.join(OUT, "test", ".daml", "dist", "ledgerline-test-0.1.0.dar"),
};

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

// The DARs depend only on the Daml sources, so use the CI run for the last
// commit that changed them, whichever branch it ran on.
export function fetchDars() {
  const damlSha = sh("git", ["log", "-1", "--format=%H", "--", "main", "test", "multi-package.yaml"]);
  const id = sh("gh", [
    "run", "list", "--workflow", "daml.yml", "--commit", damlSha,
    "--status", "success", "--limit", "1", "--json", "databaseId", "--jq", ".[0].databaseId",
  ]);
  if (!id) throw new Error(`No successful Daml CI run for commit ${damlSha.slice(0, 7)}, the last one that changed Daml. Push it and wait for CI.`);
  const sha = sh("gh", ["run", "view", id, "--json", "headSha", "--jq", ".headSha"]);
  rmSync(OUT, { recursive: true, force: true });
  sh("gh", ["run", "download", id, "--name", "dars", "--dir", OUT]);
  for (const dar of Object.values(CI_DARS)) if (!existsSync(dar)) throw new Error(`Artifact is missing ${dar}`);
  return { id, sha, stale: sha !== damlSha };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("fetch-dars.mjs")) {
  try {
    const { id, sha, stale } = fetchDars();
    console.log(`Downloaded DARs from CI run ${id} (commit ${sha.slice(0, 7)}) into .ci-dars/`);
    if (stale) console.log("Note: that run is for a different commit than your checkout. Push and wait for CI to get your latest Daml.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
