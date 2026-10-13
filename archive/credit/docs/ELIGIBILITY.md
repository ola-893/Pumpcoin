# Evidence-backed eligibility — implementation and demo runbook

## Status and scope

Implemented: versioned payout policy; wallet-signed server challenges; Reclaim SDK verification adapter; persistent sessions/receipts; CRE HTTP → policy → report → EVM workflow; forwarder/workflow-pinned receiver; account deduplication; replay protection; expiry; full-position wallet migration; and automated tests.

**Verified 8 October 2026:** the real CRE CLI v1.37.0 executed the fixture workflow locally and returned the expected ABI-encoded tier-2, 80-pUSD eligibility report. This used synthetic evidence, `writeReport: false`, and no `--broadcast`. No paid DON was deployed. **Still not demonstrated:** authentic Stripe/Reclaim evidence or CRE-originated Monad testnet delivery. The old Monad deployment remains the synthetic manual demo; the changed contracts require a **fresh deployment**.

**Current CLI check (8 October 2026, verified):** user login completed; `~/.cre/bin/cre whoami` succeeds. `workflow supported-chains --output json` includes `monad-testnet`, selector `2183018362218727504`, mock forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192`. Build succeeds with binary hash `442b4003aca170b971a3814b0d4d953ee87e2601dd3c9c43cde6293f574ebf54`. Actual execution exposed two CLI blockers: v1.37.0 rejects empty RPC lists even for this HTTP-only workflow, and rejects `@./file.json` payload syntax. Every target now has an RPC; scripts pass the payload path directly. Local execution succeeded after these fixes. Deployment access is not enabled; it was not needed for the simulation. See [review evidence](CRE-REVIEW-2026-10-08.md).

On 2026-09-24 the workflow compiled to WASM, but `cre workflow simulate` failed before execution because the existing login's token-refresh endpoint returned HTTP 500 (twice). Reauthenticate with `cre login` if needed after that service recovers. SDK capability tests are **mocks**, not a successful CLI simulation or DON consensus.

No compatible provider/proof has been supplied. The real service fails closed without reviewed provider configuration; it does not fall back to fixtures. See [PROVIDER.md](PROVIDER.md).

## Reproducible checks

From the repository root, with Node 22.13+ (SQLite support), Bun 1.2.21+, Foundry, CRE CLI and pinned dependencies:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run cre:test
forge test --root contracts -vv
npm run cre:compile
npm run eligibility:demo
npm run cre:delivery:local
npm run cre:cli-check
```

The last two commands are the CRE review evidence: `cre:delivery:local` runs the full simulation-receiver sequence (report without writes → operator approval of the exact digest → forwarder broadcast) on a disposable Anvil chain with real receipts, labeled LOCAL EXECUTION; `cre:cli-check` runs the real `cre` binary (version, auth, build) and records BLOCKED vs OK, separate from mocked SDK tests.

`eligibility:demo` starts and stops a disposable localhost Anvil chain. It uses random throwaway accounts, **synthetic** normalized facts and a trusted local sender in place of the forwarder. It checks actual local token transfers, report ABI compatibility, replay rejection, fresh-proof same-account rejection, two-wallet migration, expiry, repayment and withdrawal. It is NOT Reclaim verification, CRE CLI execution or public-chain delivery.

### Actual CRE CLI fixture run

Terminal 1:

```sh
npm run eligibility:fixtures
```

Terminal 2:

```sh
npm run cre:simulate:fixture
```

This calls the separate synthetic HTTP server, runs policy in CRE, and returns an ABI-encoded report. `writeReport: false` means **no EVM write**. The committed fixture token is public test data, not a credential. Logs must label this `SYNTHETIC / NOT RECLAIM`.

To test EVM delivery, use the **simulation receiver** described below. Run with `writeReport: false` first, approve the exact returned report digest, then run the same receipt with `writeReport: true` and the receiver/registry addresses and RPC configured. A successful CLI dry run is not a mined transaction; `--broadcast` explicitly enables transactions. Never use a fixture-enabled configuration with real assets. There is intentionally no mainnet target.

### Standalone local policy/delivery tools (no CRE runtime or DON)

These standalone Node tools do not require CRE authentication because they do **not** execute CRE. The real CRE simulator also runs the workflow locally, but requires a CRE login/API key. Login is now complete and the fixture CLI run succeeds. Neither path deploys a paid DON. Do not describe standalone policy execution as a successful CRE run.

