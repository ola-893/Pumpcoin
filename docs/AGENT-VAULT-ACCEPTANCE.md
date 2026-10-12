# PumpCoin — agent-managed investment vault acceptance criteria

Accepted product direction: 10 October 2026. **Specification accepted; the local vault slice has partial executed evidence. Full product acceptance remains open.** PumpCoin is the product. FlowPay streaming is deferred for this MVP.

> PumpCoin lets investors allocate capital to identifiable AI trading agents through vaults with enforceable mandates and verifiable performance records.

Investors own vault shares. The agent is the manager; the vault holds capital. Returns are distributions or share redemptions subject to the rules, not repayment of borrowed principal or guaranteed interest. Trading is the initial use case; the product links identity, investment authority and independently inspectable performance evidence.

This document governs new vault work and supersedes the lending build direction in the historical architecture checklist and the separate agent-credit pivot proposal. Preserve existing credit code, tests and receipts as a labeled baseline. They do not demonstrate investment-vault acceptance.

## Historical source baseline before vault implementation

Read-only inspection on 10 October found CreditLine, RepaymentVault, AgentCreditMandate, eligibility/CRE tooling, an agent-credit SDK and oracle-identity tooling. RepaymentVault manages borrower repayment budgets; it is not an investment-share vault. Oracle registration does not establish manager registration or vault authority. No share vault, investment valuation engine, strategy-period performance reconciler or encrypted-record access layer was found in the inspected implementation.

Existing human-backed loan tests and local receipts are historical evidence for those mechanisms only. No vault checks existed at that initial inspection. The subsequent local slice and adversarial repair results are recorded below; this historical snapshot does not describe the present source.

## Separate responsibilities

| Responsibility | Purpose | Cannot establish by itself |
| --- | --- | --- |
| Identity registration | Identify the agent, controller and declared configuration | Trading authority, actual runtime version, complete performance or creditworthiness |
| Evidence verification | Verify a specific historical statement within a declared scope | Future returns, account access or enforcement of an investment mandate |
| Vault enforcement | Restrict transactions and changes affecting capital | Honesty of off-chain reports, task quality or profitable strategy |

Do not collapse these into one trusted badge. Attach evidence status to each claim: operator claimed, signature verified, execution verified, independently checked, or unavailable/inconsistent. A verified signature authenticates the signer/message, not every statement inside it.

## Initial implementation boundary

One agent, one vault, one quote/accounting asset, one on-chain spot venue, allowlisted assets and restricted adapters, an explicit expense budget, test tokens and no leverage. Start without performance fees. Open positions still require a reliable documented valuation source even when deposits/redemptions use one quote token. Deliberate local price fixtures are simulation evidence, not a live price feed.

Use a reviewed ERC-4626 implementation/interface where appropriate; the interface does not provide the trading strategy's valuation or risk policy. If assets cannot be liquidated on demand, choose and disclose a request/settlement redemption policy rather than promising instant exits. ERC-7540 is a reference for asynchronous requests, not a mandatory MVP addition.

Before vault implementation, freeze: supported chain/token behavior, pricing source/freshness rules, allowed venue/adapters/assets, exposure and expense budgets, administrator powers, configuration-change procedure, and redemption timing. Restrict unsupported fee-on-transfer/rebasing tokens unless explicitly accounted and tested.

## Acceptance matrix

Test IDs define product requirements, not automatic passing labels. Each row now has partial local-simulation evidence mapped in [VAULT-EVIDENCE.md](VAULT-EVIDENCE.md); none is marked complete for the full product while the listed deployment, integration and privacy gates remain open.

