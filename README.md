# PumpCoin

PumpCoin lets investors inspect identifiable AI trading agents and their investment mandates, then allocate capital through dedicated vaults. Investor vault shares are called **Pump tokens** (`PUMP`). Each vault issues its own Pump tokens; ownership and returns belong to that vault.

**MVP policy:** new agents must use self-hosted, downloaded model weights. No hosted-model API or hosted fallback. A declared hash, local URL or signature is not proof of actual model execution. Registration evidence levels must remain explicit.

## Current product

The frontend has been rebuilt around investment vaults: agent discovery, profile/mandate/identity views, an evidence explorer, a real Monad market-data page, a portfolio and local-model deployment draft onboarding. It preserves the purple/lilac visual theme while removing the previous lending journeys.

- **Real read-only data:** GeckoTerminal's public Monad pool endpoint. Provider failures and stale snapshots are displayed; no fixture prices are substituted.
- **Archived execution evidence:** a stopped, disposable Anvil run with valueless tokens, scripted manager transactions and injected marks. The browser reconciles the supplied archive internally; it does not independently establish its provenance or re-read that stopped chain.
- **Draft onboarding:** automatically detects a local macOS llama-server, streams a SHA-256 calculation of its loaded GGUF, hashes a manifest of its mapped native runtime, and recovers a pinned source from a matching local download record. It still requires a strategy digest, isolated public keys and self-hosted confirmation. Exports are unsigned, unpublished drafts. These measurements come from the operator-controlled host, not independent execution attestation. Server admission, signature verification and on-chain registration are not connected.
- **Investment unavailable:** no public vault deployment, real DEX execution or deposit/approval transactions are enabled in this frontend.

The contract remains named `UnoraVault` for source continuity; newly deployed shares use `Pump token` / `PUMP`. The saved pre-rename archive retains its original `Unora Vault Share` / `UVS` metadata. No historical receipts or policy commitments were rewritten to imply a new deployment.

## Run the frontend

```sh
cd app
npm install
npm run dev
```

Routes: `/`, `/agents`, `/agents/local-vault`, `/markets`, `/register`, `/portfolio`, `/evidence`, `/how-it-works`. A BrowserRouter deployment needs an SPA fallback for deep links. Public data uses the browser network; all other demo evidence is served as static public JSON. No private key or API secret belongs in the browser bundle.

## Validation

```sh
cd app
npm run build
npm run lint
cd ..
npm run typecheck
npm test
forge test --root contracts -vv
```

Node and Foundry must be on PATH for chain integration tests. [Frontend scope and validation](docs/PUMPCOIN-FRONTEND.md), [vault acceptance criteria](docs/AGENT-VAULT-ACCEPTANCE.md), [NAV policy](docs/VAULT-NAV-POLICY.md), [vault authority](docs/VAULT-ACCESS-CONTROL.md) and [archived evidence](docs/VAULT-EVIDENCE.md) explain mechanisms and limits.

## Next gates

Signed self-hosted agent admission and a genuinely running local-model worker; restricted real DEX adapter and token-decimal handling; reliable valuation; reviewed ERC-8004 and public vault deployment; production private-record access. FlowPay streaming is deferred. Share ownership is not a lending obligation or a promise of fixed returns.

Historical credit/eligibility/CRE source, SDK and tests remain as a separate baseline. Browser-only legacy calculation/auth helpers moved to `frontend/legacy-browser/` so the old regression tests continue running without shipping old UI content. See [historical credit documentation](docs/HISTORICAL-CREDIT-README.md); those mechanisms do not establish vault-product acceptance.
