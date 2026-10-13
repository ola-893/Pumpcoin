# Frontend reconciliation — 2 October 2026

The operating plan is [ARCHITECTURE-CHECKLIST.md](ARCHITECTURE-CHECKLIST.md). This change reconciles the main app with the **legacy manual deployment**, not the undeployed eligibility stack. Authentic provider/proof acceptance, CLI delivery, a fresh testnet manifest and evidence-mode UX remain open P0 work. No new contracts were deployed and no track-specific pitch was written.

## Confirmed checkout and track — 3 October 2026

The user confirmed `/Users/deonorla/Documents/Github/Monad/UNORA` (`ola-893/UNORA`) as the implementation checkout and **Track 04 — Trust, Identity & AI Infrastructure** as the submission direction. The implementation remains here; the separate `Deonorla/UNORA` checkout is not the source of contract or eligibility truth. Selecting Track 04 does not establish compliance with current organizer or integration requirements.

## Migration authorization — committed source, checked 3 October 2026

Both `git diff HEAD -- contracts/src/AttestationRegistry.sol contracts/src/CreditLine.sol` and the deployment/test file diffs were empty. `git show HEAD:contracts/src/CreditLine.sol` contains the two-wallet path already, and the remote main ref matched `bc14033e31d1612edada01063ce0bb27cf13578a`. There is no local-only migration implementation to push.

- `CreditLine.requestMigration` (line 84) stores `migrationRequested[msg.sender] = next` (line 89). The old wallet authorizes the destination through its transaction sender.
- `CreditLine.acceptMigration` (line 93) requires `migrationRequested[previous] == msg.sender` (line 95). Only the nominated destination can accept. It invokes registry migration and moves all collateral/debt in the same transaction (lines 98–105); a revert rolls the entire transaction back.
- `AttestationRegistry.migrateSubject` checks its configured `positionController`; it does **not** independently validate wallet consent or signatures. `DeployEligibility.s.sol` line 36 pins that controller to the deployed CreditLine. These are two wallet-authorized transactions, not two detached signatures verified by the registry.

The precise claim is: **the committed CreditLine migration path requires an old-wallet request and nominated-new-wallet acceptance, with atomic identity/position movement, when the registry is pinned to that CreditLine.** The registry root chooses the controller once when enabling evidence mode and only checks that it has code; the registry alone does not guarantee this behavior for an arbitrary controller contract. Verify the controller's code and wiring in any fresh deployment. This is consensual migration, not lost-key recovery, and it is not a capability of the current legacy manual deployment.

Fresh execution in the implementation checkout of `forge test --root contracts --match-test Migration -vv` passed all three existing migration tests, including 512 fuzz runs for conserved totals. No contract code or tests were changed for this verification.

## Live behavior

- `lib/deployment.json` preserves the existing manifest's addresses and provenance. Imports reject unsupported chain/mode/address configuration. Reads pin Monad Testnet, fetch token symbols/decimals, registry validity, wallet positions, liquidity and vault budget, and check credit-line/vault wiring. Partial or failed reads do not become zero balances.
- Borrowing uses the single collateral/loan pair. Collateral deposit confirms approval and deposit separately; borrowing checks fresh headroom and confirms its own receipt. Integer token amounts reject excess precision and never round through JavaScript floating point.
- Direct repayment and collateral withdrawal are real, separate operations. Withdrawal rounds required collateral upward and retains debt after a credential downgrade. Every mutation checks the current wallet/network, confirms receipt success and refreshes reads. Wallet/network changes reset the mounted personal action state.
- The faucet also waits for a successful receipt before refreshing. Explorer links use submitted or receipt hashes only. Reverted/pending transactions never become successful states through a timer.
- The dashboard shows the registry mapping entry, actual collateral/debt/limit, separate wallet token balances and repayment budget. It does not sum unlike tokens into fictitious USD wealth or show invented yield/history. The capacity graphic is explicitly a current snapshot.
- The tier reference reads CreditLine's base/boosted constants and wallet LTV. The boost requires a **valid payment-processor Tier 2+ attestation**; Tier 3 adds no further LTV. Under the demo's 1:1 assumption, 50%/80% LTV requires 200%/125% collateral relative to debt.
- Repayment-budget UI reuses the existing tested `enableAutoRepay` orchestration. It checks agent ownership, approves/funds only a shortfall, confirms funding before delegating, and exposes cumulative cap, expiry, revocation and unused-budget withdrawal. An authorized agent must make discrete `repayOnBehalf` transactions; this app does not operate a scheduler.
- Credential onboarding reports actual registry status. Self-service authentic verification is visibly unavailable. There is no NFT mint, fake proof success, synthetic transaction hash or claim that authentic CRE delivery happened.
- Public market details identify only the configured pair. Legacy unrelated market URLs show unavailable state. Sponsor URLs redirect to `/roadmap`. Old `?state=` and `?demo=` parameters cannot select mock personal data or generated activity. Activity points to actual wallet/contract explorer data while the indexer is pending.