| ID | Claim and mechanism | Required adversarial test | Required artifact |
| --- | --- | --- | --- |
| OWN-01 | Document NAV policy: cash, marked positions, accrued liabilities/expenses, reserves and valuation assumptions. Explain how it maps to share issuance/redemption. | Reconcile balances and independent marks to reported NAV; include negative P&L and an accrued expense exactly once. | Policy version/hash, observed block/time, position and liability breakdown, reconciliation output. |
| OWN-02 | Mint/burn shares at a consistent valuation under explicit rounding, initialization and slippage rules. | Investors enter before/after a gain or loss; later capital does not dilute the existing investor's economic interest. Reject deposits producing zero shares. | Receipts, pre/post assets and shares, previews and actual outcomes. |
| OWN-03 | Separate capital flows from performance. | A deposit or distribution cannot appear as strategy profit/loss. Check per-share returns and period P&L across flows. | Cash-flow ledger and documented return calculation. |
| OWN-04 | Reject deposit/redemption execution when valuation is stale, incomplete, disputed or unreliable. Display unknown/stale status rather than a fabricated price. | Stale/missing/manipulated price and unavailable position data block share transactions; pending requests never silently settle at a guessed NAV. | Rejection evidence, valuation status, recovery and redemption procedure. |
| OWN-05 | Defend share accounting against rounding and donation/initial-deposit manipulation. | Small initial deposit, direct token donation, large victim deposit, dust redemption and repeated round trips cannot steal shares/value under the stated design. | Boundary/fuzz results and initializer/virtual-share policy. |
| MAN-01 | Vault retains custody. Manager has a limited trading capability, not generic transfer, withdraw, delegatecall or administrator access. | Unauthorized direct transfer, withdrawal, generic call and privileged configuration operation fail. | Access-control map, receipts/reverts, balance checks showing no leakage. |
| MAN-02 | Restricted adapters validate venue, tokens, spender, recipient, method, amount, deadline and acceptable output. | An allowlisted router with a malicious recipient, arbitrary encoded payload or wrong token cannot move value outside the vault. | Adapter specification and malicious-call regression results. |
| MAN-03 | Approvals are bounded and accounted for throughout their lifecycle. | Indirect spender pulls, stale approvals after key/adapter revocation and malicious multicall combinations cannot bypass the mandate. | Allowance snapshots and adversarial token/spender tests. |
| MAN-04 | Enforce exposure, per-trade and service-expense limits on chain using declared valuation assumptions. | Oversized trades, split-call limit bypasses and streams to an operator-controlled unapproved recipient fail. | Effective configuration/hash and cumulative-budget/exposure state. |
| MAN-05 | Explicit administrator, upgrade, emergency and change powers; no hidden unrestricted escape hatch. | Manager cannot broaden policy or upgrade; administrator actions follow the documented notice/approval procedure. Emergency authority cannot silently transfer capital to arbitrary addresses. | Role/upgrade report, change events and tests for each permitted power. |
| MAN-06 | Investor redemptions are independent of manager fund-extraction privileges. | Manager cannot redeem investor shares without authorization; legitimate investors follow documented liquidity/queue rules. Pauses do not masquerade as available instant exits. | Successful investor exit and denied manager redemption evidence. |
| PERF-01 | Reconcile complete vault history within a stated chain/block scope, including trades, flows, expenses, valuations and configuration changes. | Missing, duplicate, reordered or reorged data produce an unavailable/inconsistent report; every report identifies its coverage. | Replayable event export, canonical block hashes, independent balance checks and report version. |
| PERF-02 | Configuration periods bind vault, agent identity, controller/keys, strategy/model declaration and effective risk policy. | A strategy/operator/key change opens a new period; prior losses/history remain. A new name or model hash cannot reset the vault track record. | Linked periods with start/end blocks, hashes, events and net results. |
| PERF-03 | Costs are included in net performance; reserved, refundable, accrued and settled stream amounts are distinct. | Funding a stream does not double-charge an expense; cancellation/refunds reconcile; fake payment hashes do not prove service expenditure. | Service quote, token/recipient, stream state, accrual policy and actual payment/refund receipts. |
| PERF-04 | Distinguish operator claims, signed records, simulated execution, actual funded execution and independent checks. | A backtest or test-token profit cannot become a funded real-money performance badge. A signed model-version claim cannot become proof that this model executed. | Claim-level evidence labels, signer/method/scope and demo environment disclosure. |
| ID-01 | Explicit vault manager and configuration binding distinct from identity ownership. | Transfer the ERC-8004 registration; the recipient gains no vault execution/withdrawal/admin capability. | Registry transfer receipt and rejected new-owner vault call. |
| ID-02 | Key/controller/identity-wallet changes use vault-specific authorization, revocation and configuration periods. | Identity-wallet metadata mutation alone grants no authority; revoked keys and old nonces/signatures cannot execute. Funds, shares and history persist across approved rotation. | Rotation/revocation receipts and preserved-state assertions. |
| PRIV-01 | Authenticated encryption of private records with a documented threat model, key custody and nonce policy. | Wrong key, tampered ciphertext and unauthorized role cannot access strategy records; secrets are absent from API responses, logs and public metadata. | Encryption/access design and negative access/integrity test evidence. |
| PRIV-02 | Scoped access, owner exports and disclosed public information. | An investor exports their permitted records and independently checks the disclosed performance package without obtaining private strategy records. Unauthorized cross-investor exports fail. | Access matrix, public evidence package, export example and disclosure page. |
| PRIV-03 | Selective evidence is not mislabeled as cryptographic private verification. | A signed selective report displays its verifier/trust boundary; a claimed ZK/TEE/runtime proof needs its own verification mechanism and tests. Public trades/share balances remain disclosed as observable. | Evidence-method description and reproducible verification, if claimed. |

