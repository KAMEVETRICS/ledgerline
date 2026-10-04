# WP-A: Live network data adapter (CC Space)

**Agent:** Codex · **Branch:** `wp-a-ccspace` · **Due:** 2026-10-05 12:00 UTC

## Goal

Make every `/api/network/*` route return real Canton Network data from the CC Space API, in exactly the shapes defined in `ui/src/network/types.ts`. The gateway (`ui/scripts/network/index.mjs`) already calls your module when `CCSPACE_API_KEY` is set, and falls back to fixtures when your function throws. You write the module it calls.

## Files you own

- `ui/scripts/network/ccspace.mjs` (new)
- `ui/scripts/network/ccspace.test.mjs` (new)
- `ui/scripts/network/__fixtures__/` (new: recorded API responses for tests)
- `ui/scripts/network/check-contract.mjs` (new)
- `docs/data-sources.md` (new)

Do not edit any other file. Read `AGENTS.md` first.

## Inputs

- Contract: `ui/src/network/types.ts`. Read every comment; `null` rules matter.
- Gateway: `ui/scripts/network/index.mjs`. It calls `live.overview()`, `live.validators()`, `live.apps()`, `live.liquidity()`, `live.party(partyId)`.
- Example outputs: `ui/scripts/network/fixtures/*.json` (sample data in the right shape).
- CC Space API: base URL `https://cc-api.itrocket.space/api/v1`, header `Authorization: Bearer <key>`. Reference: https://cc.itrocket.space/api-reference. Guide: https://github.com/itrocket-team/testnet_guides/blob/main/canton/CC_Space.md. Paging is cursor-based (`before=`), not offset. Calls cost credits, so cache.
- The key is in `ui/.env.local` as `CCSPACE_API_KEY=...` (loaded by `ui/scripts/env.mjs`). Optional `CCSPACE_NETWORK=mainnet|testnet|devnet` (default `mainnet`).

## Credit budget (read before your first call)

The account has **500 credits in total**, for development **and** the live demo. Budget:

- **At most 150 credits for all of your development and testing.** Check `GET /credits/balance` (free, never billed) before you start and after each test session, and report both numbers in your PR.
- Find each endpoint's credit cost in the API reference **before** calling it. Prefer the cheapest endpoints that satisfy a field.
- Record a response once into `__fixtures__/` and develop against the recording. Don't re-call the API to iterate on mapping code.
- Never call the API in a loop, from tests, or from `check-contract.mjs` more than once per route per run.
- If 150 credits isn't enough to finish, stop and say so in the PR rather than spending more.

## Steps

1. Read `AGENTS.md`, `ui/src/network/types.ts`, `ui/scripts/network/index.mjs` and the fixtures.
2. Read the CC Space API reference. For every field in every contract type, find the endpoint and field that supplies it. Write the mapping to `docs/data-sources.md` as a table: contract field → endpoint → response field → transformation. Mark any field the API cannot supply as `null` with a reason. **Do not invent values or estimate missing ones.**
3. Implement a small HTTP client in `ccspace.mjs`:
   - Uses global `fetch`, 8 s timeout (`AbortSignal.timeout`), `Authorization: Bearer ${process.env.CCSPACE_API_KEY}`.
   - In-memory TTL cache keyed by URL: 60 s for network-wide data, 30 s for party lookups. Concurrent identical requests share one in-flight promise.
   - On HTTP 429 or 5xx: one retry after 1 s, then throw.
   - Never logs the key or full request headers.
4. Export five async functions, each returning exactly its contract type with `meta: { source: "ccspace", network, asOf: <ISO now>, note? }`:
   - `overview()` → `NetworkOverview`
   - `validators()` → `ValidatorsReport`
   - `apps()` → `AppsReport`
   - `liquidity()` → `LiquidityReport`
   - `party(partyId)` → `PartyPortfolio`
   Keep the raw-to-contract mapping in small pure functions (`toValidator(raw)`, …) so they can be unit-tested.
5. Series: daily series are the last 30 days, one point per UTC day, sorted ascending. `rewardsPerRoundCC` is the last 48 rounds. If the API only gives totals, build series from the paged history endpoints, within a budget of **at most 20 API calls per route** per cache refresh. If that isn't enough for a series, return what you have and explain in `meta.note`.
6. Liquidity pools: if CC Space has no pool data, check whether OneSwap (https://docs.oneswap.cc) exposes a public read API for pools (TVL, 24h volume). Use it if it needs no key; otherwise return `pools: []` and say so in `meta.note`. Don't spend more than about an hour on this.
7. Record one real response per endpoint you use into `__fixtures__/` (public network data only, no key). Write `ccspace.test.mjs` with `node:test` covering every mapping function against those recordings, including missing and `null` fields. Run with `node --test ui/scripts/network/`.
8. Write `check-contract.mjs`: calls each of the five functions live and checks the result against the contract at runtime (required keys present, types right, series sorted, no `NaN`). Prints one line per route and exits non-zero on any failure. Run `node ui/scripts/network/check-contract.mjs` from `ui/` with the key set.
9. Test the whole path: `cd ui && npm run dev`, then `curl localhost:5173/api/network/overview` (and each other route) shows `"source":"ccspace"`. Stop the key (rename `.env.local`), restart, and confirm the routes fall back to `"source":"fixture"`.

## Acceptance criteria

- With the key: all five routes return `meta.source: "ccspace"` and pass `check-contract.mjs`.
- Without the key, or with a bad key: routes return fixtures; the server does not crash.
- `node --test ui/scripts/network/` passes.
- No key appears in any log, response, commit or file other than `ui/.env.local`.
- At most 20 upstream calls per route per cache refresh (log the count at debug level).
- `docs/data-sources.md` maps every contract field, including the `null` ones.
- `cd ui && npx tsc --noEmit && npm run build` still pass.

## Out of scope

UI pages (WP-B, WP-C). Any change to `types.ts`: if the API offers something valuable the contract lacks, or the contract asks for something impossible, write it under "Contract change requests" in your PR.
