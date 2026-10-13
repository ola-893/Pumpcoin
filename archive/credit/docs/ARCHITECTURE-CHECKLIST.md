# Unora — architecture completion checklist

> **Scope update · 10 October 2026:** [Agent-managed investment vault acceptance criteria](../../../docs/AGENT-VAULT-ACCEPTANCE.md) govern new implementation work. This checklist preserves the historical human-backed credit baseline and its evidence gates. Its mandatory human-eligibility/agent-borrowing direction is superseded for the new vault product; existing completion marks do not demonstrate investment-vault acceptance.

Updated 28 September 2026; based on source and recorded results at `9e16c6e`, not fresh public-chain acceptance testing. See the [updated architecture](../app/Architecture/architecture-design.md).

An unchecked task means the complete outcome is not demonstrated, even where part of its code already exists. Owners below are suggested roles, not assignments. P0 completes the honest hackathon vertical slice; P1 completes its supporting services; P2 is the much larger original product. P3 is a separate real-money readiness gate.

Frontend progress on 2 October 2026 is recorded in [FRONTEND-RECONCILIATION.md](FRONTEND-RECONCILIATION.md). The main app now targets the existing manual deployment with real position/actions and separates future designs. This does not close the fresh evidence-mode deployment, authentic verification or end-to-end wallet acceptance criteria below.

