# Klaris testnet trading and deposits

This integration targets the existing dedicated vault and immutable WMON / test-USDC pair on Monad testnet (10143). It adds deployment and wallet controls; no live activation, public investment eligibility, autonomous trading, or profitable performance is implied. The signed onboarding strategy remains paper-only. Manual manager transactions are identified separately from execution of that strategy.

## Mechanisms

- `PythVaultValuationSource.sol`: independent MON/USD divided by USDC/USD, positive prices, at most 300 seconds old, no future timestamps, confidence at most 100 basis points. Missing feeds or unsupported exponents fail closed. No administrative price injection or stale cache. Anyone may update Pyth using authenticated data.
- `DexCheckedPythVaultValuationSource`: the hook-free pool must be initialized, have active liquidity, pass a 100 test-USDC virtual quote-reserve screen, and differ from the reference mark by at most 5%. A virtual reserve is a liquidity screen, not a promise of executable depth across ticks. Every trade is simulated and also checked by the contract.
- **Decimal convention**: the existing vault computes `positionBaseUnits * price / 1e18`, including sell-cap checks. For 18-decimal WMON and a 6-decimal quote, MON = 2 USDC produces `price = 2e6`, not `2e18`. This is a deployment-specific supplement to the six-decimal local fixture policy; fiat prices are references for valueless test tokens, not redemption values.
- `UniswapV4VaultVenue`: one fixed pool key, fee and tick spacing; zero hooks, no arbitrary calls, no native spending, no persistent pool-manager approvals. Only this vault’s restricted adapter may call it. Output goes directly to the vault. Callback identity and payload are bound; partial fills, wrong settlement amounts and output discrepancies revert. The minimum output is the stricter of the caller’s minimum and the oracle mark less the signed slippage ceiling.
- `VaultInvestorGateway`: one immutable vault, investor receives shares/cash, exact incoming transfer, minimum shares/assets and deadline, no administrator or sweep. Vault allowance is exact and cleared after deposits. Exits require an exact share approval and the vault’s available quote liquidity.
- `VaultTradingBundle`: controller-only infrastructure creation. It neither proposes configuration nor unpauses. It has no investor custody or administrator powers. Propose/apply retains the existing one-day notice, original identity, manager, strategy/risk commitments, caps, zero expense budget and history.

The server pins the network, external bytecode, Pyth and identity implementations, and reviewed vault/infrastructure artifacts. Readiness is checked at a named canonical block, not inferred from the historical registration receipt. RPC requests are paced for the public endpoint. The configured RPC and upgradeable external contracts remain trust boundaries. No continuous availability guarantee is claimed.

## Operator steps

1. Obtain a Pyth API key from [Pyth Terminal](https://pythdata.app). Put `PUMPCOIN_PYTH_API_KEY=...` in ignored `app/.env.local`, and restart the local Vite server. Never use a `VITE_` prefix, paste the key into chat, or commit it. The server sends it only in the Authorization header to the fixed official Hermes endpoint. See [Pyth’s authentication instructions](https://docs.pyth.network/price-feeds/core/upgrade/preparing).
2. Open the latest agent profile, expand **Controller setup and manual testnet actions**, connect the controller, choose **Refresh authenticated oracle prices**, and review the simulated wallet transaction. This is a separate permissionless Pyth update; it pays only the bounded update fee (maximum 0.001 MON) plus gas. No private key is handled by the server.
3. Use **Deploy trading infrastructure**, then verify the mined hash. The hash is saved before any receipt check. The verifier checks exact creation input, controller, value, canonical receipt and artifact before saving the deployment. A saved bundle survives restart and blocks repeat deployment planning.
4. **Propose configuration**, then wait one day. This starts the notice; no funds are approved or moved. **Apply configuration** only after the notice and healthy valuation; **Enable the configured vault** only after live checks pass. Pausing remains a separate controller action.
5. Investors approve the exact deposit amount, then deposit test-USDC. Exits approve exact Pump tokens, then redeem. Both enforce a 0.1% minimum-output tolerance and five-minute deadline. A stale or paused vault blocks share operations; insufficient quote liquidity blocks an exit. There is no liquidation or withdrawal queue.
6. Connect the separately authorized manager for manual buy/sell transactions. Trade amounts are quote units for buys and WMON units for sells; the backend and contracts enforce caps, recipient, deadline, oracle floor and exposure. This does not start the local model as an autonomous trader.

Each wallet transaction is prepared and simulated separately. User approval occurs in the wallet. Submission hashes remain recoverable; receipt verification never resubmits. Do not discard a pending hash and send another deployment. Exported plans support another signing tool, while browser-wallet submission is available directly.

## Live observation, 12 October 2026

The older documented v3 router and factories returned empty code. The current Monad ecosystem registry lists v4 infrastructure (explicitly described there as not an official Uniswap deployment). Its pinned PoolManager is `0x451D64ab3b650040d2aE1886602b97ed6eDc643d`; the hook-free 0.3% WMON / existing test-USDC pool ID is `0x5e65fc6c6777578390f275a30690331f2f3bd3a51bf63fdaeaaea7087ed836b7`. It is initialized and had active liquidity, but about 2.531268 test-USDC of virtual quote reserves, below the 100-unit screen. MON pricing was stale. The unauthenticated Hermes update request returned HTTP 401. Klaris remains paused with zero investor shares, quote cash and WMON at the observed block. Fresh checks may differ.

No testnet transaction was submitted during this implementation. There is no activated trading bundle or successful live deposit/trade receipt. A fresh price update alone does not fix inadequate pool liquidity or a divergent pool price. A suitable real testnet route must pass the declared checks; do not relabel a mock pool as that route or relax pricing to fabricate readiness.

Sources: [Monad oracle deployment](https://docs.monad.xyz/tooling-and-infra/oracles), [Monad testnet v4 registry](https://github.com/monad-crypto/protocols/blob/main/testnet/uniswap_v4.jsonc), [Uniswap v4 PoolManager interface](https://github.com/Uniswap/v4-core/blob/main/src/interfaces/IPoolManager.sol).

## Executed verification

- `forge test --match-path 'test/vault/*.t.sol' -vv`: 47 vault tests passed, including ten new v4/valuation/gateway checks and 512-run donation/conservation fuzz coverage.
- `node --import tsx --test tests/vault-trading.test.ts`: three market/pool/wallet regressions passed.
- `node --import tsx --test tests/vault-trading-service.test.ts`: receipt-backed Anvil deployment, persistent confirmation/restart, notice, activation, exact approvals, investor deposit, manager buy/sell, investor exit, stale-price rejection and code-pin rejection passed. The local fixtures use valueless tokens, a scripted manager and injected oracle/pool state. They do not prove real-pool profitability or live autonomous execution.
- Full Solidity suite and all 143 Node tests passed. Root and frontend TypeScript checks and Vite production build passed. The profile’s live readiness display was verified through the browser.
