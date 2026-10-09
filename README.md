# Ledgerline

**Decisions from Canton data. Every party sees only its own truth.**

HackCanton Season 3 entry, **Data, Analytics & Ecosystem Dashboards** track.

Ledgerline is a decision layer on top of Canton data, in two parts:

- **Network layer (public, live mainnet data).** A ranked queue of validators that need attention, a scorecard for each super validator's sponsored validators, app monitoring, liquidity views and a portfolio lookup for any party. It combines four public sources and credits each one on the page.
- **Private-markets layer (our Daml contracts).** Fund flows, an investor's portfolio across several managers, and network statistics (median TVPI, days to pay a capital call, share paid on time) that are published only when at least 3 funds and 5 investors contribute. Each number is computed on the node of the party allowed to see it.

The two layers serve one story. The public layer is free and useful every day to validator operators and super validators. The private layer is what institutions pay for: fund administrators, managers and investors who need analytics and benchmarks without exposing their positions.

> **Live demo:** _hosted link to be added before submission._

---

## A five-minute tour

The **Network** pages need no sign-in.

1. **Validators.** Start with **Needs attention**: validators that went offline recently, then live validators running an old release, most fixable first. Validators silent for over 30 days are counted as retired, not as incidents. Then open the **Sponsor scorecard**. On Oct 8, 2026, every live validator onboarded by the Global Synchronizer Foundation and Digital Asset (14 validators) ran 0.6.x, two releases behind the network's 0.8.3. Select a sponsor to list its validators.
2. **Liquidity.** CC market price since listing, circulating supply, on-ledger transfers next to exchange volume, and the OneSwap pools.
3. **Portfolio lookup.** Paste any party ID to see its public CC holdings, valued in USD, and its recent activity.

