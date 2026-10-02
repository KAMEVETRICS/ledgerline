# Ledgerline

Fund administration on Canton where every party sees a different, correct view of one ledger. LPs see only their own capital account. The GP sees the whole fund. Auditors see only what was disclosed, for a fixed window.

HackCanton Season 4 entry for two tracks: Investment Infrastructure, and Data & Analytics.

## Who sees what

| Contract | GP | Administrator | That LP | Other LPs | Auditor |
|---|---|---|---|---|---|
| `Fund` | ✓ | ✓ | | | |
| `Commitment` (capital account + side-letter terms) | ✓ | ✓ | ✓ | | |
| `CapitalCallNotice`, receipts | ✓ | ✓ | ✓ | | |
| `NavStatement` (fund NAV) | ✓ | ✓ | | | |
| `LpStatement` (NAV share, TVPI, DPI) | ✓ | ✓ | ✓ | | |
| `MfnAttestation` (verdict only) | ✓ | ✓ | ✓ | | |
| `AuditView` (snapshot) | | ✓ | | | ✓ |

With several funds, each manager sees only its own fund. An LP's node is the only place its positions across managers meet, so the portfolio view (`ui/src/panes.tsx`, `holdingsOf`) is computed there. No aggregator ever sees the whole book. `test/daml/Test/MultiFund.daml` asserts this.

Choices that read several LPs' data (`IssueCapitalCall`, `PublishNav`, `AttestMfn`) are **nonconsuming and controlled by a single party**. Only that party is an informee of the exercise. Each LP is an informee only of the contracts created for it, plus the fetch of its own commitment. An LP can infer that its commitment was read in a transaction, but cannot see who else was involved or what they hold.

## Workflows

1. GP creates `Fund`. Administrator creates `AdminDesk` (consenting to the role).
2. GP `OfferCommitment` → LP `AcceptCommitment` → `Commitment`.
3. GP `IssueCapitalCall` → one pro-rata `CapitalCallNotice` per LP.
4. LP `PayCall`: cash moves to the GP and the capital account updates in **one transaction**.
5. GP `Distribute` on a commitment: cash goes to the LP and `distributed` updates.
6. Administrator `PublishNav`: fund NAV plus every `LpStatement` in one transaction.
7. Administrator `AttestMfn`: checks whether an LP's terms are at least as good as any LP with an equal or smaller commitment, without revealing those terms.
8. GP `AuditGrant` → administrator `DiscloseToAuditor` (rejected after `validUntil`).

## Build and test

Uses Daml SDK 3.4.10, the same as `../clearhold`.

```bash
dpm build --all
```

```bash
cd test && dpm test
```

`test/daml/Test/FundLifecycle.daml` runs the full lifecycle and asserts the visibility rules above.

## Run the dashboard demo

The UI in `ui/` talks to a local Canton sandbox through the JSON Ledger API. Each pane reads and writes as one party, so what it shows is exactly what that party's node holds.

**One command** (from `ledgerline`; needs the Daml SDK, Java 17+ and Node 22+):

```bash
node scripts/demo.mjs
```

This builds the DARs, starts a fresh sandbox, waits until it can allocate parties, seeds both funds, installs UI dependencies if needed and serves http://localhost:5173. Ctrl+C stops the ledger and the UI together. Sandbox output goes to `log/sandbox.out`. Run it again for a clean demo. Pass `--no-build` to skip the build. If a ledger is already running on :7575, the script reuses it.

**By hand**, the same steps:

1. Build the contracts (from `ledgerline`):

   ```bash
   dpm build --all
   ```

2. Start the sandbox and leave it running (its own terminal):

   ```bash
   dpm sandbox --dar main/.daml/dist/ledgerline-0.1.0.dar --json-api-port 7575 --canton-port-file .sandbox-ports.json
   ```

3. Once `.sandbox-ports.json` appears, wait a few more seconds for the sandbox to connect to its synchronizer, then seed the demo. This creates two funds from two managers. Ledgerline Capital runs LL-I (three LPs, CC-1 paid). Ridgeway Partners runs RW-II (Harbor and Mesa only, with a NAV, a distribution and CC-2 outstanding):

   ```bash
   dpm script --dar test/.daml/dist/ledgerline-test-0.1.0.dar --script-name Demo.Setup:setup --ledger-host localhost --ledger-port 6865
   ```

4. Start the UI (first time: `npm install` in `ui/`), then open http://localhost:5173:

   ```bash
   npm --prefix ui run dev
   ```

The sandbox keeps state in memory. To reset the demo, stop it and repeat steps 2–3.

**Demo script for judges:** start on Harbor's portfolio. It combines two funds from two managers on Harbor's own node, while each GP pane shows only its own fund. Pay RW-II CC-2 from Harbor: Ridgeway's pane updates and Ledgerline Capital's doesn't. Then Ledgerline Capital issues CC-2 → each LP sees only its own notice → LP pays (cash and capital account move in one transaction) → admin publishes NAV (one statement per LP) → MFN checks give each LP a verdict without revealing peers' terms → GP grants audit access → admin discloses one account → the "Who holds what" tab shows the per-node contract counts. Hovering any contract highlights it in every pane that holds it.

The UI uses `esbuild-wasm` with a small Node dev server (`ui/scripts/dev.mjs`) rather than Vite, because Windows Application Control on the dev machine blocks Vite's unsigned native bundler binary.

## Simplifications (MVP)

- `Cash` is a test-only settlement token. Swap it for a CIP-56 holding (e.g. a stablecoin) for DevNet pilots.
- NAV is an input signed by the administrator, not computed. NAV share is pro rata to contributed capital. There are no fee or carry waterfalls.
- The GP passes in the list of commitments for calls and NAV. Completeness is trusted to the GP and administrator, the same as off-chain fund admin today.
- An `AuditView` is a snapshot. Withdrawing it stops further visibility, but the auditor's participant has already seen the data. Canton explicit disclosure is the production alternative.
- Portfolio value = latest administrator NAV mark + capital called since, at cost. Distributions after a statement are not netted out until the next NAV.
- Not yet: IRR (needs dated cash flows), LP stake transfers.
