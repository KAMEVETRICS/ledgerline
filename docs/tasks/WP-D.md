# WP-D: Private-markets statistics and history

**Owner:** Claude (integrator) · **Branch:** `wp-d-private-markets` · **Due:** 2026-10-06

## Goal

Give the private-markets layer the two things a data-track judge needs: charts over time, and network-level statistics that exist without anyone revealing their positions.

## Files

`main/daml/`, `test/daml/`, `ui/src/private/`, `ui/src/panes.tsx`, plus the integrator-owned UI files as needed.

## Steps

1. **Quarterly history in the seed.** Extend `Demo/Setup.daml` so both funds have four quarters (Q4 2025 to Q3 2026) of calls, distributions and administrator NAVs. Statements accumulate per quarter, so performance can be charted.
2. **Network statistics contract.** Add `Reporting:FundStatistics`, signed by the administrator, observed by the `Ecosystem` party. The administrator publishes it per quarter across all funds it runs: funds, LPs, capital committed, called and distributed, median and range of TVPI, median days from call to payment, and calls paid on time (%). It is published **only when at least 3 funds and 5 LPs contribute** (enforced in the choice). Nothing per-fund or per-LP is in it.
3. **Daml tests.** The publish is refused below the threshold; the Ecosystem party sees the statistics and no fund, commitment or statement; the figures match the seed.
4. **Ecosystem private-markets page** (`ui/src/private/EcosystemPrivateMarkets.tsx`): stat tiles, capital flows per quarter, the TVPI distribution, call-to-payment time, and a note on the privacy threshold.
5. **Investor charts** in the LP view: cash flows per quarter, TVPI per quarter by fund, and a liquidity forecast (upcoming calls against cash).
6. **App health for operators:** call-to-payment time, open calls, and NAV freshness per fund, from the administrator's view.

## Acceptance

- `dpm test` passes, including the new threshold and visibility tests.
- The Ecosystem account sees statistics only, and the "Who holds what" matrix shows it holding nothing else.
- The charts render from real ledger data in the demo.