Confirmed by the user on 3 October 2026: the implementation checkout is `/Users/deonorla/Documents/Github/Monad/UNORA` (`ola-893/UNORA`), and the submission direction is **Track 04 — Trust, Identity & AI Infrastructure**. Keep implementation work in that checkout. Track selection does not close the organizer/integration-requirements acceptance task below. Migration authorization and its controller-configuration boundary are documented in [FRONTEND-RECONCILIATION.md](FRONTEND-RECONCILIATION.md#migration-authorization--committed-source-checked-3-october-2026).

Scope authority: the [original architecture north star](../app/Architecture/roadmap/architecture-north-star.md) preserves Unora's long-term vision. ProofLine is its financial eligibility oracle; the original ScoreRegistry role is already served by AttestationRegistry. This checklist governs live hackathon work. Evidence-backed eligibility does not bring P2 tranches, sponsor graphs, streams or reserves into P0.

## Already implemented — do not rebuild these

- [x] Registry root-controlled oracle rotation/revocation; legacy synthetic Monad deployment recorded.
- [x] Test-token credit line with collateral custody, borrowing, direct/third-party repayment and withdrawals.
- [x] Scoped repayment vault with isolated budgets, cumulative grants, expiry and revocation; reusable auto-repay component.
- [x] Wallet-signed sessions, Reclaim verification adapter, exact provider-hash pinning and persistent receipts.
- [x] Versioned payout tier/ceiling policy; CRE HTTP/policy/report workflow; strict and simulation-specific receivers.
- [x] Evidence-mode account binding, proof/session replay protection, expiry and debt-preserving wallet migration.
- [x] Oracle ERC-8004 registration/reconciliation tooling and local-fork verification.
- [x] Envio ABI-based event configuration generator; not a complete indexer.
- [x] Privy provider integration, default dashboard contract reads, faucet mint calls and live direct-repayment code.
- [x] Local contract, policy, binding and mocked CRE tests; synthetic local-chain lifecycle and WASM compilation.

## Agent-operated demo direction — additive P0 requirement (3 October 2026)

The human eligibility pipeline below remains mandatory in full. The agent becomes the main demo character; its working-capital rule executes independently under human-backed credit. See [AGENT-CREDIT.md](AGENT-CREDIT.md) for local receipts and commands.

- [x] New sibling `AgentCreditMandate`; restricted additive `borrowFor`; cumulative cap/expiry/revoke; funds to agent and debt to human. Original repayment vault is unchanged. Eighteen new mandate tests pass.
- [x] Separate running worker signed draw and repayment without an intervening human submission, plus cap/revoke transactions mined as reverts. **Evidence is disposable local Anvil with synthetic facts**, not public acceptance.
- [x] Agent-focused frontend code: Mera passkey session, real proof authorization/submission, digest-matched reload-safe receipt, fresh manifest validation, collateral setup, grant/revoke, real agent event reads and both-wallet migration. This check denotes implementation; device and fresh-chain browser acceptance remain open.
- [ ] Complete original P0 authentic evidence/CRE/fresh Monad integration and failure cases below, including shared source-account/debt continuity. Nothing in the local agent run closes these.
- [ ] Execute the Mera-onboarded human grant → unattended **Monad** agent draw/repay → agent-signed cap rejection → human revoke → agent-signed revoke rejection sequence. **Done when:** public receipts/readbacks establish signer, custody, human debt and bounds; no human click substitutes for agent execution.
- [ ] Complete Mera device creation/recovery, rejection, reload, expiry and migration/grant cleanup against the fresh stack. **Done when:** real device signing works without a seed prompt and every displayed confirmation matches chain state.

The mandate consumes eligibility; it does not need a second oracle ERC-8004 registration. Existing oracle identity tooling remains separate. No agent-native reputation, leverage, pricing or liquidation work enters this scope.

## P0 — complete the evidence-to-credit demo

### 1. Real evidence — backend / proof integration

- [ ] Select or build a Reclaim provider that authenticates the account, paid status, USD currency, test/live mode and complete 90-day payout coverage. Decide the window's timestamp semantics and prove pagination or server-aggregate completeness. **Done when:** the reviewed extraction specification satisfies `docs/PROVIDER.md` and `eligibility/reclaim.ts`, not just a dashboard screenshot.
- [ ] Pin the provider ID, version and reviewed content hashes; configure the app, rotated secret, stable source-ID key and verifier token outside source control. **Done when:** startup fails closed for missing/unreviewed values and secrets never enter the browser or logs.
- [ ] Obtain a genuine proof through a real wallet-authorized session. Test tampering, different wallet/app/destination, wrong session/provider, expiry, incomplete data and test/live mismatch. **Done when:** the genuine case produces an immutable receipt, all negative cases fail, and a server restart cannot reset consumption. A genuine test-mode proof is integration evidence, not real earnings.

### 2. CRE and fresh testnet contracts — backend / contract integration

- [x] CLI authentication and actual fixture execution completed on 8 October 2026 with CLI v1.37.0. Real local WASM execution produced the tier-2, 80-pUSD encoded report after fixing missing RPC configuration and payload-file syntax. Synthetic evidence, writes disabled; no public-chain delivery or DON. See `docs/CRE-REVIEW-2026-10-08.md`.
- [ ] Deploy a fresh evidence-mode stack on Monad testnet using the explicit simulation receiver and documented mock forwarder. **Done when:** receipts, bytecode, root, receiver/oracle, designated credit line, tokens and vault wiring are independently read back and saved in a new manifest. Do not overwrite the legacy record without preserving its provenance.
- [ ] Run the authentic receipt through CRE with writes disabled, approve its exact report digest, then rerun with broadcast enabled before evidence expires. **Done when:** a successful transaction and receiver/registry readbacks match the report and failed receiver execution is not displayed as success.
- [ ] Fund only valueless pUSD test liquidity and demonstrate actual collateral deposit, borrowing, repayment and withdrawal against the new deployment. **Done when:** token balance deltas and debt match confirmed transactions, not UI timers.
- [ ] Demonstrate fresh-proof same-account rejection from another wallet, canonical replay rejection, expiry/renewal and two-wallet migration with outstanding debt. **Done when:** total debt/collateral are conserved; migration creates no extra credit; expired evidence cannot enable new borrowing.

### 3. Connect the main app — frontend collaborator + backend

- [ ] Replace hardcoded old deployment addresses with a validated, chain-specific manifest and matching ABIs. **Done when:** UI addresses match the new registry/credit-line/vault and a wrong network/configuration blocks writes.
- [ ] Replace `GetScoredPage` timers and random transaction hashes with wallet signing, Reclaim request/proof submission, receipt status, CRE delivery status and confirmed registry reads. Define who triggers the authorized workflow; a manual CLI trigger is acceptable if disclosed for the demo. **Done when:** rejection, pending, failure and confirmation are truthful and reload-safe.
- [ ] Replace simulated borrow/collateral actions with approval → confirmed deposit → borrow, and wire actual collateral withdrawal. **Done when:** receipt failures cannot show success and all amounts/limits come from contract state. A collateral withdrawal is not an LP withdrawal.
- [ ] Correct NFT, confidentiality, “live pool,” streaming and undercollateralization claims wherever only fixtures exist. **Done when:** the app says credential rather than NFT, identifies previews, hides fake explorer links and explains the demo's actual 50%/80% LTV model.
- [ ] Keep unimplemented tranche deposits/withdrawals and sponsor actions visibly disabled or explicitly preview-only. **Done when:** no simulated lending action is presented as moving funds or earning a yield.
- [ ] Add evidence-mode UX: absolute ceiling, expiry, renewal, no-evidence borrowing block and both-wallet migration. **Done when:** moving a wallet cannot hide debt and the user is warned that vault grants, approvals and wallet tokens do not migrate automatically.
- [ ] Integrate the existing auto-repay component into the main app. **Done when:** approval/funding precede delegation, cap/expiry/revoke/unused-budget withdrawal are usable and no UI promises an operated scheduler before one exists.

### 4. End-to-end evidence and submission — team

- [ ] Run browser acceptance tests for Privy email/external wallets, wrong network, rejection, reload, empty state, expiry and failed transactions. **Done when:** the actual app completes the source → eligibility → borrow → repay path; contract tests alone are insufficient.
- [ ] Record the authentic proof-verification result without private proof contents, CLI output, public transaction hashes and contract readbacks. Update the runbook with reproducible commands and versions. **Done when:** another teammate can reproduce the demo without receiving secrets.
- [ ] Confirm the hackathon's current Chainlink track requirements with the organizer, including whether local simulation plus broadcast meets the integration requirement. **Done when:** the submission describes exactly what ran; do not equate a simulator/mock receiver with live DON consensus.

**P0 exit criterion:** a reviewer can follow one authentic, wallet-bound evidence receipt to a mined eligibility report and actual credit-line token movements, then observe source-reuse rejection and debt-preserving migration. Frontend previews remain labeled. This completes the focused prototype, not the original undercollateralized product.

## P1 — complete supporting services

- [ ] **Indexer:** implement Envio entities, handlers, persistence and GraphQL; add `EligibilityAccepted`, `EvidenceModeEnabled`, `SubjectMigrated`, `MigrationRequested` and `PositionMigrated` coverage alongside existing events. Test reorg/replay idempotency, address migration and expiry-derived state. Count `CreditLine.Repaid` once, not again through payer/vault events.
- [ ] **Frontend data:** replace generated activity, score history and other purported live values with indexed or contract-backed data. Keep genuinely planned market/sponsor data in a separate preview mode. Acceptance: the displayed event has a real chain/transaction/log identity.
- [ ] **Evidence service operations:** add TLS, an explicit browser-origin/CORS policy, rate limits, appropriate authentication, resource limits, secret management, encrypted storage/backups and retention/deletion rules before remote exposure. Acceptance: proof/session data and SDK error details are absent from logs and backups can be restored safely.
- [ ] **Workflow orchestration:** implement an authenticated trigger/status path with idempotent jobs, bounded retries and failed-delivery reconciliation. Acceptance: the same receipt cannot result in additional credit, and UI status follows confirmed chain state rather than an HTTP acknowledgement.
- [ ] **Repayment worker:** operate a narrowly scoped scheduler if auto-repay is retained. Handle gas, insufficient budgets, expired/revoked grants, changed debt and migration. Acceptance: no generic spending authority and no repeated debt reduction for a retried job. Do not call a voluntary missed attempt a contractual default until such terms exist.
- [ ] **Oracle identity:** provide a real HTTPS status endpoint, choose root custody, register/synchronize the service on the intended testnet and operate the watcher. Acceptance: rotation/revocation preserve one agent identity and expose stale-card drift; borrower identity remains separate.
- [ ] **Recovery operations:** rehearse compromised-writer revocation, pending-report reconciliation, database recovery, stable source-key restoration and migration grant cleanup. Acceptance: recovery cannot mint a new source identity or erase debt unintentionally.
- [ ] **Optional DON launch:** only if required and authorized, arrange access/budget, use the authenticated forwarder and strict receiver, finalize the workflow ID, and perform real multi-node delivery tests. This is not mandatory for the local-simulation P0 scope. No quote is treated as permanent pricing.

## P2 — build the original full Unora architecture

Complete these only if retaining the original undercollateralized/sponsored-lending scope; they are not prerequisites for showing the narrower ProofLine prototype.

- [ ] **Risk specification:** define supported borrowers/assets, evidence meaning, loss bearer, initial and growth limits, confidence/staleness handling, and policy versioning. Acceptance: an explicit specification distinguishes verified facts from creditworthiness assumptions.
- [ ] **Behavioral scoring:** implement reproducible scoring from actual repayment, liquidation and account history. Add evaluation data and manipulation tests. Nansen or other enrichment is optional until justified and integrated; labels alone must not determine trust.
- [ ] **Cross-chain liabilities:** build supported-chain/protocol adapters and freshness/failure policies. Acceptance: omitted/unknown data are not reported as zero debt, and the UI states coverage limits.
- [ ] **Velocity and aggregate exposure:** enforce growth and simultaneous outstanding exposure limits across supported positions, including migration and renewals. Test small-loan farming, circular funding, parallel requests, repeated payout windows and multiple-account attackers. The original `max(...)` formula is not a completed defense.
- [ ] **SponsorGraph:** implement consent, genuinely reserved capacity or funded collateral/bonds, revocation rules, cycle/collusion controls and bounded total exposure. Acceptance: one unit of sponsor backing cannot secure unlimited borrowers or be withdrawn while exposed.
- [ ] **LendingPool:** implement LP ownership/share accounting, deposits/redemption, utilization/rates, caps and conservation invariants. If tranches remain, define senior/junior claims and withdrawal restrictions. Existing `fundLiquidity` must not be advertised as redeemable LP capital.
- [ ] **Asset valuation and liquidation:** define supported assets, decimal/value conversion, pricing freshness and failure modes, liquidations and collateral realization. Acceptance: limits use defensible asset values, not the demo's assumed 1:1 pCOL/pUSD ratio.
- [ ] **Loan terms and defaults:** implement loan-specific principal/interest, due dates, grace periods, partial payments and objective default transitions. Decide whether discrete repayments suffice; implement a StreamManager only if continuous streaming is still a requirement.
- [ ] **ReservePool and loss allocation:** define reserve funding, custody, draw limits, collateral recoveries, sponsor losses and tranche-loss waterfall. Acceptance: an end-to-end default test accounts for the shortfall without creating phantom value or unbacked guarantees.
- [ ] **Closed-loop updates:** connect actual repayment/default events to rescoring and sponsor/reserve calculations. Acceptance: updates cannot erase existing debt, apply incompatible policies retroactively or double-count a payment.
- [ ] **Frontend full-product integration:** replace market, yield, stream and sponsor fixtures only once the corresponding contracts/services exist. Acceptance: every displayed financial quantity traces to a real contract state or clearly labeled estimate.

## P3 — separate security and real-money readiness gate

- [ ] Threat-model the verifier, provider trust, CRE delivery, root custody, identity namespace, source-account sale, collusion and cross-protocol debt. Explicitly document residual centralization.
- [ ] Independently review contracts, verifier and dependency advisories; expand fuzz/invariant and adversarial integration testing. Historical test counts are not an audit.
- [ ] Validate risk assumptions, economic stress/loss scenarios and operational recovery before any real-asset launch; obtain appropriate legal/privacy review for the intended use and jurisdiction.
- [ ] Define monitoring, incident response, signer access, change control, upgrade/migration policy and release rollback. Test root/writer failures and stale evidence without bypassing repayment safety.

## Explicit product decisions, not hidden implementation promises

- [ ] Decide the timing and economics of P2 expansion while retaining Unora as the umbrella product and ProofLine as its eligibility foundation. The north star remains; finish P0 before expanding implementation scope.
- [ ] **Borrower identity stretch only:** decide whether ERC-8004 reputation adds value beyond the current credential mapping. No separate ScoreRegistry/SBT is required for P0. Specify transfer detection, re-verification and source/debt continuity before implementation; detection alone does not prevent identity sale. See [identity boundaries](ORACLE-IDENTITY.md#borrower-identity-stretch-goal).
- [ ] Decide whether lost-key recovery is required beyond consensual two-wallet migration; if so, specify authorization and debt continuity before building it.
- [ ] Decide whether Unlink/ZK privacy research belongs in a later release. There is no integrated implementation here. Any privacy upgrade must retain account-use constraints and debt continuity and explicitly state what the verifier learns.

Suggested execution order: authentic provider/fixture → CLI execution → fresh testnet deployment/report → frontend vertical slice → failure-case demo → P1 services. Risk/default economics must precede a real undercollateralized P2 launch.