For Stripe **test-mode** evidence (authenticated test data, not real earnings): set `ALLOW_RECLAIM_TEST_MODE=true` in the verifier env (see `eligibility/localexec.env.example`) **and** use a workflow config with `allowTestMode: true` (see `cre/eligibility/config.localexec.example.json`). Fixtures stay disabled on both sides — the server hardcodes `allowFixtures: false`, the config sets it `false`, and proof validation (provider pinning, content hashes, TEE attestation, wallet/session binding) is unchanged. Verified by actual execution: fixture facts against the authentic path fail with `Unverified evidence`, and the placeholder example fails closed.

Copy the examples to ignored local files (`eligibility/localexec.env`, `cre/localexec.env`, `cre/eligibility/config.localexec.local.json`) and fill the reviewed provider/deployment values. The standalone delivery receiver must be pinned to an operator-held **EOA forwarder**, with its own signing key; a deployed CRE mock-forwarder contract has no EOA private key and cannot be substituted. Load the ignored operator/forwarder environment locally, then:

```sh
# 1. Generate and save ONE report; reads the configured verifierUrl.
# --out refuses to overwrite existing bytes; use a new file for each receipt.
RECEIPT_ID=... npm run cre:report:local -- --out .local/report.json
# 2. Approve precisely the saved digest using CRE_OPERATOR_PRIVATE_KEY.
npm run cre:approve-report -- --report-file .local/report.json --receiver 0x... --rpc-url https://...
# 3. Read-only preflight using CRE_FORWARDER_PRIVATE_KEY. No transaction sent.
npm run cre:deliver-report -- --report-file .local/report.json --receiver 0x... --rpc-url https://...
# 4. Explicitly broadcast the SAME saved report and confirm all registry fields.
npm run cre:deliver-report -- --report-file .local/report.json --receiver 0x... --rpc-url https://... --broadcast
```

### Simulation-receiver delivery sequence (fully local)

1. **Report without writes.** `npm run cre:report:local` fetches immutable facts from the local verifier, runs the shared payout policy in Node, and prints the ABI-encoded report plus its digest. No EVM writes, no CRE runtime.
2. **Operator approves the exact digest.** `npm run cre:approve-report` computes `digest = keccak256(encodedReport)` and approves only that digest from the receiver's operator key — the contract rejects any other sender, and approval binds exactly one report (consumed on delivery, replay rejected). The script verifies `receiver.operator()` equals the signer before sending and reads back `approvedReports(digest)`.
3. **Broadcast that report.** `cre:deliver-report` verifies the RPC/report chain, receiver/registry/controller wiring, pinned forwarder signer, exact digest approval and report freshness. It defaults to read-only preflight. `--broadcast` submits `onReport`; acceptance requires a successful real receipt, correct transaction sender/destination, matching values for every `registry.eligibility(subject)` field and consumed approval. It labels the result `LOCAL_OPERATOR_CONFIRMED_DELIVERY`, not CRE/DON delivery.

`npm run cre:delivery:local` executes the shipped approval and delivery tools on disposable Anvil, including outsider approval, unapproved digest, wrong-forwarder, read-only preflight and replay checks. Evidence is synthetic and clearly labeled. CRE CLI broadcast still needs a funded testnet signer, authentic receipt, fresh deployment and matching mock-forwarder configuration; authentication alone does not complete those steps.

### Dry runs vs confirmed delivery

The workflow never treats a dry run as delivery and never fabricates a transaction hash. With `writeReport: true`:
- No usable `txHash` (dry run, no `--broadcast`) → returns `{"mode":"DRY_RUN_NOT_BROADCAST","reportDigest":"0x..."}`. Not success.
- Usable `txHash` → requires `txStatus` SUCCESS **and** an explicit successful `receiverContractExecutionStatus`. A **missing** execution status fails closed (`missing receiver execution status`), as does a missing/failed receipt or registry state that does not match the submitted report.
- Only after a real receipt (`status == 1`, hash matches) **and** a matching `registry.eligibility(subject)` readback does it return `{"mode":"CONFIRMED_DELIVERY",...}`. Any explicit revert fails immediately.

## Authentic verifier setup

Keep these values in an ignored environment file, never the frontend:

