# PumpCoin frontend rebuild

11 October 2026. The purple/lilac palette, Newsreader serif headings, Jakarta body type, rounded navigation and restrained surfaces are retained. All visible product content and routes have been rebuilt around agent-managed investment vaults.

| Route | Implemented behavior |
| --- | --- |
| `/` | New investor/operator proposition and accountable-vault ownership explanation |
| `/agents` | Search and filter the archived demonstrator; empty state for live vaults |
| `/agents/local-vault` | Actual archived NAV, P&L and flows; mandate, identity and evidence tabs; Pump-token share illustration with integer virtual-share math |
| `/markets` | Read-only real Monad GeckoTerminal pool data; missing values, stale snapshots, request timeout/rate-limit/error states; no fallback fabricated prices |
| `/register` | Three-step mandatory local-model declaration, artifact hash and execution-key validation; public/private draft exports, browser-local save/restore |
| `/portfolio` | Explicit unavailable position-read state; saved operator draft export/removal |
| `/proofline` | Agent-performance archive, separated verification levels, Mera/browser-wallet connection, explicitly reviewed ownership signature and public receipt export |
| `/evidence` | Saved local receipts including mined rejections, checkpoints, source commitments and downloads |
| `/how-it-works` | Identity/evidence/enforcement distinctions, Pump-token ownership, inference policy and open acceptance gates |

Wallet connection supports Mera passkeys and browser EOAs, and requests no signature. ProofLine separately offers an explicitly reviewed read-only ownership signature. See [wallet boundaries and validation](PROOFLINE-WALLETS.md). Browser-wallet connection requests only public accounts. It does not send transactions, approvals, deposits or registration signatures. Public investment and registration remain disabled, with the reason shown before any claim of completion. Draft preparation is a frontend input policy, not server admission or proof of actual inference. The local runtime URL is excluded from the public manifest commitment; private keys and proprietary prompts are never requested.

Real DEX adapters, token-decimal support, reliable NAV valuation, public deployment, local-model agent worker, signed admission, production records service and real-device passkey acceptance remain open. Live mainnet market data does not turn archived local execution into live trading evidence. FlowPay streaming is deferred.

Historical UI pages and providers are removed from `app/src`. Lending helpers required by existing tests moved to `frontend/legacy-browser/`; their original behavior remains separate. Source still uses the historical `UnoraVault` class and immutable NAV policy domain, with new share metadata `Pump token` / `PUMP`. Do not rewrite historical evidence to pretend it used the new metadata.

## Checks

Production build, root/CRE/frontend TypeScript checks, lint, new frontend unit tests and historical browser-helper regressions. Browser checks cover search/filtering, exact archived metrics, invalid allocation input, disabled funding/registration, rejection of hosted inference, manifest export, draft save/restore, receipt filters, provider failure, modal dismissal and mobile navigation/overflow at 390px. The browser market success path uses a captured real provider response for reproducibility; its failure path injects HTTP 429. Manual screenshot review covers desktop and mobile.

Production build, both root TypeScript checks, frontend TypeScript and lint passed. All 108 Foundry tests and 16 browser checks passed. Screenshots and the browser check record are in `docs/testing/pumpcoin-frontend-20261011/`.

The ordinary full Node command is blocked in two integration files because their `forge build --root contracts` also compiles historical deployment scripts. An unchanged-checkout build reproduces the same Solc 0.8.24 via-IR Yul stack exception. This is not a passing full deployment build. Contract-only integration results are recorded separately; no deployment-script behavior was changed for this frontend rebuild.

All 102 Node tests passed with a temporary test-only `forge` wrapper adding `--skip script` to `forge build`. Test bodies were unchanged. The standard `npm test` still encounters the pre-existing script compile failure; excluding it is not a deployment fix.
