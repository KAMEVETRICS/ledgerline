# WP-B: Network overview, validator analytics, app monitoring

**Agent:** Grok Build · **Branch:** `wp-b-network-pages` · **Due:** 2026-10-05 12:00 UTC

## Goal

Build three pages of the Network section that help specific people make decisions:

- **Overview:** an ecosystem operator sees the network's health at a glance.
- **Validators:** a validator operator or super validator sees who is reliable, who is falling behind and what validators earn.
- **App monitoring:** an app developer, or the committee deciding Featured App status, sees which apps are growing and what they earn.

You build against sample data now. Live data (WP-A) arrives in the same shapes later, with no page changes.

## Files you own

- `ui/src/network/pages/Overview.tsx` (replace the stub; keep `export function Overview`)
- `ui/src/network/pages/Validators.tsx` (replace the stub; keep `export function Validators`)
- `ui/src/network/pages/Apps.tsx` (replace the stub; keep `export function Apps`)
- `ui/src/network/pages/wpb/` (new folder: helpers, sub-components, and `wpb.css` for your styles)

Do not edit any other file. Read `AGENTS.md` first.

## Inputs

- Data contract: `ui/src/network/types.ts` (`NetworkOverview`, `ValidatorsReport`, `AppsReport`).
- Data hooks: `ui/src/network/api.ts`: `useLoad(fetchOverview)` etc.
- Page frame: `NetworkPage`, `LoadState` from `ui/src/network/NetworkSection.tsx`.
- Charts: `TimeSeriesChart`, `BarSeriesChart`, `Sparkline`, `compact`, `usdCompact` from `ui/src/charts.tsx`.
- UI pieces: `Stat`, `Badge`, `Empty` from `ui/src/components.tsx`; classes `.panel`, `.grid-2`, `.stats`, `.table`, `.badge`.
- Sample data: `ui/scripts/network/fixtures/overview.json`, `validators.json`, `apps.json`.
- Run: `cd ui && npm install && npm run dev`, open http://localhost:5173, sign in as `ecosystem` (password in `ui/demo-users.json`), click Network.

## Steps

1. Read `AGENTS.md`, the contract types and the existing stubs. Keep each stub's `useLoad` + `NetworkPage` + `LoadState` pattern.
2. Create `ui/src/network/pages/wpb/wpb.css` and import it from each of your pages (`import "./wpb/wpb.css";`). Tokens only, no hex colours.
3. **Overview** (`Overview.tsx`):
   - A row of stat tiles: latest round; validators active / total; featured apps; CC price (USD, 4 decimals); CC supply (compact); transfers in the last 24h. A `null` value shows "—".
   - Two charts side by side in `.grid-2` panels: transfers per day (`BarSeriesChart`), active validators per day (`TimeSeriesChart`).
   - Three link cards to Validators, App monitoring and Liquidity, each with one sentence on the decision that page supports. Navigate with `window.location.hash = "/network/validators"` etc.
4. **Validators** (`Validators.tsx`):
   - Stat tiles: active / total; median 30-day uptime (%); total rewards over 30 days (CC); validators needing attention (count, from below).
   - Charts: active validators per day (`TimeSeriesChart`); rewards per round (`BarSeriesChart`, label "CC per round").
   - "Needs attention" panel, listing validators that are inactive, or last active more than 24h ago, or below 95% uptime. Each row says why. If none, say "All validators healthy".
   - A full table: name, sponsor, version, status badge (active / inactive), uptime (number plus a thin bar), 30-day rewards (CC), last active (relative: "5 min ago", "3 days ago"). Sortable by clicking headers (uptime and rewards at minimum). A text filter on name or sponsor, and an active / inactive / all toggle.
   - A small "versions in use" breakdown: a count per `version`, highlighting validators not on the most common version.
5. **App monitoring** (`Apps.tsx`):
   - Stat tiles: apps tracked; featured apps; total activity over 30 days; total rewards over 30 days.
   - A table: name (+ "Featured" badge), provider, activity sparkline (`Sparkline` of `activityDaily`), 30-day activity, 30-day rewards (CC), rewards per 1,000 activity, 7-day trend (last 7 days vs the 7 before, as ±%, green or red). A featured-only toggle and sorting.
   - "Movers" panel: the top 3 apps by 7-day growth and the bottom 3.
   - Clicking a row opens a detail panel below the table with that app's `activityDaily` as a `TimeSeriesChart` (area), its party id with a copy button, and its URL if present.
6. Number formats: CC amounts compact ("1.2M CC"), USD with `usdCompact`, percentages with 1 decimal, all with `font-variant-numeric: tabular-nums` (class `num`). `null` always renders "—", never 0.
7. States: the loading and error states come from `LoadState`. Each table has an empty state. Test the error state by stopping the server while the page is open and reloading.
8. Responsive: at 375px the stat tiles wrap, charts fit, and wide tables scroll inside their own container (`overflow-x: auto` on a wrapper). The page itself never scrolls sideways.
9. Check light and dark mode (OS setting), keyboard focus on sort headers and toggles (use `<button>`s), and that headers use `aria-sort`.

## Acceptance criteria

- The three pages render fully from the fixtures, with no console errors or warnings.
- Every number on screen traces to a field in the contract. Nothing is hard-coded or invented.
- The "Sample data" badge shows (it comes from `NetworkPage`'s `meta`).
- Sorting, filtering, toggles and the app detail panel all work.
- Light and dark mode, 375px width, keyboard-usable controls.
- `cd ui && npx tsc --noEmit && npm run build` pass. No new dependencies unless pure JS and justified in the PR.
- PR includes screenshots of each page, desktop and 375px.

## Out of scope

Fetching data from anywhere but `api.ts`. Editing `charts.tsx`, `types.ts`, `NetworkSection.tsx` or `styles.css`: request changes in the PR instead.