```dotenv
RECLAIM_APP_ID=REPLACE
RECLAIM_APP_SECRET=REPLACE
RECLAIM_PROVIDER_ID=REPLACE
RECLAIM_PROVIDER_VERSION=REPLACE
RECLAIM_PROVIDER_HASHES=["0xREPLACE_WITH_REVIEWED_CONTENT_HASH"]
SOURCE_ID_KEY=REPLACE_WITH_32_RANDOM_BYTES_AS_64_HEX_CHARACTERS
VERIFIER_API_TOKEN=REPLACE_WITH_A_RANDOM_TOKEN_AT_LEAST_32_CHARACTERS
ELIGIBILITY_CHAIN_ID=10143
ELIGIBILITY_REGISTRY=REPLACE_WITH_NEW_REGISTRY_ADDRESS
ALLOW_RECLAIM_TEST_MODE=false
```

The provider must expose exactly the following **authenticated extracted fields**, all strings: `accountId` (Stripe `acct_...`), `currency` (`USD`), `status` (`paid`), `complete` (`true`), `testMode` (`true` or `false`), `windowStart`, `windowEnd` (Unix seconds), and `totalPayoutCents` (unsigned integer decimal). The window is exactly 90×86400 seconds, with end no later than the signed observation and no more than one day before it. A reviewed provider must establish completeness from authenticated pagination/server aggregation. Merely setting `complete=true` in user input proves nothing; the adapter only accepts the SDK's verified extraction.

Review and pin the provider's exact content hashes as well as its ID/version. The SDK's version-resolution mechanism can include patches; the verifier instead uses the explicit reviewed hash allowlist for content verification. TEE attestation is required. If the selected provider cannot satisfy these requirements, add a reviewed provider-specific adapter—do not disable validation to make a demo pass.

Run `node --env-file=.env.eligibility --import tsx eligibility/server.ts` from the repository root. The service binds **127.0.0.1 only**. Before exposing it remotely, add TLS, per-client rate limits, authentication/abuse controls, deployment secrets management and a privacy retention policy. SQLite lives under ignored `.local/`; protect backups. Reclaim SDK work runs in bounded child processes whose stdout/stderr are discarded to prevent SDK error logs exposing proof data.

API for the collaborator's frontend:

1. `POST /sessions` with `{ "subject": "0x..." }` → `{ sessionId, challenge, expiresAt }`.
2. Wallet signs the returned **exact** `challenge` using EIP-191 `signMessage`.
3. `POST /sessions/:id/authorize` with `{ "signature": "0x..." }` → `{ request, requestUrl }`. Import `JSON.stringify(request)` with Reclaim's `fromJsonString()` and launch verification.
4. `POST /sessions/:id/proof` with `{ "proof": <one authentic Reclaim proof> }` → `{ receiptId, proofHash, status: "verified" }`. Failed proofs return a generic rejection; no raw errors are exposed.
5. Trigger CRE with `{ "receiptId": "..." }`. CRE retrieves immutable verified facts at `GET /facts/:receiptId` using the secret bearer token, derives eligibility, signs a report, and calls the receiver via the EVM capability.

Reclaim secrets and source pseudonymization keys do not enter CRE. The baseline **does disclose normalized payout totals to the verifier and CRE execution environment**; neither raw proofs nor totals go onchain. Private registry deployment is not confidentiality. Source pseudonyms, tiers, wallet links and expiry remain public and linkable.

## Policy and contract guarantees

`keccak256("proofline:payout-policy:v1:test-tokens")` is fixed in the code and registry. Demo thresholds:

| Verified 90-day USD payouts | Tier | Absolute ceiling (six-decimal pUSD) | Collateral LTV |
| --- | --- | --- | --- |
| $100–$999.99 | 1 | 50 | 50% |
| $1,000–$9,999.99 | 2 | 80 | 80% |
| $10,000+ | 3 | 120 | 80% |

These are **test policy constants, not underwriting**. Actual debt ceiling is the lower of the absolute ceiling and collateral-based limit. Both assets are valueless six-decimal demo tokens assumed 1:1; this remains overcollateralized. Below-minimum evidence is rejected, not automatically a revocation of a previously valid credential. There is no liquidation, pricing, interest or production lending risk model.

