# PumpCoin agent registration

Implemented 11 October 2026. Registration is available through the same local Vite dev/preview server as model discovery. Hosted static builds cannot inspect or register a visitor's local runtime without this helper.

## Working local flow

1. Prepare the deployment declaration and public strategy/limits.
2. Check the running local model. The helper remeasures its artifacts, calls only its literal loopback `/v1/chat/completions` endpoint with bounded JSON output, then rechecks artifacts. The synthetic input deliberately has stale data, no valuation and no funds. A deterministic guard returns HOLD regardless of an unsafe BUY/SELL suggestion. No tools, keys, live market data or transactions are supplied.
3. With the encrypted signer configured, prepare the agent execution wallet and sign only the controller authorization. The helper verifies it, then signs the execution enrollment itself. Existing external signers can still supply an execution signature. The browser verifies the pasted signature and the server verifies both signatures independently. Mera uses its existing PRF signing path. Never paste a private key into the application.
4. Complete local registration. The record is stored in `.local/agent-registrations/`, with directory mode 0700 and files mode 0600. Portfolio lists these signed records after reload. Records retain every signed version; the controller/chain/name-derived local ID is a local namespace, not an ERC-8004 token ID.

Each signature binds the origin, role, chain, exact public manifest commitment, private configuration commitment, server-generated 256-bit nonce and ten-minute expiry. The worker check must be within two minutes at completion; it can be refreshed within the same session without reusing a consumed nonce. The helper rechecks the current model before persistence. Concurrent completion, replay, changed declarations, mismatched roles, expired checks and changed artifacts fail closed. A consumed or restarted helper session cannot reuse signatures for another registration.

Private runtime endpoint data stays in the private server record. Exported registration receipts contain the signed messages and public manifest, plus scoped local inference evidence. They exclude the endpoint, filesystem paths and all private keys. Public declarations remain immutable `unpublished-draft` bytes; the separate receipt records successful local registration without silently upgrading the manifest's evidence level.

This is a local registration and a one-shot inference/guard capability check, not proof that the declared strategy source executed, a deployed worker, a backtest, independent runtime attestation, network egress isolation, performance verification or investment eligibility. The local host/operator remains trusted. Registration alone does not permit investor deposits or trades. The separate [autonomous trading workflow](AUTONOMOUS-TRADING.md) adds controller-approved on-chain permissions and a headless execution process.

## Public identity and vault binding

Set `PUMPCOIN_BINDING_CONFIG` to an operator-controlled JSON file and restart the local Vite server. The file supplies `chainId`, `mode`, `rpcUrl`, `identityRegistry`, `identityCodeHash`, `vault`, `vaultCodeHash`, `adapter`, `adapterCodeHash`, `venue`, `venueCodeHash`, `quote`, `position`, and `pair`. Addresses must be checksummed/nonzero, and hashes must be the reviewed runtime-bytecode keccak256 values, including deployed immutables. Only chain 10143 (`monad-testnet`) or explicit loopback chain 31337 (`local-simulation`) is accepted. The current browser signer supports Monad testnet only; local-chain signing is a backend test capability.

For an ERC-1967 identity proxy, also pin `identityImplementation` and `identityImplementationCodeHash`. The helper reads its implementation slot and rejects missing/mismatched implementation pins. Beacon proxies are rejected. Other contract pins require reviewed direct deployments; code hashes are not a substitute for reviewing proxy/delegatecall behavior. A single configured RPC is trusted; block-hash rechecks detect an inconsistent/reorganized snapshot, not a dishonest RPC.

After local registration, the form can prepare and simulate an ERC-8004 identity transaction containing a base64 data URI with the exact public declaration. It exports the transaction for the controller to review and submit. Enter an existing owned identity ID before preparing a configuration update to use `setAgentURI` on the same token; previous signed local versions remain visible. The identity/vault preparation helper does not sign, send or pay for controller transactions. The separate autonomous worker signs manager trades only after permission is granted. ERC-8004's payment wallet defaults to the registration owner; this flow does not claim to set it to the execution signer. Vault manager authority is checked separately.

Enter the minted identity ID to verify the configured deployed vault. All reads use one anchored block and pinned runtime code. Checks cover identity owner and exact token URI, vault admin/controller and manager/execution roles, registry/token ID, strategy/risk commitments, actual trade/exposure limits, quote/position tokens and decimals, adapter/vault/pair/venue binding, pause/revocation state and final block hash. Identity transfers or authority/configuration changes fail a fresh check; historical receipts remain explicitly point-in-time records.

To bind this declaration through the existing vault's governed configuration procedure, use:

