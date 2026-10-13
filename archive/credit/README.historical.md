# Unora

**Accepted direction · 10 October 2026:** agent-managed investment vaults with enforceable mandates and verifiable performance. FlowPay supplies the proposed operating-expense payment layer. The [vault acceptance matrix](docs/AGENT-VAULT-ACCEPTANCE.md) governs new work; this vault product is not implemented or verified by the existing credit tests.

**Vault vertical slice · simulation evidence:** valuation/share accounting, restricted spot execution, manager identity bindings, loss-preserving periods, corrected expense path, and scoped encrypted records are implemented with executed adversarial tests. See the [NAV policy](docs/VAULT-NAV-POLICY.md), [access-control/adapters](docs/VAULT-ACCESS-CONTROL.md), [records design](docs/VAULT-RECORDS-DESIGN.md), [evidence bundle](docs/VAULT-EVIDENCE.md), and [demo script](docs/VAULT-DEMO.md). Lending baseline preserved: full `forge test` passes 96/96 (78 baseline + 18 vault) and `npm test` passes 80/80. Persistent-chain deployment, testnet receipts, and independent verifier readbacks remain open.

## Current implemented baseline — human-backed agent credit

A human proves financial eligibility and grants a capped, expiring, revocable mandate. An independent agent operates working-capital draws and repayments with its own key; debt and collateral remain human-backed. ProofLine provides the financial eligibility oracle.

**Verified locally:** a separate unattended worker signed an actual draw and repayment, plus two mined rejection transactions, using synthetic evidence on disposable Anvil. **Still pending:** authentic Reclaim → CRE → fresh Monad deployment, real Mera device acceptance and public agent execution. See [scope, receipt evidence and worker runbook](docs/AGENT-CREDIT.md). The original synthetic manual deployment remains unchanged; this requires a fresh seven-contract stack.

## SDK, oversight and judge demo

The local developer-preview package is [@unora/agent-credit](sdk/README.md). Build with `npm run sdk:build` and pack from `sdk/`; it is not published to npm. The browser-safe client reads one-block state and confirmed history, signs enrollment and submits bounded agent draws/repayments with an agent wallet. The independent worker shares its history collection and reconciliation.

The website's `/developers` route provides integration and demo instructions; `/agent-credit` provides human controls and reconciled monitoring. The landing page separates the locally tested agent stack from the existing manual testnet deployment. [The reproducible judge guide](docs/SUBMISSION-DEMO.md) states the exact evidence and remaining acceptance gates. `npm run agent:demo` now saves an SDK readback alongside the independent worker receipts.

## Evidence-backed workflow (new)

See [implementation, trust boundaries and runbook](docs/ELIGIBILITY.md). The real CRE CLI v1.37.0 successfully executed the fixture workflow locally on 8 October 2026; this used synthetic evidence with writes disabled. Run `npm run eligibility:demo` for the disposable local-chain lifecycle demo, `npm run cre:test` for mocked SDK tests, and `npm run cre:simulate:fixture` for actual CRE execution after starting `eligibility:fixtures`. Evidence mode needs fresh contracts. [The independent review](docs/CRE-REVIEW-2026-10-08.md) records the local execution and subsequently resolved event-reconciliation fixes.

## Run it locally

Requires Foundry and Python 3. Dependencies are pinned to OpenZeppelin Contracts **v5.4.0**, forge-std **v1.10.0**, and Solidity **0.8.24** (Paris EVM target).

```sh
cd contracts
forge install --root . foundry-rs/forge-std@v1.10.0 OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge test --root . -vv
python3 script/local-demo.py
```

The demo starts its own Anvil chain on a random local port, deploys five contracts, broadcasts a manual attestation, verifies receipts and token balances, checks expiry and delegated repayment, saves `deployments/local.json`, and stops its chain. It needs no secrets or real funds. Its addresses are **local addresses, not Monad deployments**.

The visible result is 100 pCOL deposited → 50 pUSD base borrowing limit → manual Tier 2 credential → 80 pUSD limit → 80 pUSD actually borrowed. A further borrow reverts. When the credential expires, the limit drops to 50 while debt remains 80.

## Contracts

- `AttestationRegistry`: one active credential per wallet, authorized writer, fixed root controller, rotatable/revocable writer, 30-day maximum validity, revocation, and consumed proof-hash tracking. Events never include the raw payout figure.
- `CreditLine`: deposit, borrow, repay, withdraw, and dedicated demo liquidity funding. Tier 2 or Tier 3 payment-processor credentials increase LTV from 50% to 80%. Every borrow/withdraw checks the current credential.
- `DemoToken`: two freely mintable six-decimal test tokens, pCOL and pUSD. The separate loan-token pool ensures lending does not spend deposited collateral.
- `AgentCreditMandate`: human-owned cumulative draw caps, expiry/revoke and independent agent-key draws/repayments. `borrowFor` is restricted to the root-pinned mandate; proceeds go to the agent and debt stays human-backed.
- `RepaymentVault`: isolated borrower budgets, scoped agent keys, cumulative caps, expiry, revocation, and unused-budget withdrawal. It can only call the immutable credit line's `repayFor()`. See [repayment design and frontend flow](docs/REPAYMENT.md).