- Evidence mode is a one-way opt-in on a fresh registry. Legacy manual attestations cannot bypass it. Only the configured credit line may use its allowances or migrate positions.
- First accepted source pseudonym is bound permanently to one wallet. A wallet cannot stack sources. A fresh proof of the same source from another wallet fails even after expiry/revocation.
- Canonical claim digests and server session digests are consumed atomically. The server also persists consumption, so restart does not reset it. CRE can retry reading an immutable receipt; duplicate onchain acceptance fails.
- Source IDs are HMACs of application, Stripe account and test/live namespace, **not wallet, provider version or time window**. Preserve `SOURCE_ID_KEY`; changing it creates a new identity namespace. This prevents source reuse, not multiple legitimate accounts per person or cross-provider double counting. The MVP accepts one Stripe source, not arbitrary sources.
- New observations must be strictly later. Renewal **replaces** eligibility, never adds overlapping payout totals or clears debt.
- Observations must be at most one day old on acceptance. Eligibility expires seven days from the observation, not delivery. At expiry, all new evidence-mode borrowing stops; existing debt remains and repayment always works. No scheduled expiry transaction is necessary.
- Migration consent is enforced by **CreditLine**, not by signature verification in the registry: `requestMigration` records the old wallet's transaction sender and nominated destination; `acceptMigration` requires that destination as the transaction sender. `AttestationRegistry.migrateSubject` authorizes only its configured `positionController`. The deployment script pins this to CreditLine; the root's one-time configuration accepts any address with code, so consent/debt guarantees depend on validating the pinned controller's code and wiring.
- `requestMigration(newWallet)` from the old wallet and `acceptMigration(oldWallet)` from the new one atomically move **all collateral and debt** with the source identity. Destination must have no position/identity. Old wallet is permanently retired for eligibility; old-address reports fail. Migration works after expiry but does not renew eligibility. Total debt/collateral are conserved.
- Existing repayment-vault budgets/grants and ERC20 approvals are NOT migrated. Revoke/withdraw old grants and establish new ones for the new borrower address. Assets already borrowed are not automatically transferred. Loss of the old wallet is not supported by this two-wallet recovery path.

## Receiver and fresh testnet deployment

`EligibilityReceiver` pins the forwarder, workflow ID and workflow owner; validates the 62-byte identity prefix (optionally followed by a two-byte report ID); checks report chain ID/registry; and invokes `submitEligibility`. The constructor can take a zero workflow ID to avoid a workflow-config/receiver-address dependency cycle: reports remain disabled until the registry root calls `pinWorkflowId` once with the final nonzero ID. A nonzero ID cannot be changed.

**CLI simulation uses a mock forwarder without workflow identity metadata.** It cannot use that strict receiver. `SimulationEligibilityReceiver` is the separate, explicitly centralized alternative, constructor-restricted to Anvil/Monad testnet. The operator must call `approveReport(keccak256(encodedReport), true)` for every exact report before the pinned mock forwarder can deliver it; acceptance consumes the approval. It ignores unauthenticated metadata but checks chain/registry. An outsider cannot fabricate a new approved report through the public mock forwarder. This proves transport/contract integration, NOT DON security. Operator approval is an extra test-only transaction, not part of the future authenticated DON flow. Use only valueless tokens.

The registry writer is the receiver contract, **not** the generic Chainlink forwarder. A root controller can rotate back to a self-hosted writer, which must submit the same versioned reports; that changes the trust model. Root remains a powerful trusted role.

`contracts/script/DeployEligibility.s.sol` creates seven fresh test contracts (registry, line, vault, mandate, two tokens and one receiver) and enables evidence mode. For CLI simulation supply `DEPLOYER_ADDRESS`, `CRE_FORWARDER_ADDRESS` (the documented mock), and explicit `CRE_SIMULATION_RECEIVER=true`. For a strict receiver leave that flag false and also supply `CRE_WORKFLOW_ID` and `CRE_WORKFLOW_OWNER`. Do not copy production forwarder assumptions into simulation. Verify addresses/metadata against Chainlink's current [forwarder directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory) and [receiver documentation](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts).

Copy `cre/eligibility/config.monad.example.json` to ignored `config.monad.local.json` and fill real values. `project.yaml` reads `MONAD_TESTNET_RPC_URL`; `cre/secrets.yaml` maps `VERIFIER_API_TOKEN`. `CRE_ETH_PRIVATE_KEY` pays testnet transaction gas during broadcast. Use a dedicated funded testnet wallet and never share keys in chat.

Do not claim a successful authentic integration until you have: a reviewed provider; genuine proof accepted and tampered proof rejected; successful CRE CLI execution; a Monad transaction receipt; and registry/credit-line readbacks. The 65-second architecture video is a concept explainer, not evidence of those steps.

## Dependency notes

SDKs pinned: CRE 1.22.0 and Reclaim 5.8.2. `npm audit` currently reports upstream advisories in the existing agent0/Helia/libp2p dependency tree and Reclaim's uuid dependency. This prototype is not approved for production; no forced downgrade or broad dependency rewrite was made as part of this change.
