# WP-C: Liquidity views and portfolio lookup

**Agent:** Codex (after WP-A) · **Branch:** `wp-c-liquidity-portfolio` · **Due:** 2026-10-06 12:00 UTC

## Goal

Build two pages of the Network section:

- **Liquidity:** a treasury, market maker or app developer sees Canton Coin's price, supply and transfer volume, and where trading liquidity sits, to decide where to deploy capital or list an asset.
- **Portfolio lookup:** anyone enters a Canton party id and sees that party's public holdings and recent activity, for counterparty checks and treasury monitoring.

## Files you own

- `ui/src/network/pages/Liquidity.tsx` (replace the stub; keep `export function Liquidity`)
- `ui/src/network/pages/Portfolio.tsx` (replace the stub; keep `export function Portfolio`)
- `ui/src/network/pages/wpc/` (new folder: helpers, sub-components, and `wpc.css` for your styles)

Do not edit any other file. Read `AGENTS.md` first.

## Inputs

- Data contract: `ui/src/network/types.ts` (`LiquidityReport`, `Pool`, `PartyPortfolio`, `Holding`, `Operation`).
- Data hooks: `ui/src/network/api.ts`: `useLoad(fetchLiquidity)`, `useLoad(() => fetchParty(id), id)`.
- Page frame, charts and UI pieces: same as WP-B (see `docs/tasks/WP-B.md` "Inputs").
- Sample data: `ui/scripts/network/fixtures/liquidity.json`, `party.json`. The fixture gateway answers any valid party id with the same sample party.
- Run: `cd ui && npm install && npm run dev`, sign in as `ecosystem`, open Network → Liquidity.

## Steps

1. Read `AGENTS.md`, the contract and the stubs. Create `ui/src/network/pages/wpc/wpc.css` and import it from both pages.
2. **Liquidity** (`Liquidity.tsx`):
   - Stat tiles: CC price (USD, 4 decimals); 30-day price change (±%, from the first and last `priceUsd` points); CC supply; market cap (price × supply, labelled "computed"); average daily transfer volume over 30 days (CC).
   - Charts: CC price (`TimeSeriesChart`, area, USD format); transfer volume per day (`BarSeriesChart`, CC); supply (`TimeSeriesChart`).
   - Pools table: venue, pair, TVL (USD), 24h volume (USD), turnover (volume ÷ TVL, as %, "—" when either is null), sorted by TVL. Empty state when `pools` is empty: "No pool data from this source", plus `meta.note` if present.
   - One sentence under each panel on the decision it informs, e.g. "Rising volume at a flat price signals deepening liquidity for new listings."
3. **Portfolio lookup** (`Portfolio.tsx`):
   - A search form: a party id input, with validation that matches the gateway (`/^[\w.\-:]{3,512}$/`, and must contain `::`), a submit button, and an inline error for invalid input. The URL hash carries the party (`#/network/portfolio?party=<id>`), so a lookup can be shared and survives a reload. Read and write it with `window.location.hash`.
   - Recent lookups: the last 5 ids in `localStorage`, wrapped in try/catch so a blocked storage still works. Clickable chips.
   - Result header: the party id (shortened in the middle, full id in a `title`) with a copy button; total value (sum of non-null `valueUsd`, and say how many holdings have no USD value).
   - Holdings table: instrument, issuer (`admin`, shortened, "—" when null), amount, value (USD), share of valued total (thin bar). Sorted by value.
   - An allocation bar across the valued holdings, coloured with `var(--chart-1..4)`.
   - Recent activity list: date, type, direction (in green, out neutral), counterparty (shortened), instrument, amount. Empty state when there's none.
   - Before any search: an empty state explaining what the page does, with one example button that fills in `sample-party::12200000`.
4. Number formats, `null` handling, states, responsiveness, accessibility: the same rules as WP-B steps 6–9.

## Acceptance criteria

- Both pages render fully from the fixtures, with no console errors.
- Portfolio: invalid ids are rejected before any request; valid lookups load; the hash and recent lookups work across reloads; copy works.
- Every number traces to the contract; market cap and turnover are labelled as computed.
- Light and dark mode, 375px width, keyboard-usable.
- `cd ui && npx tsc --noEmit && npm run build` pass.
- PR includes screenshots of both pages, desktop and 375px.

## Out of scope

Fetching data except through `api.ts`. Editing integrator-owned files: request changes in the PR.