`maxBorrow(user)` is the **total debt ceiling**. `availableToBorrow(user)` is remaining headroom capped by pool liquidity. Expiry/revocation do not erase existing debt or disable repayment. Withdrawals cannot leave debt above the current limit.

Both tokens are assumed to have equal unit value; equal decimals alone do not establish that value. There is no price oracle, liquidation, interest, or LP withdrawal mechanism. Liquidity funding is a demo contribution, not an investment. Use only these valueless test tokens.

Root control uses `rotateOracle()` / `revokeOracle()` and emits `OracleRotated`. See the [rotation and recovery runbook](docs/ORACLE-OPERATIONS.md). The current Solidity suite passes 78 tests (including 23 mandate tests), with 512 cases for each fuzz test and 8,192 invariant calls. The local demo then repays 10 pUSD through a capped grant, verifies 70 pUSD remaining debt, and withdraws the unused budget.

From this directory, with Node 22.9+:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run oracle:fork-demo
```

The last command requires internet and Anvil. It reads Monad's existing ERC-8004 contracts into a disposable local fork, tests real SDK registration/rotation/revocation, and saves `deployments/oracle-fork.json`. Its transactions stay on localhost. See [oracle identity operations](docs/ORACLE-IDENTITY.md) and [Envio configuration](indexer/README.md).

## Monad testnet deployment

Testnet chain ID **10143**, supplied RPC `https://testnet-rpc.monad.xyz` (chain ID checked). Replace the RPC with an Alchemy endpoint when available. A funded signing account is still required; Reclaim credentials cannot sign EVM transactions.

1. Copy `.env.example` to `.env`, fill `DEPLOYER_ADDRESS`, and fund its testnet MON via <https://faucet.monad.xyz>. Use a Foundry keystore. Omit optional root/writer variables to default them to the deployer for the manual demo.
2. From `contracts`, load your local configuration and deploy using your own keystore alias:

```sh
set -a
source ../.env
set +a
cast chain-id --rpc-url "$MONAD_TESTNET_RPC_URL"
forge script script/Deploy.s.sol:Deploy --root . \
  --rpc-url "$MONAD_TESTNET_RPC_URL" --sender "$DEPLOYER_ADDRESS" \
  --account YOUR_KEYSTORE_ALIAS --broadcast --slow
```

3. Save the printed addresses in `.env`, reload it, then run:

```sh
forge script script/ManualDemo.s.sol:ManualDemo --root . \
  --rpc-url "$MONAD_TESTNET_RPC_URL" --sender "$DEPLOYER_ADDRESS" \
  --account YOUR_KEYSTORE_ALIAS --broadcast --slow
```

The deploy and manual-demo scripts reject chains other than 31337 and 10143. The manual demo requires a fresh position and the deployer as temporary writer. It intentionally uses a **synthetic proof hash**, not an income proof. Do not describe this step as verified income.

The Monad testnet deployment is recorded in [deployments/monad-testnet.json](deployments/monad-testnet.json). Its five creation receipts succeeded, bytecode is present at every address, and the credit-line and repayment-vault wiring have been read back from chain. Derive Envio's future start block from the registry deployment block **63,709,337**. The testnet demo also completed with 100 pCOL collateral, 80 pUSD debt, an 80 pUSD limit, and a valid Tier 2 payment attestation. Its attestation is intentionally synthetic and is not verified income.

## Privacy and trust boundaries

The registry trusts its writer. The deployed milestone-1 demo does not verify a TLS session, income, wallet ownership, or unique personhood. Its consumed hashes only prevent exact canonical-proof replay. The new evidence mode adds source-account binding and controlled wallet migration, but it still does not establish unique personhood or prevent multiple legitimate accounts/collusion.

The future baseline exposes the extracted total to the off-chain verification environment and publishes the wallet, tier, source category, expiry, and proof digest. A tier still reveals a financial range. Never hash only a low-entropy amount as `proofHash`; use the validated canonical proof identifier and a versioned domain. Raw figures, proofs, sessions, and API secrets must not appear in public logs, indexer entities, or browser bundles.

For CRE integration, deploy a receiver adapter that validates the Chainlink forwarder **and** the expected workflow identity; then rotate `registry.oracle` to that adapter. The registry is intentionally independent of CRE's transport. Merely setting `oracle` to a forwarder EOA/address is not a working CRE integration.

## Next milestone

Reclaim provider selection/build and authentic proof generation remain the next integration gate. See [provider requirements](docs/PROVIDER.md), [eligibility runbook](docs/ELIGIBILITY.md), and [verified integration notes](docs/INTEGRATION-NOTES.md). Borrower ERC-8004 identities remain deferred.