Then select **View as a party**. These are demo identities with no passwords: the funds and investors are fictional, but the privacy is enforced by the server and the ledger (see [Demo mode](#demo-mode)).

4. **Harbor Pension Plan** (investor). One portfolio across two funds from two managers, assembled on Harbor's own node. Pay the outstanding **RW-II CC-3** capital call: cash and the capital account move in one transaction.
5. **Start your own fund** (top of the identity picker). Name a fund, invite an investor, then switch to that investor to accept. Everything is an ordinary command on the ledger.
6. **Fund administrator.** Publish this quarter's network statistics. The contract refuses to publish if fewer than 3 funds or 5 investors contribute.
7. **Ecosystem viewer.** The published statistics, and nothing else: no fund, investor or position.
8. **Judge** (demo only). Every party side by side, plus **Who holds what**, a count of each contract type on each party's node. An empty cell means that party's node never received the data.

---

## Network layer

| Page | Sources | What it answers |
|---|---|---|
| Overview | CC Space | Is the network healthy: rounds, validators live, featured apps, transfers |
| Validators | CC Space, 5N Lighthouse | Who needs attention first; how each sponsor's validators are doing; who runs an old release |
| App monitoring | CC Space | Which featured apps are growing and what they earn |
| Liquidity | CC Space, CoinGecko, OneSwap | CC price, supply, on-ledger and exchange volume, trading pools |
| Portfolio lookup | CC Space, CoinGecko | A party's public CC holdings with a USD value, and recent activity |

**Rules every page follows.** A value no source provides is shown as "—" and is never estimated. Each page shows its sources and when the data was fetched. Sample data is labelled "Sample data".

**How it's served.** The gateway (`ui/scripts/network/`) calls the sources from the server, so API keys never reach the browser. It caches each response on disk for 30 minutes, because CC Space bills per request. If one source fails, pages still load and say what is missing. The response shapes are defined in `ui/src/network/types.ts`; field-level notes are in [`docs/data-sources.md`](docs/data-sources.md).

**Sources:**

- [CC Space](https://cc.itrocket.space): validators, liveness, sponsors, featured apps, transfers, party balances. Needs a paid API key.
- [5N Lighthouse](https://lighthouse.cantonloop.com): validator versions and last-active times. Needs a free API key.
- [CoinGecko](https://www.coingecko.com/en/coins/canton-network): CC market price, market cap and exchange volume. No key needed. Data by CoinGecko.
- [OneSwap](https://oneswap.cc): trading pools, through its anonymous read API.

**What no public source has yet:** validator uptime history and pool TVL. Both show as "—".

---

## Private-markets layer

### Who sees what

| Contract | GP | Administrator | That LP | Other LPs | Auditor | Ecosystem viewer |
|---|---|---|---|---|---|---|
| `Fund` | ✓ | ✓ | | | | |
| `CommitmentOffer`, `Commitment` (capital account + side-letter terms) | ✓ | ✓ | ✓ | | | |
| `CapitalCallNotice`, contribution and distribution receipts | ✓ | ✓ | ✓ | | | |
| `NavStatement` (fund NAV) | ✓ | ✓ | | | | |
| `LpStatement` (NAV share, TVPI, DPI) | ✓ | ✓ | ✓ | | | |
| `MfnAttestation` (verdict only) | ✓ | ✓ | ✓ | | | |
| `AuditView` (snapshot) | | ✓ | | | ✓ | |
| `FundStatistics` (aggregates only) | | ✓ | | | | ✓ |

With several funds, each manager sees only its own fund. An investor's node is the only place its positions across managers meet, so the portfolio view is computed there. No aggregator ever holds the whole book. `test/daml/Test/MultiFund.daml` asserts this.

Choices that read several investors' data (`IssueCapitalCall`, `PublishNav`, `AttestMfn`, `PublishStatistics`) are **nonconsuming and controlled by a single party**, so only that party is an informee of the exercise. Each investor is an informee only of the contracts created for it, plus the fetch of its own commitment.

### Workflows

1. The GP creates a `Fund`; the administrator creates an `AdminDesk`, consenting to the role.
2. GP `OfferCommitment` → investor `AcceptCommitment` (or declines) → `Commitment`.
3. GP `IssueCapitalCall` → one pro-rata `CapitalCallNotice` per investor.
4. Investor `PayCall`: cash moves to the GP and the capital account updates in **one transaction**.
5. GP `Distribute` on a commitment: cash goes to the investor and `distributed` updates.
6. Administrator `PublishNav`: the fund NAV plus every `LpStatement`, in one transaction.
7. Administrator `AttestMfn`: checks that an investor's terms are at least as good as any investor with an equal or smaller commitment, without revealing those terms.
8. GP grants audit access → administrator `DiscloseToAuditor`, refused after `validUntil`.
9. Administrator `PublishStatistics` across every fund it runs. The contract enforces the 3-fund, 5-investor minimum.

### The demo ledger

`test/daml/Demo/Setup.daml` seeds three funds from three managers, five investors and four quarters of history (Q4 2025 to Q3 2026), with statistics published each quarter. RW-II CC-3 is left outstanding so there is something to pay. Cash is a test-only settlement token.

---

## Run it yourself

**Network pages only.** Needs Node 22+; no Daml SDK or API key.

```bash
cd ui
npm install
npm run dev
```

Open http://localhost:5173. Without keys, the network pages serve generic sample data, labelled as such. To see real recorded mainnet responses instead, start with `NETWORK_FIXTURE_SET=live`. For live data, create `ui/.env.local` (it is gitignored):

```
CCSPACE_API_KEY=...
LIGHTHOUSE_API_KEY=...
```

CoinGecko needs no key.

**Everything, including the Canton ledger.** Needs Node 22+, Java 17+ and Daml SDK 3.4.10 (`dpm`). From the repository root:

```bash
node scripts/demo.mjs
```

This builds the DARs, starts a fresh Canton sandbox, seeds the demo and serves http://localhost:5173. Ctrl+C stops everything. Run it again for a clean ledger. Options:

- `--no-build` skips the build.
- `--ci-dars` uses the DARs built by GitHub Actions instead of building locally (needs `gh`).

Sandbox output goes to `log/sandbox.out`.

**Tests.**

```bash
dpm build --all
cd test && dpm test
```

There are four Daml Script tests: the full fund lifecycle with its visibility rules, privacy across funds, exact statistics figures, and the publication threshold. They also run in GitHub Actions on every push that changes the contracts (`.github/workflows/daml.yml`). The network adapter has its own tests:

```bash
node --test ui/scripts/network/ccspace.test.mjs
```

---

## Demo mode

The private views use passwordless demo identities so you can compare what each party sees. Switching identity is not a way around privacy:

- Each session is bound to one party. The server (`ui/scripts/auth.mjs`) refuses any read or command for another party with HTTP 403.
- Contracts a party is not entitled to never reach its node. The UI hides nothing; it shows what the ledger returns.
- The **Judge** account, which sees every party, exists only in the demo.

In production each organisation signs in with its own Canton wallet and runs on its own node, so there is nothing to switch to.

---

## Limits and what's next

- **Trust in the administrator.** Investors state their own payment dates, and the administrator chooses which records feed the statistics. The contract checks dates against the call and today, but a production version would take dates from the settlement rail and require every active record of a fund.
- **Cash** is a test token. For a pilot, swap it for a CIP-56 holding such as a stablecoin.
- **NAV** is an input signed by the administrator, not computed. There are no fee or carry waterfalls, and no IRR yet.
- **An `AuditView` is a snapshot.** Withdrawing it stops further visibility, but the auditor's node has already seen the data. Canton explicit disclosure is the production alternative.
- **Not built yet:** hosting on the hackathon DevNet, wallet sign-in, recording our own liveness samples for uptime history, sponsor reports and exports, and an AI assistant over a party's own data.

---

## How it was built

- **Contracts:** Daml (SDK 3.4.10) on Canton, through the JSON Ledger API v2.
- **Dashboard:** React 19, TypeScript and Recharts, bundled with `esbuild-wasm`, plus a small Node server (`ui/scripts/dev.mjs`) for the ledger proxy, sign-in and the network gateway.

**AI coding agents.** Ledgerline was built with AI coding agents.
- Claude Code acted as integrator: architecture, the contracts, the private-markets UI, reviews and merges.
- Codex and Grok Build took work packages from [`docs/tasks/`](docs/tasks), against the data contract in `ui/src/network/types.ts`.
- [`AGENTS.md`](AGENTS.md) holds the rules every agent followed, and [`docs/PLAN.md`](docs/PLAN.md) the plan.
- Every change was reviewed and tested before merging.

**Notes for Windows.** Windows Application Control on the main development machine blocks unsigned native binaries. That is why the UI uses `esbuild-wasm` instead of Vite. It is also why `scripts/demo.mjs` can fall back to CI-built DARs (`--ci-dars`), and to launching the SDK's sandbox and script runner with `java -jar` when `dpm` itself is blocked. None of this changes anything on other machines.

## Layout

```
main/daml/            Daml contracts (Fund, Reporting, Cash)
test/daml/            Daml Script tests and the demo seed (Demo/Setup.daml)
scripts/demo.mjs      one command: build, start the sandbox, seed, serve the UI
ui/scripts/           dev server, sign-in and access policy, self-serve onboarding
ui/scripts/network/   network gateway, source adapters, fixtures, tests
ui/src/network/       network pages and the data contract (types.ts)
ui/src/private/       private-markets pages and self-serve flows
docs/                 plan, data-source notes, agent task files
```