## Valuation and performance rules

Share accounting must include all managed value according to the documented policy, not just the quote-token balance after buying another asset. Record the valuation source and block/time. A stale last-known value may be displayed as stale, but cannot authorize a new transaction under OWN-04. If using ERC-4626, define compatible view/max/preview behavior during unavailable valuation; do not claim conformance while allowing interfaces to contradict actual transaction limits.

For an illustrative fee-free period with no unaccounted transfers:

`net P&L = closing NAV - opening NAV - investor deposits + investor withdrawals/distributions`

This is a cash-flow reconciliation, not a substitute for time-weighted/share-based returns when investors enter at different times. Report definitions, unrealized versus realized results and period boundaries explicitly. Actual share conversions additionally follow the chosen implementation's rounding/initialization policy.

Illustration: 1,000 units backing 1,000 shares become 1,200 units backing the same shares. An original holder of 100 shares is worth 120 before costs. A later deposit of 120 units receives 100 shares at that price; NAV is 1,320 with 1,100 shares, and the original holder remains worth 120. The deposit created capital, not profit. Then demonstrate a losing period and an expense, not only an injected favorable price.

Unwind/slippage, liquidity and oracle manipulation matter independently of share arithmetic. Execution-time exposure checks do not guarantee exposure remains below a threshold as markets move. Specify permitted risk-reducing actions and fail-safe behavior when pricing is unreliable. A negative return is not a loan default.

If performance fees are later enabled, add separate acceptance criteria for a cash-flow-adjusted/per-share high-water mark, crystallization timing, prior loss recovery, fee share dilution, entry/redemption fairness and rounding. Recovering a loss or adding investor capital must not manufacture fee-bearing profit.

## Strategy periods and identity

Bind provenance to the vault and effective configuration, not only a name/NFT. Record declared strategy/model version, permitted venues/assets, risk and expense limits, controller/authorized keys, start/end block/time and results under that configuration. Performance before a spot-to-derivatives change must not be presented as validation of the derivative strategy.

ERC-8004 registration or wallet metadata does not automatically authorize a manager. Transfer may pause management pending review under a declared policy, but must never silently authorize the new owner. Ordinary investor-share transfers do not grant management permissions either. Runtime verification is separate from a declared model-version commitment.

## FlowPay and ProofLine responsibilities

FlowPay proposes budgeted operating-expense payments for data, inference, analytics and execution infrastructure. It does not calculate investor ownership or trading profit. The reviewed FlowPay baseline's token-as-recipient routing, hash-only payment acceptance, weak stream authorization and in-memory spending caps need fixes before capital integration. Verify recipient/token/chain/scope, actual settlement and replay protection. A UI pause is not vault enforcement.

ProofLine may verify specific off-chain evidence and publish versioned attestations; on-chain events should be checked directly. Oracle identity tooling is reusable infrastructure, not already registered trading-manager evidence. Private verifiers can see records they receive; encrypted storage or hashes alone do not make proof generation private to them. Avoid importing mandatory human Stripe eligibility or loan repayment into the vault proposition.

## Demonstration and evidence bundle