## Preserved future design

Earlier components, pages and mock models are preserved under `app/Architecture/roadmap/frontend-design`, outside the app's TypeScript build, lint target and live routes. The archive README identifies them as fictional design references. The roadmap page states future scope and contains no financial actions. Landing-page claims and metadata describe the deployed test-token prototype. Privy remains the implemented auth provider; no Mera or sponsor integration is newly claimed.

The prior uncommitted GetScoredPage `max-w-190` styling choice is retained in the replacement page.

## File traceability

| Original affected file | Replacement source |
| --- | --- |
| `LoanRequestStep`, `CollateralLockStep`, `LoanActiveStep`, `BorrowFlow` | `useOnchainPosition`, integer input parsing, fresh `availableToBorrow`, successful borrow receipt |
| `NetSummary`, `PositionsDeck`, `PositionChart`, `TierLadder` | Registry validity/mapping, CreditLine position/constants, token balances, vault budget; no fictional history |
| `Hero` | Factual manual-demo scope; dynamic tier terms are rendered separately from contract reads |
| `lib/portfolio` | Pure derivation of fetched balances, keeping distinct assets separate |
| `BorrowPage`, `MarketDetailPage`, `lib/markets` | One manifest-defined pair; actual liquidity/total collateral/total debt and token metadata |
| `lib/protocol` | Bigint collateral/withdrawal calculations; old score/term/interest/stream data archived |
| `GetScoredPage` | Real credential status; disabled authentic-verification path |
| Sponsor graph, lender tranches, simulated deposit/withdraw dialogs | Future archive; absent from live product and transaction paths |

## Verification and limits

Before frontend changes, remote `bc14033` passed 52 Solidity checks (51 test functions plus one invariant), 15 Node tests and 5 mocked CRE capability tests; root/CRE typechecks passed.

Frontend verification adds collateral-rounding/downgrade, token-precision, manifest-parity and receipt-confirmation tests. The existing five auto-repay tests now exercise the implementation shared with the main app. Fresh execution passed **21 Node tests and 5 mocked CRE capability tests**. Root, CRE and app TypeScript checks passed. The app production build passed; lint passed with the two existing context-export warnings. The build retains SDK bundle-size warnings.

The browser rendered actual public RPC reads: pCOL/pUSD metadata, 920 pUSD liquidity, 100 pCOL total collateral, 80 pUSD total debt, and 50%/80% LTV constants. Landing, public borrow/detail and legacy sponsor redirect were inspected. Unrelated asset URLs report unavailable, and the old dashboard demo parameter reaches actual authentication instead of mock positions. These are observations, not fixed app values.

Browser signing, email/external-wallet acceptance, user rejection and real wallet transaction flows have not been demonstrated in this review. No user's wallet was signed, no new proof was submitted, and no public-chain assets were moved. Automated mocked receipt tests are not a replacement for the checklist's end-to-end wallet acceptance criteria. The full P0 frontend and evidence-to-credit exit criteria remain unchecked.

Pinned root dependencies were installed in the canonical checkout with lifecycle scripts disabled. npm reported 13 dependency advisories (1 moderate, 12 high); dependency remediation was outside this frontend change. No dependency versions or lockfiles were changed.
