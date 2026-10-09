// Self-serve demo: a visitor starts their own fund. The server allocates a
// new manager party and creates the fund as that party. It then plays the
// existing administrator (accepting the mandate) and the demo bank (funding
// the manager's cash account), as those organisations would in production.
// After that, everything the visitor does goes through the same per-party
// policy as every other session.
import { randomBytes } from "node:crypto";

const PACKAGE = "#ledgerline";

const hintOf = (party) => party.split("::")[0].replace(/-[0-9a-f]+$/, "");

async function partyByHint(ledger, hint) {
  const { partyDetails = [] } = JSON.parse((await ledger.get("/v2/parties")).toString());
  return partyDetails.map((p) => p.party).find((p) => hintOf(p) === hint);
}

async function submit(ledger, actAs, command) {
  const res = await ledger.post("/v2/commands/submit-and-wait", {
    commands: [command],
    commandId: randomBytes(12).toString("hex"),
    userId: "ledgerline-onboarding",
    actAs: [actAs],
  });
  if (res.status !== 200) throw new Error(`Ledger refused the command (${res.status}): ${res.body.slice(0, 200)}`);
}

const create = (template, createArguments) => ({
  CreateCommand: { templateId: `${PACKAGE}:${template}`, createArguments },
});

/** "Acme Growth Fund" -> "AGF-417": initials plus a short random suffix, so ids never collide. */
function fundIdFor(name) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4) || "FND";
  return `${initials}-${100 + Math.floor(Math.random() * 900)}`;
}

/**
 * Creates a manager party and a fund. Returns the demo user to start a
 * session for: role "GP" bound to the new party.
 */
export async function startFund(ledger, rawName) {
  const name = String(rawName ?? "").trim().replace(/\s+/g, " ");
  if (!/^[\p{L}\p{N} .&'-]{3,60}$/u.test(name)) {
    throw Object.assign(new Error("Fund name: 3 to 60 letters, numbers, spaces or . & ' -"), { status: 400 });
  }
  const administrator = await partyByHint(ledger, "Administrator");
  const bank = await partyByHint(ledger, "Bank");
  if (!administrator || !bank) throw new Error("The demo ledger is not seeded yet");

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24).replace(/^-+|-+$/g, "") || "fund";
  const hint = `Manager-${slug}-${randomBytes(3).toString("hex")}`;
  const allocated = await ledger.post("/v2/parties", { partyIdHint: hint, identityProviderId: "" });
  if (allocated.status !== 200) throw new Error(`Could not allocate a manager party (${allocated.status})`);
  const gp = JSON.parse(allocated.body).partyDetails.party;

  const fundId = fundIdFor(name);
  await submit(ledger, gp, create("Fund:Fund", {
    gp,
    administrator,
    cashIssuer: bank,
    fundId,
    name,
    vintage: String(new Date().getUTCFullYear()),
  }));
  // The administrator accepts the mandate for the new fund.
  await submit(ledger, administrator, create("Reporting:AdminDesk", { administrator, gp, fundId }));
  // The demo bank opens the manager's cash account, for distributions.
  await submit(ledger, bank, create("Cash:Cash", { issuer: bank, owner: gp, amount: "1000000.0" }));

  return {
    username: `manager-${slug}-${randomBytes(2).toString("hex")}`,
    role: "GP",
    name: `${name} (manager)`,
    party: gp,
    fundId,
  };
}
