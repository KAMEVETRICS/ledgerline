# Ledgerline build plan, HackCanton Season 3

**Track:** Data, Analytics & Ecosystem Dashboards. **Submit by 2026-10-08** (hard deadline 2026-10-09 23:59 UTC, no extensions).

## The product in one line

Canton data for institutions: public network analytics (validators, apps, liquidity, portfolios) plus private-markets analytics where every number is computed on the party's own node and network statistics exist without anyone revealing their positions.

## How it maps to the track's expected output

| Track asks for | Where we deliver it |
|---|---|
| Dashboard using on-chain or ecosystem data | Network pages (live CC Space data) + private-markets pages (our Canton ledger) |
| Visualization of usage, flows, rewards, performance | Transfers and activity (usage), capital and CC flows, validator and app rewards, validator uptime and app health (performance) |
| Personas: validators, developers, partners, operators | Validator operators (Validators), app developers (App monitoring), institutional partners and allocators (Liquidity, Portfolio, private markets), ecosystem operators (Overview, private-markets statistics) |
| How the data supports ecosystem decisions | Each page states the decision it supports in its lead line and in the pitch |

## Architecture

```
browser ──► ui/scripts/dev.mjs
              ├─ /api/login, /api/me        auth.mjs (demo accounts, sessions)
              ├─ /v2/*  ──► Canton JSON Ledger API (sandbox :7575), scoped to the session's party
              └─ /api/network/* ──► network/index.mjs
                                     ├─ ccspace.mjs  (live, needs CCSPACE_API_KEY)   [WP-A]
                                     └─ fixtures/*.json (sample, labelled)
```

The page ↔ gateway contract is `ui/src/network/types.ts`. Pages build against fixtures now; the live adapter swaps in without page changes.

## Work packages

| WP | What | Agent | Branch | Owns |
|---|---|---|---|---|
| WP-0 | Sign-in, routing shell, contract, charts, fixtures | Claude (integrator) | main | done |
| WP-A | Live data adapter for CC Space | Codex | `wp-a-ccspace` | `ui/scripts/network/ccspace*.mjs`, `ui/scripts/network/__fixtures__/`, `ui/scripts/network/check-contract.mjs`, `docs/data-sources.md` |
| WP-B | Overview, Validators, App monitoring pages | Grok Build | `wp-b-network-pages` | `ui/src/network/pages/Overview.tsx`, `Validators.tsx`, `Apps.tsx`, `ui/src/network/pages/wpb/` |
| WP-C | Liquidity, Portfolio lookup pages | Codex (after WP-A) | `wp-c-liquidity-portfolio` | `ui/src/network/pages/Liquidity.tsx`, `Portfolio.tsx`, `ui/src/network/pages/wpc/` |
| WP-D | Private-markets statistics (Daml), quarterly history, ecosystem page, app health | Claude | `wp-d-private-markets` | `main/daml/`, `test/daml/`, `ui/src/private/`, `ui/src/panes.tsx` |
| WP-E | Brief, pitch deck, video script, README for judges | Claude + you | main | `README.md`, `docs/pitch/` |

## Schedule

| Date | Milestone |
|---|---|
| Oct 3 | WP-0 merged. Agents start WP-A, WP-B. API key into `ui/.env.local` |
| Oct 4 | WP-A first live endpoints. WP-B pages on sample data. WP-D starts |
| Oct 5 | WP-A done → WP-C starts. WP-B done. Integrator merges and checks live data |
| Oct 6 | WP-C, WP-D done. Feature freeze 23:59 UTC |
| Oct 7 | Fixes only. Brief, deck, video script. Record video |
| Oct 8 | Repo public, README for judges, link check in a private window, submit |

## Integration process

1. Agent opens a PR from its branch.
2. Integrator checks it against its task file's acceptance criteria, runs `tsc`, `npm run build`, the demo, light/dark and 375px.
3. Integrator merges, or comments with fixes. Contract changes are made by the integrator only.

## Running several agents locally

Each local agent works in its own git worktree, so they never touch each other's files:

```bash
git worktree add ../ledgerline-wp-b -b wp-b-network-pages
```

Then point the agent at `../ledgerline-wp-b` and run `npm install` in its `ui/`. Remove the worktree after merge with `git worktree remove ../ledgerline-wp-b`.