1. Show the registered agent, declared strategy, effective on-chain mandate and administrator boundaries.
2. Investor A deposits and receives shares; record NAV and the initial configuration period.
3. Agent submits a permitted trade; an unauthorized transfer and indirect approval bypass fail with no asset leakage.
4. Show a gain, then Investor B entering at the current share value. Deposits do not increase profit.
5. Show a losing period and a real operating-expense settlement. Reconcile net assets and investor share value.
6. Change strategy or keys through the approved procedure. Open a new period and retain prior losses, expenses and history.
7. Transfer the agent registration; prove the new identity owner cannot trade or withdraw from the existing vault.
8. Make valuation unavailable; deposit/redemption attempts fail under the disclosed policy. Restore reliable valuation and complete a legitimate investor exit.
9. Export the public evidence package and an authorized investor export. An investor checks the metrics without private strategy records.

Each test bundle records source commit, exact command/test ID, chain and deployment, block range/hashes, input assumptions, execution mode, receipt status, expected/actual balances and configuration/policy versions. Fixtures, local Anvil, public testnet and real-money execution are separate labels. Where an independent verifier is used, identify who verified what, by which method and under what trust assumptions. No one attestation substitutes for complete scoped accounting.

## Implementer instruction

Build the investment vault vertical slice against this matrix. Begin with documented valuation/share rules, investor deposit/redemption and an isolated restricted spot adapter; test OWN and MAN boundaries before adding agent automation. Add manager identity/configuration bindings and loss-preserving performance replay, then add scoped encrypted records. Timed FlowPay integration is deferred. Preserve the lending baseline separately.

The review packet must map each claim to source mechanism, executed test and inspectable artifact. Leave criteria UNVERIFIED until that evidence is provided. A profile, SDK method, registered NFT, passing old credit tests or dashboard badge cannot close a vault row. Do not expand the slice to leverage, unsecured credit, multi-venue trading or a marketplace.

## References

- [ERC-4626: Tokenized Vaults](https://eips.ethereum.org/EIPS/eip-4626) — share interface and required accounting/rounding behavior; strategy logic is an implementation responsibility.
- [ERC-7540: Asynchronous Vaults](https://eips.ethereum.org/EIPS/eip-7540) — reference if redemption needs requests and later settlement.
- [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) — draft identity/reputation/validation interfaces; identity ownership is not vault authority.
- [Historical architecture checklist](ARCHITECTURE-CHECKLIST.md), [current agent-credit baseline](AGENT-CREDIT.md), [historical submission demo](SUBMISSION-DEMO.md).

## Review update — 10 October 2026

The isolated spot-vault implementation now has executed local evidence: 108 Solidity tests and 95 Node tests pass, including 12 added Solidity regressions and six receipt-backed Anvil tests. Root and CRE eligibility typechecks pass. [VAULT-EVIDENCE.md](VAULT-EVIDENCE.md) records mechanisms, artifacts and limits for each criteria group.

The review repaired insolvency and zero-equity issuance, adapter dust denial, unbound configurations, notice bypass through strategy rotation, abandoned expense reserves, falsely valued stale periods, share-price scaling, incomplete/forged receipt replay and caller-supplied privacy authorization. Unsolicited tokens in expense escrow cannot inflate vault NAV. These results establish tested local boundaries, not completion of the product matrix.

Keep the remaining build sequence narrow: reviewed live venue/valuation and ERC-8004 integration; genuine agent automation; frontend/SDK and evidence explorer; deployed authenticated records service with production keys. Validate each integration against these criteria before changing its claim label. Historical human-credit eligibility/CRE mechanisms remain separate and do not become mandatory human proof in the vault user flow.

## Product rename and frontend policy — 10 October 2026

The product is PumpCoin. Each investment vault's investor shares are Pump tokens (`PUMP`), scoped to that vault. New contract deployments use the new token metadata; the pre-rename archive remains historical evidence with its original metadata.

All new MVP AI-agent registrations require self-hosted inference with downloaded weights and no hosted fallback. The rebuilt frontend prepares an unsigned local-only manifest with exact artifact commitments and separate controller/execution-key addresses. It does not publish a registration, verify host execution, or grant investment eligibility. Controller signatures, server-side admission, nonce/chain/vault binding and a constrained runtime still require implementation and adversarial tests.

Real public market data informs analysis, not investor-share valuation by itself. Keep mainnet market snapshots separate from local/simulated execution. FlowPay streaming is explicitly out of the present scope.
