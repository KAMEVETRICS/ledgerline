# Network data sources (WP-A)

The adapter uses the [CC Space API reference](https://cc.itrocket.space/api-reference), its [published OpenAPI schema](https://cc-api.itrocket.space/openapi.json), and the [CC Space guide](https://github.com/itrocket-team/testnet_guides/blob/main/canton/CC_Space.md). CC Space paths below are relative to `https://cc-api.itrocket.space/api/v1`. Authentication is a server-side bearer token from `ui/.env.local`; no token or upstream error body is returned or logged.

OneSwap has an anonymous read API. Its [SDK methods](https://docs.oneswap.cc/reference/sdk-methods) and published `@oneswap/sdk` 1.3.0 identify `https://api.oneswap.cc/swapv2/api/rt/pools` and `/api/rt/pool/{id}/ticker`. Both were verified without authentication. CC Space credentials are never sent to OneSwap. No SDK dependency is installed.

## Interpretation and limits

- `/price` reports the DSO/SV **governance price**, not an exchange price. The overview labels this in `meta.note`; it is not used to assign a market value to holdings or manufacture price history.
- The published CC Space API host is mainnet. `CCSPACE_NETWORK` defaults to `mainnet`; unsupported networks fail safely to the gateway's labelled fixtures rather than relabel mainnet observations. A documented testnet/devnet API host is needed before enabling those networks.
- Validator data excludes rows that are only super validators. The real response reports `liveness: "active"` for active validators and `"stale"` for inactive ones (the published schema's `"live"` example does not match the recording). Unknown liveness cannot populate the contract's required boolean, so that row is omitted and the omission is noted. Display names use the actual party identifier because the balance endpoint supplies no name.
- Featured-app totals and rewards use `period=30d&view=providers`. CC Space defines this as 30 UTC days **including today**, and excludes providers without markers. It is not a registry of all applications. A single list page requests `limit=100`; additional results are disclosed as omitted. This aggregate endpoint documents `offset`, unlike cursor-based history; the adapter does not substitute an offset for a history cursor.
- Daily series cover the last 30 UTC dates including today and are sorted ascending. Today's observations extend only through `meta.asOf`. Missing numeric observations are omitted, not interpolated. Transfer subtypes are summed by date. Reward-history-derived activity is emitted only for dates whose coverage is proven by pagination; the incomplete oldest page date and dates with missing attribution are omitted. Exhausted history proves zero activity on otherwise empty dates only for a supported event feed. The recorded coupon feed contains `validator` rewards, not `validator_liveness` activity, so validator activity is empty instead of fabricated zeros. Cached history never adds a zero for a new, unobserved UTC date.
- History uses `limit=100` and the response's `next_cursor` as `before`. The adapter reads at most six reward-history pages for overview and nine for validators/apps, including cache hits. This may not reach even one complete day on a busy network; in that case those series are empty and `meta.note` explains why. Coupon record times are **not round close times**, so no per-round reward series is invented.
- Each route permits at most **20 actual upstream HTTP attempts**, including retries and OneSwap requests. Network URLs cache for 60 seconds, party URLs for 30 seconds; identical concurrent requests share a promise. Failures are not cached. A credential change invalidates cached CC Space data. `NODE_DEBUG=ccspace` prints only route name and attempt count.
- HTTP 429 and 5xx receive exactly one retry after one second, with an eight-second `AbortSignal.timeout` on each attempt. Other HTTP failures, malformed JSON, timeouts and unexpected response envelopes throw safe errors; the existing gateway serves `meta.source: "fixture"` without crashing. Optional OneSwap failures omit the affected measurements and are noted.

## Shared types

| Contract field | Endpoint | Response field | Transformation / unavailability reason |
|---|---|---|---|
| `Meta.source` | All routes | Adapter provenance | Literal `"ccspace"` only after required authenticated upstream calls succeed. |
| `Meta.network` | All routes | Validated server configuration | `mainnet`; other networks require a documented API host. |
| `Meta.asOf` | All routes | Fetch completion time | UTC ISO string; oldest contributing cached response, so cache reads do not pretend to be fresh fetches. |
| `Meta.note` | All routes | Adapter coverage and source limitations | Optional string explaining governance price, missing fields, omitted rows and partial history. |
| `Point.t` | Aggregate/history endpoints | `date` / `record_time` | UTC `YYYY-MM-DD`, within the last 30 dates, unique and ascending. No round timestamps available. |
| `Point.v` | Aggregate/history endpoints | Finite numeric observations / fully covered events | Decimal strings parsed strictly; subtype sums or activity counts. Null/invalid observations never become zero. |
| `NetworkError.error` | Gateway (integrator-owned) | Route validation | Existing gateway error string; adapter throws sanitized errors to trigger fixture fallback. |

## Overview (`NetworkOverview`)

| Contract field | Endpoint | Response field | Transformation / unavailability reason |
|---|---|---|---|
| `meta` | Required overview endpoints | Shared `Meta` | See above. |
| `latestRound` | `/price` | `round_number` | Safe nonnegative integer or `null`; newest open governance-price round. |
| `validators.total` | `/validators/balances` | `validators[].is_validator` | Count validator rows; do not use the combined validator/SV `count`. |
| `validators.active` | `/validators/balances` | `validators[].liveness` | Count confirmed `"active"` validators; unknown liveness is disclosed. |
| `featuredApps` | `/featured-apps?period=30d&view=providers&limit=100` | `total` | Nonnegative integer, providers with markers in this window; required invalid totals trigger fallback. |
| `ccPriceUsd` | `/price` | `amulet_price_usd` | Strict finite decimal conversion or `null`; governance price, explicitly noted. |
| `ccSupply` | None | None | `null`: no network CC supply endpoint. Wallet balances / row counts are not total supply. |
| `transfers24h` | None | None | `null`: daily UTC buckets are not a rolling 24-hour count; bounded paging cannot prove the whole rolling window. |
| `series.transfersDaily` | `/transfer-activity?period=30d` | `series[].date`, `count` | Sum counts across transfer subtypes for each observed UTC date. |
| `series.activeValidatorsDaily` | `/rewards?limit=100&before=…` | `reward_type`, `beneficiary`, `record_time` | Distinct beneficiaries with `validator_liveness` events per covered date; incomplete/unknown dates omitted. `[]` for the recorded coupon feed, which supplies no liveness markers. |

## Validators (`ValidatorsReport`, `Validator`)

| Contract field | Endpoint | Response field | Transformation / unavailability reason |
|---|---|---|---|
| `meta` | Validator endpoints | Shared `Meta` | See above; reports omitted rows/history coverage. |
| `validators` | `/validators/balances` | `validators[]` | Filter `is_validator === true`; map rows with known liveness and identity. |
| `Validator.id` | `/validators/balances` | `party_id` | Exact party identifier. |
| `Validator.name` | `/validators/balances` | `party_id` | Actual identifier as display name; no human name is supplied. |
| `Validator.party` | `/validators/balances` | `party_id` | Exact identifier; unidentified rows cannot form a required `id` and are omitted. |
| `Validator.sponsor` | `/validators/balances` | `sponsor` | Nonempty string or `null`. |
| `Validator.version` | None | None | `null`: public balance/liveness data contains no software version. |
| `Validator.active` | `/validators/balances` | `liveness` | `active → true`, `stale → false`; unknown rows omitted. |
| `Validator.lastActiveAt` | None | None | `null`: current liveness is not a last-active timestamp. |
| `Validator.uptime30d` | None matching this definition | None | `null`: uptime endpoint returns hourly/raw percentage samples, not the contract's share of rounds with activity. A bounded reward history is not a full 30-day round denominator. |
| `Validator.rewards30dCC` | `/rewards?limit=100&before=…` | `reward_type`, `beneficiary`, `amount`, `record_time` | Sum `validator` coupons (and documented validator reward variants) only if paging covers the full 30-date window and all matching amounts are known; otherwise `null`. Never extrapolate partial rewards or convert reward weights into CC. |
| `series.activeDaily` | `/rewards?limit=100&before=…` | Same liveness fields as overview | Same fully covered daily activity mapping. |
| `series.rewardsPerRoundCC` | None matching this definition | No round-close timestamp | `[]`: reward coupon/claim `record_time` is not the mining round's close time. |

## Apps (`AppsReport`, `App`)

| Contract field | Endpoint | Response field | Transformation / unavailability reason |
|---|---|---|---|
| `meta` | Featured-app/history endpoints | Shared `Meta` | See above; note window, page limit and missing activity days. |
| `apps` | `/featured-apps?period=30d&view=providers&limit=100` | `items[]` | Map identified providers, up to 100; disclose any remainder from `total`. |
| `App.id` | Featured-app list | `party_id` | Exact party identifier. |
| `App.name` | Featured-app list | `party_id` | Actual identifier; the endpoint supplies no app name. |
| `App.provider` | Featured-app list (`view=providers`) | `party_id` | Right-holder/provider identifier, not a guessed company name. |
| `App.party` | Featured-app list | `party_id` | Exact identifier. |
| `App.featured` | Featured-app list | `featured_since` | True for a valid grant timestamp; null/absent means no current right per the API reference. |
| `App.activity30d` | Featured-app list | `total_markers` | Safe nonnegative integer or `null`, 30 UTC dates including today. |
| `App.rewards30dCC` | Featured-app list | `total_cc_earned` | Finite decimal or `null`; the API may report zero before issuance closes. |
| `App.activityDaily` | `/rewards?limit=100&before=…` | `provider`, `reward_type`, `record_time`, `event_id` | Count attributed `featured_app_activity` / `app_activity` markers per proven complete day. Missing provider attribution invalidates that day. Never divide a 30-day total across days. |
| `App.url` | None | None | `null`: no app URL in these public responses. |

## Liquidity (`LiquidityReport`, `Pool`)

| Contract field | Endpoint | Response field | Transformation / unavailability reason |
|---|---|---|---|
| `meta` | Transfer activity; optional OneSwap reads | Shared `Meta` | CC Space provenance; note that pools come from OneSwap and that TVL/history are unavailable. |
| `cc.priceUsd` | None | No historical governance/market price series | `[]`; a current quote is not 30 days of observations. |
| `cc.supply` | None | No supply history | `[]`. |
| `cc.transferVolumeDailyCC` | `/transfer-activity?period=30d` | `series[].date`, `total_volume` | Sum finite CC volume across subtypes per observed UTC date. Missing volume invalidates that date. Public indexed volume excludes privacy-hidden amounts. |
| `pools` | OneSwap `/api/rt/pools`; optional ticker per pool | Public pool array | Anonymous reads. Fetch tickers only while two retry-inclusive attempts remain; keep available pools and disclose skipped/missing measurements. If listing fails, `[]` with a note. |
| `Pool.id` | OneSwap pool list | `id` | Exact pool ID. |
| `Pool.venue` | OneSwap pool list | Source identity | Literal `OneSwap`. |
| `Pool.pair` | OneSwap pool list | `assetX.symbol`, `assetY.symbol` | Join observed symbols with `/`; no guessed token symbols. |
| `Pool.tvlUsd` | None | No TVL field in pool/ticker response | `null`; do not estimate from reserves or substitute token-denominated liquidity. |
| `Pool.volume24hUsd` | OneSwap ticker | `volume24h.usd` | Finite decimal or `null`. Price-only/reporting warm-up tickers can report null. |

## Party portfolio (`PartyPortfolio`, `Holding`, `Operation`)

| Contract field | Endpoint | Response field | Transformation / unavailability reason |
|---|---|---|---|
| `meta` | Party balance/operations | Shared `Meta` | 30-second cache; disclose CC-only holdings and hidden private amounts. |
| `party` | Request / party operations | Requested `partyId`, `party_id` | Validate party ID and reject a mismatching returned ID. |
| `holdings` | `/parties/{partyId}/balance` | Wallet balances | One CC holding when both required balances are numeric; otherwise `[]` with a note. Other CIP-0056 instrument holdings are unavailable from this wallet endpoint. |
| `Holding.instrument` | CC wallet balance | Endpoint asset identity | Literal `CC`; no other asset is inferred. |
| `Holding.admin` | None | No issuer/admin in wallet response | `null`. |
| `Holding.amount` | Party balance | `unlocked_balance`, `locked_balance` | Sum the two balances. The schema says `total_balance` currently equals unlocked balance, so adding it again would double-count. |
| `Holding.valueUsd` | None | No market valuation | `null`; governance price is not a market valuation. |
| `recent` | `/parties/{partyId}/operations?limit=100` | `operations[]` | Up to 100 recent operations, normalize valid rows; malformed required identity/time rows are omitted and noted. |
| `Operation.id` | Party operations | `event_id`, else `update_id` | Use an actual source identifier. |
| `Operation.at` | Party operations | `record_time` | Normalize valid timestamps to UTC ISO; do not substitute current time. |
| `Operation.type` | Party operations | `operation_type` | Exact nonempty type. |
| `Operation.direction` | Party operations | `direction` | `received → in`, `sent → out`, otherwise `other`. |
| `Operation.counterparty` | Party operations | `counterparty` | Nonempty disclosed identifier or `null`. |
| `Operation.instrument` | Party operations | CC operation type / `tokens[].symbol` | CC wallet operations are `CC`; private transfer uses a single reported token symbol, otherwise `null`. No amount is inferred from token metadata. |
| `Operation.amount` | Party operations | `amount`, `amount_pending` | Finite disclosed amount or `null`. Pending conversions and privacy-hidden transfers always remain `null`, never reward `weight`. |

## Verification and recordings

Run from the repository root:

```sh
node --test ui/scripts/network/
node ui/scripts/network/check-contract.mjs <real-public-party-id>
cd ui
npx tsc --noEmit
npm run build
```

From `ui/`, use `node scripts/network/check-contract.mjs <partyId>` (the task's combined root-relative path and `ui/` working directory cannot both apply). The checker loads the existing `ui/scripts/env.mjs`, calls all five functions without the fixture gateway, prints one result line per route, and fails if the key is missing or any source/shape/finite-number/series check fails. Its optional party argument defaults to the public ITRocket validator from the guide.

On Node 24 the directory-form `node --test ui/scripts/network/` does not resolve a test directory; it fails before running tests because there is no module entry at that path. Run `node --test ui/scripts/network/ccspace.test.mjs`, or `cd ui && node --test` for automatic discovery. No unowned directory-entry/package file was added to work around the task command.

`__fixtures__` contains real public response bodies for every endpoint used, including a second cursor page and the public ITRocket validator's balance/operations. CC Space captures used server-side authentication; OneSwap captures were anonymous. Provenance, paths and fetch timestamps are tracked separately. Edge-case inputs in tests are explicitly synthetic and never presented as recorded network observations. No credential or request header is included.

Verified on 2026-10-04 with Node 24: all 30 tests pass; the live checker and actual HTTP gateway return `ccspace` for all five routes. Missing-key and invalid-key checks return fixtures for all five routes with a healthy server. Debug logs contain only route names/counts; observed route counts were overview 10, validators 3, apps 10, liquidity 9, party 2 (shared cache reuse lowers these). Retry-inclusive budget tests prevent a 21st attempt. Typecheck and the esbuild-wasm build pass; the native-addon scan finds zero `.node` files.

Screenshots in `__fixtures__/screenshots/` show the existing network page frames with live, sample, loading and error states. The page implementations remain WP-B/WP-C stubs. Visual QA uses the unchanged CSS's light and dark media branches via a temporary local proxy; at 375px, every frame's document width equals the viewport width with no horizontal page scroll.

Credit audit: `origin/main` added the credit-budget section after this worktree was created. The task states an opening allocation of 500 credits; a balance check was not captured before the first paid call, so 500 is the stated allocation, not a measured starting balance. The free `GET /credits/balance` check at **2026-10-04T01:26:49.154Z** returned **400 total / 400 free / 0 paid** credits. The difference from the stated allocation is 100 credits, below the 150-credit development limit. All further development uses recordings; local verification servers were stopped. No credit-balance response or account credential is included in the public API recordings.

## Contract change requests

- Allow a nullable `Validator.active` to represent unknown upstream liveness without omitting that validator.
- Distinguish governance price from market price, and rolling 24-hour metrics from UTC daily aggregates.
- Permit a round number or coupon issuance time for per-round charts, or provide a round-close-time source.
- Include completeness/window metadata for bounded paged activity and featured-app results.
- Document CC Space testnet/devnet API hosts before enabling those configured networks.
- Correct the task's test command to the explicit test file / automatic discovery, or authorize a directory entry module outside WP-A's owned files.
