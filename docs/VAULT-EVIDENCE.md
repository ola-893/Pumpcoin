# Vault review evidence — local simulation

Reviewed source: `bc14033` plus the uncommitted vault slice and repairs recorded in the source-hash manifest. These checks cover a test-token spot vault on disposable Anvil, administrative price fixtures, scripted manager transactions and a mock ERC-721 identity registry. They do not establish real-money performance, autonomous agent execution, a live price oracle or a production ERC-8004 deployment.

## Executed validation

Run on 10 October 2026 from an isolated copy of the canonical checkout before applying the guarded patch:

```sh
forge test --root contracts -vv
node --import tsx --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p cre/eligibility/tsconfig.json
```

Use Node and Foundry on PATH for the Node suite. Results: **108 Solidity tests passed** (78 historical lending tests and 30 vault tests), **95 Node tests passed**, and both TypeScript checks passed. The baseline is retained separately; lending tests do not establish vault acceptance. Vault coverage comprises 18 existing Solidity tests, 12 new adversarial regressions, 18 off-chain unit tests and 6 receipt-backed Anvil integration tests. Foundry also runs the existing fuzz and invariant tests.

Saved artifacts:

- [Local-chain evidence](../deployments/vault-local-evidence.json): environment, source hashes, deployed addresses, actual transaction receipts, canonical block coverage, opening/closing state, economic logs and replay output.
- [Validation manifest](../deployments/vault-validation-20261010.json): source hashes and result counts.
- [Reproducible journey](VAULT-DEMO.md): commands and assumptions.

The saved addresses refer to a disposable chain that has stopped. Re-run the integration test to create a fresh chain and artifact. Receipt verification trusts the chosen RPC for canonical blocks and state; it is not an independent consensus proof. `parseVaultExport` only parses; `verifyVaultExport` re-collects evidence using externally known deployment coordinates.

## Evidence scope by acceptance group

| Criteria | Executed mechanisms and negative checks | Remaining acceptance limits |
| --- | --- | --- |
| OWN-01–05 | Reconciled marks, liabilities and accounted expense reserves; fair entry/exit across gains/losses; capital and donations excluded from strategy P&L; zero-equity and insolvency issuance rejection; stale/disputed/incomplete gates; rounding/donation fuzz checks. Whole-share prices use explicit decimal scaling. | Price is an administrative fixture, not a manipulation-resistant live feed. This ERC-4626-derived slice intentionally reverts unavailable views and does not claim strict standard conformance. Full time-weighted returns remain open. |
| MAN-01–06 | Restricted exact-transfer spot adapter, bounded approvals and quote-notional caps; partial risk-reducing unwinds; configuration delay and source/venue/stream/identity bindings; no strategy-change bypass via immediate manager rotation; reserves/liabilities cannot be abandoned on stream replacement; investor exit and denied manager calls. | Only one supported 6-decimal quote/position pair and mock spot venue. Administrator pricing, recipient changes, pause/revocation and emergency key rotation remain disclosed trust boundaries. Real venue integration is unverified. |
| PERF-01–04 | Complete transaction-receipt collection with continuity/reorg checks; independent checkpoint/receipt comparison of untrusted exports; missing same-block logs and fake snapshots rejected; loss-preserving periods; stale rotation records unavailable rather than zero; exact expense funding/accrual/settlement/refund accounting and simulation labels. | A single RPC remains a trust boundary. Expense escrow is manually settled, not a timed FlowPay stream. No funded performance or runtime model proof. |
| ID-01–02 | Actual ERC-721 `transferFrom` on the local mock, controller metadata mutation and attempted unauthorized trades; identity ownership does not confer vault authority; old manager key revoked and balances/history preserved. Bindings rechecked at configuration application. | Mock registry is not a full ERC-8004 implementation or public registry deployment. No passkey or production identity integration is demonstrated. |
| PRIV-01–03 | AES-GCM with scoped AAD; wallet-signed one-use challenges with expiry and trusted current on-chain role resolution; cross-investor/vault/operation denials; filtered owner exports; nested public-field allowlists; selective-report signature/domain/payload verification. | Local EOA service library only. HTTP authentication transport, persistent nonce storage, production key custody, passkey/ERC-1271 support and privacy UI remain open. A public serializer does not verify accuracy; signatures authenticate messages, not their historical truth. |

These are **partial acceptance evidence**, not closure of all twenty product criteria. See [the governing acceptance specification](AGENT-VAULT-ACCEPTANCE.md). The complete product still needs genuine agent automation, corrected FlowPay integration, a reviewed deployed registry and venue/feed, frontend/SDK integration, production records infrastructure and an inspectable end-to-end demonstration. No cloud CRE deployment or real-money transaction was performed by this repair.

## Added adversarial regressions

`contracts/test/vault/VaultRegression.t.sol` covers adapter dust, insolvency/zero equity, delayed venue changes, stream reserve/liability preservation, foreign bindings, identity transfer during notice, stale rotation, strategy-change bypass, quote-notional caps/partial unwind, scoped obligation replay and unsolicited escrow donations.

`tests/vault-ledger.test.ts`, `tests/vault-records.test.ts` and `tests/vault-chain-history.test.ts` exercise incomplete/forged economic history, same-transaction companion attribution, current authenticated permissions, selective-signature claims and a complete mined loss-and-expense journey. Assertions and receipt checks, rather than a model's summary, determine the passing results.

## Metadata after the archived run

The frontend/product was renamed PumpCoin on 10 October. Future vault deployments issue `Pump token` / `PUMP`; the archived run used `Unora Vault Share` / `UVS`. Original receipts and source hashes are retained. The new frontend internally reconciles this saved artifact; it does not independently re-read the stopped chain or certify local-LLM execution.