- `strategyHash = keccak256(UTF8(manifest.strategy.codeDigest))`.
- `riskHash = keccak256(UTF8(JSON.stringify(manifest.proposedMandate)))`, using the exported field order.
- Actual six-decimal quote caps equal the exported `perTradeQuoteUnits` and `maxPositionQuoteUnits`.
- The configured registry and minted token ID, plus the declared controller/admin and execution/manager addresses.

The administrator must apply the existing notice procedure; the verifier does not bypass it, create a vault, alter approvals or grant permissions. The legacy live-binding verifier requires both tokens to have six decimals. Dedicated registration supports a six-decimal quote and a six- or eighteen-decimal position token, starting with unavailable valuation. Eighteen-decimal WMON registration does not establish a live pricing source or reviewed trading integration. A matching risk hash commits to declared slippage but does not establish on-chain slippage enforcement. Binding alone does not verify prices, venue suitability or profitability. `investmentEligible` remains false.

The optional legacy live-binding deployment is not configured by default. Dedicated vault creation uses the separate network configuration below. Registration remains `vault pending` until a successful deployment is verified.

## Validation

`tests/agent-registration.test.ts` covers signature substitution and domain binding, nonce replay/expiry, manifest/private-config tampering, stale/changed models, paper guards, response limits/format, persistence/restart, HTTP origin/token/body restrictions, pinned bytecode and proxy implementation checks, transferred identity, changed vault permissions/limits/tokens and reorganized snapshots. Existing wallet, discovery and frontend regression tests also pass.

A browser run used two disposable EOAs and the actual local Qwen3.8 27B server. It rejected a wrong-role signer, refreshed stale worker evidence, completed both role authorizations and local registration, and verified Portfolio persistence. The raw model output and guarded output were HOLD/0. No user private keys, user signatures, real identity mint, funded vault, real trades or transaction broadcast were used. Public binding tests use an injected RPC fixture; they are not a live Monad deployment proof.

Protocol references: [llama-server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004), [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967).


## Dedicated vault creation and recovery — 12 October 2026

The local dev/preview server loads `deployments/pumpcoin-vault-network.json`, or the path in `PUMPCOIN_VAULT_NETWORK_CONFIG`. It pins Monad testnet chain 10143, the ERC-8004 registry proxy and implementation, the quote token and WMON position token. Changed bytecode, implementation, chain or decimals block preparation and confirmation. Build the reviewed contracts with `forge build --root contracts` before preparation.

After both local authorizations are saved, open the agent profile and select **Review vault deployment**. The helper simulates a controller deployment of `PumpCoinRegisteredVault`. Its constructor creates the dedicated vault and identity, transfers the identity to the controller, binds the execution manager and signed commitments, and starts paused with no adapter and unavailable valuation. It does not fund the vault or establish investment eligibility.

**Create identity & vault** requests one zero-value creation transaction from the matching controller on Monad testnet. The user approves it in their wallet and pays gas. The helper never signs or broadcasts. Browser wallets and Mera passkeys can submit controller deployment and permission transactions directly; external signing tools can use exported deployment data and hash recovery.

The browser saves a submitted hash before confirmation. **Verify deployment** checks an existing transaction without sending another one. Exact constructor input, successful receipt, canonical block, normalized runtime, pinned network contracts, identity owner/URI, roles, commitments, caps and the initial safety state must match. The helper persists a historical binding. Repeating confirmation of the same saved transaction is idempotent. Later signed versions with the same local agent identifier cannot create a second vault through this flow; update the existing vault through its governed procedure. The confirmation lock covers one local helper process, not a distributed service.

First activation preserves the one-day configuration notice. Only the explicitly unvalued bootstrap with no shares or liabilities may close an unvalued initial period; donations cannot freeze activation. The replacement source must be healthy and match the position decimals. Prior history remains recorded. A later unhealthy source cannot reuse this exception. Live valuation, restricted venue integration and funded strategy execution remain pending.

Validation on 12 October: 37 vault Solidity tests passed, including seven dedicated-registration regressions. The targeted 15 Node tests passed, covering real Anvil deployment/confirmation, signed-store persistence/restart, duplicate-vault rejection across versions, substituted transactions/runtime/network pins and wallet-change guards. Anvil fixtures are local simulation evidence. Live Monad preparation succeeded for klaris; its saved authorizations are intact, but its controller had 0 MON and could not deploy. No public vault transaction was submitted.


Final continuation checks: all **115 Solidity tests** and **139 Node tests** passed. Root, CRE and frontend production typechecks passed; Vite produced the production bundle. The complete contract build also passes after moving the historical `ManualDemo` script's locals into a memory struct to avoid a Solc 0.8.24 via-IR stack error. The Vite Node typecheck includes DOM declarations for its imported shared browser manifest helpers. The local preview runs with Node 22 directly because the system npm launcher currently fails to load a Homebrew library.
