import type { Contract } from "./ledger";

export type Role = "GP" | "GP2" | "Administrator" | "LP_A" | "LP_B" | "LP_C" | "Auditor" | "Ecosystem";

export const ROLES: Role[] = ["GP", "GP2", "Administrator", "LP_A", "LP_B", "LP_C", "Auditor", "Ecosystem"];

export const ROLE_INFO: Record<Role, { name: string; kind: string; hue: string }> = {
  GP: { name: "Ledgerline Capital", kind: "General partner", hue: "var(--hue-gp)" },
  GP2: { name: "Ridgeway Partners", kind: "General partner", hue: "var(--hue-gp2)" },
  Administrator: { name: "Fund administrator", kind: "Administrator", hue: "var(--hue-admin)" },
  LP_A: { name: "Harbor Pension Plan", kind: "Limited partner", hue: "var(--hue-a)" },
  LP_B: { name: "Mesa Family Office", kind: "Limited partner", hue: "var(--hue-b)" },
  LP_C: { name: "Northfield Endowment", kind: "Limited partner", hue: "var(--hue-c)" },
  Auditor: { name: "Auditor", kind: "Auditor", hue: "var(--hue-auditor)" },
  Ecosystem: { name: "Ecosystem viewer", kind: "Network statistics", hue: "var(--hue-eco)" },
};

export const TEMPLATE_LABELS: Record<string, string> = {
  "Fund:Fund": "Fund",
  "Fund:Commitment": "Capital account",
  "Fund:CommitmentOffer": "Commitment offer",
  "Fund:CapitalCallNotice": "Capital call (unpaid)",
  "Fund:ContributionReceipt": "Contribution receipt",
  "Fund:DistributionReceipt": "Distribution receipt",
  "Reporting:AdminDesk": "Admin desk",
  "Reporting:NavStatement": "Fund NAV",
  "Reporting:LpStatement": "LP statement",
  "Reporting:MfnAttestation": "MFN attestation",
  "Reporting:AuditGrant": "Audit grant",
  "Reporting:AuditView": "Audit disclosure",
  "Cash:Cash": "Cash holding",
};

/** Party id -> role, from the hint the setup script allocated with. */
export function roleOf(party: string): Role | undefined {
  const hint = party.split("::")[0].replace(/-[0-9a-f]+$/, "");
  return (ROLES as string[]).includes(hint) ? (hint as Role) : undefined;
}

export type Terms = { managementFeeBps: string; carryBps: string; mostFavouredNation: boolean };

export type Fund = { gp: string; administrator: string; cashIssuer: string; fundId: string; name: string; vintage: string };
export type Commitment = {
  gp: string; lp: string; administrator: string; cashIssuer: string; fundId: string; fundName: string;
  committed: string; contributed: string; distributed: string; terms: Terms;
};
export type CallNotice = { gp: string; lp: string; fundId: string; callId: string; amount: string; dueDate: string; purpose: string };
export type ContributionReceipt = { gp: string; lp: string; fundId: string; callId: string; amount: string; paidAt: string };
export type DistributionReceipt = { gp: string; lp: string; fundId: string; distributionId: string; amount: string; paidAt: string };
export type Cash = { issuer: string; owner: string; amount: string };
export type AdminDesk = { administrator: string; gp: string; fundId: string };
export type NavStatement = { gp: string; fundId: string; asOf: string; nav: string; totalContributed: string; lpCount: string };
export type LpStatement = {
  gp: string; lp: string; fundId: string; fundName: string; asOf: string; committed: string; contributed: string;
  distributed: string; unfunded: string; navShare: string; tvpi: string | null; dpi: string | null;
};
export type MfnAttestation = { gp: string; lp: string; fundId: string; attestedAt: string; peersCompared: string; isMostFavoured: boolean };
export type AuditGrant = { gp: string; auditor: string; administrator: string; fundId: string; validUntil: string };
export type AuditView = {
  gp: string; lp: string; fundId: string; committed: string; contributed: string; distributed: string; terms: Terms;
  disclosedAt: string; validUntil: string;
};

export function of<T>(contracts: Contract[] | undefined, template: string): Contract<T>[] {
  return (contracts ?? []).filter((c) => c.template === template) as unknown as Contract<T>[];
}

export const num = (s: string | null | undefined) => (s == null ? 0 : parseFloat(s));

export function latestBy<T>(items: Contract<T>[], key: (p: T) => string): Contract<T> | undefined {
  return [...items].sort((a, b) => key(a.payload).localeCompare(key(b.payload))).at(-1);
}

/** Largest holding that covers `amount`; settlement needs a single holding. */
export function cashFor(holdings: Contract<Cash>[], amount: number): Contract<Cash> | undefined {
  return holdings
    .filter((h) => num(h.payload.amount) >= amount)
    .sort((a, b) => num(b.payload.amount) - num(a.payload.amount))[0];
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2,
});

export const money = (n: number) => usd.format(n);
export const moneyShort = (n: number) => usdCompact.format(n);
export const multiple = (s: string | null) => (s == null ? "—" : `${num(s).toFixed(2)}×`);
export const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
export const bps = (s: string) => `${(num(s) / 100).toFixed(2)}%`;

export function date(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const today = () => new Date().toISOString().slice(0, 10);
export const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

/** Stable LP ordering: contracts are recreated on every update, so ledger order shifts. */
export function byLp<T extends { lp: string }>(items: Contract<T>[]): Contract<T>[] {
  const rank = (p: string) => {
    const r = roleOf(p);
    return r ? ROLES.indexOf(r) : ROLES.length;
  };
  return [...items].sort((a, b) => rank(a.payload.lp) - rank(b.payload.lp));
}

export const isLp = (r: Role) => r === "LP_A" || r === "LP_B" || r === "LP_C";

export function partyName(party: string): string {
  const r = roleOf(party);
  return r ? ROLE_INFO[r].name : party.split("::")[0];
}

/** Fund colour derived from the fund id, so it matches across panes. */
const FUND_HUES = ["var(--fund-1)", "var(--fund-2)", "var(--fund-3)", "var(--fund-4)"];
export function fundHue(fundId: string): string {
  const sum = [...fundId].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return FUND_HUES[sum % FUND_HUES.length];
}
