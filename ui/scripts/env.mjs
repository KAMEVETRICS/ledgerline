// Loads ui/.env.local (gitignored) into process.env before anything reads it.
// One KEY=value per line; # starts a comment. Existing env vars win.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const file = path.resolve(".env.local");
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
