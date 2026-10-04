// Sessions and ledger access policy. Each signed-in user is bound to one
// Canton party, and every JSON Ledger API call is checked against it here,
// so the browser cannot read or act as any other party. The "Judge" account
// is the exception: it sees every party side by side for the demo.
//
// Demo identities need no password: choosing one starts a session bound to
// that party. The privacy rules below are what matter, and they are enforced
// on every request. A production deployment would sign in through a Canton
// wallet instead.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const config = JSON.parse(readFileSync(path.resolve("demo-users.json"), "utf8"));
const users = new Map(config.users.map((u) => [u.username, u]));
const sessions = new Map(); // token -> user
const COOKIE = "ll_session";

function sessionOf(req) {
  const cookie = req.headers.cookie ?? "";
  const token = cookie.split(";").map((c) => c.trim().split("=")).find(([k]) => k === COOKIE)?.[1];
  return token ? sessions.get(token) : undefined;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

/** Handles /api/*. Returns true when the request was handled. */
export async function handleApi(req, res) {
  if (req.url === "/api/login" && req.method === "POST") {
    let body = {};
    try {
      body = JSON.parse((await readBody(req)).toString() || "{}");
    } catch {
      return json(res, 400, { error: "Bad request" }), true;
    }
    const user = users.get(String(body.username ?? "").trim().toLowerCase());
    if (!user) return json(res, 401, { error: "Unknown demo identity" }), true;
    const token = randomBytes(24).toString("hex");
    sessions.set(token, user);
    json(res, 200, publicUser(user), {
      "set-cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`,
    });
    return true;
  }
  if (req.url === "/api/logout" && req.method === "POST") {
    const token = (req.headers.cookie ?? "").match(new RegExp(`${COOKIE}=([0-9a-f]+)`))?.[1];
    if (token) sessions.delete(token);
    json(res, 200, {}, { "set-cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    return true;
  }
  if (req.url === "/api/identities") {
    json(res, 200, config.users.map((u) => ({ ...publicUser(u), description: u.description ?? "" })));
    return true;
  }
  if (req.url === "/api/me") {
    const user = sessionOf(req);
    user ? json(res, 200, publicUser(user)) : json(res, 401, { error: "Not signed in" });
    return true;
  }
  return false;
}

const publicUser = (u) => ({ username: u.username, role: u.role, name: u.name });

// Party ids carry the hint the setup script allocated them with ("LP_A-1df4…::1220…").
async function partyFor(role, ledgerFetch) {
  const res = await ledgerFetch("/v2/parties");
  const { partyDetails = [] } = JSON.parse(res.toString());
  return partyDetails.map((p) => p.party).find((p) => p.split("::")[0].replace(/-[0-9a-f]+$/, "") === role);
}

/**
 * Decides whether a /v2 request may reach the ledger. Returns
 * { ok: true, body } to forward (body = the buffered request body), or
 * { ok: false, status, error } to refuse.
 */
export async function authorizeLedger(req, ledgerFetch) {
  const user = sessionOf(req);
  if (!user) return { ok: false, status: 401, error: "Sign in first" };
  const body = await readBody(req);
  if (user.role === "Judge") return { ok: true, body };

  const route = new URL(req.url, "http://x").pathname;
  if (req.method === "GET" && (route === "/v2/parties" || route === "/v2/state/ledger-end")) {
    return { ok: true, body };
  }

  const party = await partyFor(user.role, ledgerFetch);
  if (!party) return { ok: false, status: 503, error: `No ledger party for ${user.role} yet` };
  let payload;
  try {
    payload = JSON.parse(body.toString());
  } catch {
    return { ok: false, status: 400, error: "Bad request" };
  }

  if (route === "/v2/state/active-contracts") {
    const asked = Object.keys(payload?.filter?.filtersByParty ?? {});
    const anyParty = payload?.filter?.filtersForAnyParty;
    if (anyParty || asked.length === 0 || asked.some((p) => p !== party)) {
      return { ok: false, status: 403, error: "You can only read your own party's contracts" };
    }
    return { ok: true, body };
  }

  if (route === "/v2/commands/submit-and-wait") {
    if (user.role === "Ecosystem") return { ok: false, status: 403, error: "Read-only account" };
    const actAs = payload?.actAs ?? [];
    const readAs = payload?.readAs ?? [];
    if (actAs.length !== 1 || actAs[0] !== party || readAs.some((p) => p !== party)) {
      return { ok: false, status: 403, error: "You can only act as your own party" };
    }
    return { ok: true, body };
  }

  return { ok: false, status: 403, error: "Not available to this account" };
}
