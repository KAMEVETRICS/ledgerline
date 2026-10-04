# WP-B2: Network pages on real data

**Agent:** Grok Build · **Branch:** `wp-b2-live-polish` (from the latest `main`) · **Due:** 2026-10-06 12:00 UTC

## Why

Your WP-B pages are merged and work well on the sample data. On **live** CC Space data they show problems the samples hid. CC Space gives no display names, so names are 70-character party ids. Some series are empty because the source doesn't provide them. And there are 1,424 validators, not 24. This task fixes the three pages for real data.

## Files you own

Same as WP-B: `ui/src/network/pages/Overview.tsx`, `Validators.tsx`, `Apps.tsx`, and `ui/src/network/pages/wpb/`. Read `AGENTS.md` first. It changed: the Network section is now public, with no sign-in.

## Run against real-shaped data (no key needed)

```bash
cd ui && npm install
```

Then start the server with the recorded live responses (PowerShell: `$env:NETWORK_FIXTURE_SET='live'; npm run dev`):

```bash
NETWORK_FIXTURE_SET=live npm run dev
```

Open http://localhost:5173. Recorded responses are in `ui/scripts/network/fixtures-live/`. The badge will say "Live" because these are real responses; that's expected in this mode. Also check the plain sample mode (`npm run dev` without the variable): both must look right.

## Steps

1. **Readable party names.** Add a helper in `wpb/` that turns a party id `hint::1220abcd…` into a display name `hint` plus a short fingerprint (`1220ab…cd`), with the full id in `title` and a copy button where the id matters. Use it for validator names, sponsors, app names and providers. Never invent a company name: the hint is the party's own label.
2. **No sideways page scroll, at any width, with 1,424 validators.** Tables sit in their own `overflow-x: auto` wrapper. Cells holding ids truncate with an ellipsis (`min-width: 0`, `text-overflow: ellipsis`). Check at 1440px, 1024px and 375px.
3. **Empty series.** Don't show a chart panel with "No data for this period" when the source can't provide that series (an empty array on live data). Replace each one with a panel built from data that is present:
   - **Overview, "Active validators per day":** replace with **"Validator liveness"**, a bar of active vs stale counts from `validators.active` and `validators.total`.
   - **Validators, "Active validators per day" and "Rewards per round":** replace with **"Validators by sponsor"** (top 10 sponsors by count, as a horizontal bar list) and **"Liveness"** (active vs stale).
   - Keep the original charts, and show them whenever their series has data, as it does in sample mode.
   - Under any metric shown as "—", add a one-line reason taken from `meta.note`, e.g. "Not provided by CC Space".
4. **Needs attention.** Show the first 10, then a "Show all N" button. Group by reason (stale, low uptime, not seen for 24h) with counts.
5. **Validator table.** Paginate at 50 rows, with "Show more" (or pages) and the total count. Sorting and filtering apply to all rows, not just the visible page. The version column shows "—" when it's null, and the "versions in use" panel hides when every version is null.
6. **Apps.** Show the display name (step 1). Hide the sparkline column when no app has `activityDaily` data. Keep the 30-day activity and rewards columns. "Movers" needs daily data: when it's missing, replace it with **"Top earners"** (top 5 by `rewards30dCC`) and **"Most active"** (top 5 by `activity30d`).
7. Re-take the screenshots (desktop + 375px, live mode) into `wpb/shots/`, replacing the old ones.

## Acceptance criteria

- With `NETWORK_FIXTURE_SET=live`: no empty chart panels, no sideways page scroll at 1440 / 1024 / 375px, readable names everywhere, attention list capped, table paginated.
- In plain sample mode everything still renders, including the original charts.
- No number invented. Every value traces to `ui/src/network/types.ts`.
- `cd ui && npx tsc --noEmit && npm run build` pass. Open a PR with screenshots of both modes.
