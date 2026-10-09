# Public response recordings

These files are real, unmodified public network JSON response bodies. CC Space calls used the server-side API key; OneSwap calls were anonymous. No credentials, headers or private ledger positions are included. Party captures use the public ITRocket validator identified by the CC Space guide.

| File | Public GET URL | Recorded (UTC) |
|---|---|---|
| `oneswap-pools.json` | `https://api.oneswap.cc/swapv2/api/rt/pools` | 2026-10-04, immediately before the ticker recording |
| `oneswap-ticker.json` | `https://api.oneswap.cc/swapv2/api/rt/pool/rt-36o279/ticker` | 2026-10-04T00:27:24.051Z (response `asOf`) |

`provenance.json` lists the exact CC Space URL and UTC capture time for each of `price.json`, `validators-balances.json`, `featured-apps.json`, `transfer-activity.json`, `rewards.json`, `rewards-before.json`, `party-balance.json` and `party-operations.json`. They were captured on 2026-10-04T00:55:45.983Z through 00:55:48.583Z. `rewards-before.json` is a real next-cursor page, not a duplicate or an offset substitution.

The recordings establish that validator liveness is `active`/`stale`/`never_seen`, and that monetary validator coupons use `reward_type: "validator"`. No validator-liveness activity feed was observed. OneSwap's ticker has null 24-hour volume and no TVL; those unavailable values are preserved.

Inline literals in `ccspace.test.mjs` are explicitly synthetic boundary cases, including a synthetic coupon amount used to test the recorded reward type. Every pure mapper and all five full contracts are also tested against the real recordings.

UI verification screenshots for the gateway live in `docs/qa/gateway/`; they are not upstream API recordings. Light/dark screenshots force the existing CSS media branches through a temporary QA proxy; no UI or CSS source was edited. Network pages remain the integrator's WP-B/WP-C stubs.
