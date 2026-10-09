// CONTRACT between the network data gateway (ui/scripts/network/) and the
// network pages (ui/src/network/pages/). Both sides build against this file.
// Change it only through the integrator; see docs/PLAN.md.
//
// Conventions
// - Every response carries `meta`. `source: "fixture"` means sample data and
//   the UI must label it as such.
// - Amounts in Canton Coin are plain numbers in CC; USD values end in `Usd`.
// - Timestamps are ISO 8601 strings in UTC. Daily series use the date
//   ("2026-10-03"); per-round series use the round's close time.
// - A metric the source cannot provide is `null`, never 0 or a made-up value.

export type Meta = {
  source: "ccspace" | "fixture" | "ledger";
  network: "mainnet" | "testnet" | "devnet" | "local";
  /** When the underlying data was fetched. */
  asOf: string;
  note?: string;
  /** Every public source that contributed, for attribution, e.g. ["CC Space", "CoinGecko"]. */
  sources?: string[];
};

export type Point = { t: string; v: number };

// GET /api/network/overview
export type NetworkOverview = {
  meta: Meta;
  latestRound: number | null;
  validators: { total: number; active: number };
  featuredApps: number;
  ccPriceUsd: number | null;
  ccSupply: number | null;
  transfers24h: number | null;
  series: {
    transfersDaily: Point[];
    activeValidatorsDaily: Point[];
  };
};

// GET /api/network/validators
export type Validator = {
  id: string;
  name: string;
  party: string | null;
  /** Super validator or operator that onboarded it, when known. */
  sponsor: string | null;
  version: string | null;
  active: boolean;
  lastActiveAt: string | null;
  /** Share of rounds in the last 30 days with liveness activity, 0..1. */
  uptime30d: number | null;
  rewards30dCC: number | null;
};

export type ValidatorsReport = {
  meta: Meta;
  validators: Validator[];
  /** Version the network currently runs, when known. */
  networkVersion?: string | null;
  series: {
    activeDaily: Point[];
    rewardsPerRoundCC: Point[];
  };
};

// GET /api/network/apps
export type App = {
  id: string;
  name: string;
  provider: string;
  party: string | null;
  featured: boolean;
  /** Activity markers or transactions attributed to the app, last 30 days. */
  activity30d: number | null;
  rewards30dCC: number | null;
  activityDaily: Point[];
  url: string | null;
};

export type AppsReport = { meta: Meta; apps: App[] };

// GET /api/network/liquidity
export type Pool = {
  id: string;
  venue: string;
  pair: string;
  tvlUsd: number | null;
  volume24hUsd: number | null;
};

export type LiquidityReport = {
  meta: Meta;
  cc: {
    priceUsd: Point[];
    supply: Point[];
    transferVolumeDailyCC: Point[];
    /** Daily market price since listing (up to a year). */
    priceHistoryUsd?: Point[];
    /** Daily exchange trading volume, last 30 days. */
    marketVolumeDailyUsd?: Point[];
  };
  pools: Pool[];
};

// GET /api/network/party/:partyId
export type Holding = {
  instrument: string;
  /** Instrument admin / issuer party, when known. */
  admin: string | null;
  amount: number;
  valueUsd: number | null;
};

export type Operation = {
  id: string;
  at: string;
  type: string;
  direction: "in" | "out" | "other";
  counterparty: string | null;
  instrument: string | null;
  amount: number | null;
};

export type PartyPortfolio = {
  meta: Meta;
  party: string;
  holdings: Holding[];
  recent: Operation[];
};

/** Error body for any /api/network route. */
export type NetworkError = { error: string };
