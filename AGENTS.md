# Instructions for AI coding agents

You are one of several agents building Ledgerline for HackCanton Season 3 (Data, Analytics & Ecosystem Dashboards track). **Submission deadline: 2026-10-09 23:59 UTC.** Read this file, then `docs/PLAN.md`, then your own task file in `docs/tasks/`.

## What Ledgerline is

A data and analytics product for Canton Network with two layers:

- **Network layer** (public network data): validator analytics, app monitoring, liquidity views, portfolio lookup. Pages in `ui/src/network/pages/`, data served by the gateway in `ui/scripts/network/`.
- **Private-markets layer** (our own Daml contracts): fund flows, LP portfolios and privacy-preserving statistics, where each party's node holds only what it may see.

## Repository layout

```
main/daml/            Daml contracts (Fund, Reporting, Cash)
test/daml/            Daml Script tests + demo seed (Demo/Setup.daml)
scripts/demo.mjs      one command: build, start sandbox, seed, serve UI
ui/scripts/dev.mjs    dev server (esbuild-wasm) + ledger proxy
ui/scripts/auth.mjs   sign-in, per-party access policy
ui/scripts/network/   network data gateway (/api/network/*), fixtures, live adapter
ui/src/network/       types.ts (CONTRACT), api.ts, NetworkSection.tsx, pages/
ui/src/charts.tsx     shared chart components (Recharts)
ui/src/private/       private-markets ecosystem pages
docs/                 plan and task files
```

## Hard rules

1. **No native binaries.** Windows Application Control on the main dev machine blocks unsigned native Node addons. Never add a dependency that ships a `.node` file or a platform binary: no Vite, rolldown, native esbuild, SWC, sharp, sqlite, Puppeteer, etc. The bundler is `esbuild-wasm`. After any `npm install`, run `find ui/node_modules -name "*.node"` and confirm nothing new appears. Pure-JavaScript libraries are fine.
2. **Stay inside your files.** Your task file lists the files you own. Do not edit anything else. These are integrator-owned and change only through the integrator: `ui/src/network/types.ts`, `ui/src/network/api.ts`, `ui/src/network/NetworkSection.tsx`, `ui/src/charts.tsx`, `ui/src/App.tsx`, `ui/src/store.tsx`, `ui/src/styles.css`, `ui/scripts/*.mjs`, `ui/scripts/network/index.mjs`, `scripts/demo.mjs`, `AGENTS.md`, `docs/PLAN.md`. If you need a change there, describe it in your pull request under "Contract change requests".
3. **One branch per task**, named in your task file. Never push to `main`. Open a pull request when done.
4. **Never fabricate data.** A value the source does not provide is `null` and shows as "—". Sample data must carry `meta.source: "fixture"` so the UI labels it "Sample data".
5. **Secrets stay on the server.** API keys live only in `ui/.env.local` (gitignored). Never commit, log or send a key to the browser.
6. **Styling:** use CSS custom properties from `ui/src/styles.css` (`var(--text)`, `var(--muted)`, `var(--border)`, `var(--chart-1)`…). No hex colours in components. Put your page CSS in your own file (named in your task) and import it from your page. Use `.panel`, `.grid-2`, `.table`, `.stats`, `.badge` and the components in `ui/src/components.tsx` and `ui/src/charts.tsx` before inventing new ones. Every page must work in light and dark mode and at 375px width with no horizontal page scroll.
7. **Charts** come from `ui/src/charts.tsx` (`TimeSeriesChart`, `BarSeriesChart`, `Sparkline`, `SourceBadge`). Every page uses the `NetworkPage` frame and `LoadState` from `NetworkSection.tsx`.

## Running it

UI only, against sample data (no Daml SDK needed):

```bash
cd ui && npm install && npm run dev
```

Open http://localhost:5173. The Network section is public (no sign-in) and works without a ledger. Private views use passwordless demo identities ("View as a party"). Set `NETWORK_FIXTURE_SET=live` to serve recorded live CC Space responses from `ui/scripts/network/fixtures-live/` instead of the generic samples.

Everything, including the Canton sandbox (needs Daml SDK 3.4.10 via `dpm` and Java 17+):

```bash
node scripts/demo.mjs
```

Daml builds and tests also run in GitHub Actions (`.github/workflows/daml.yml`) on every push that touches `main/` or `test/`. On the Windows dev machine the test package cannot build locally (Smart App Control blocks an SDK helper), so `demo.mjs` falls back to the CI-built DARs automatically; `node scripts/demo.mjs --ci-dars` forces that. Push your Daml changes and wait for CI before running the demo.

## Before you open a pull request

- `cd ui && npx tsc --noEmit` passes.
- `cd ui && npm run build` passes.
- Your pages render with sample data and with the loading and error states (stop the server to see the error state).
- Checked in light and dark mode and at 375px width.
- No new `.node` files under `ui/node_modules`.
- The PR description lists what you built, screenshots, anything left undone, and contract change requests.
