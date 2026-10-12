# Klaris testnet trading and deposits

**Active configuration:** Supra MON + Pyth USDC is now selected on Monad testnet. See [current setup and validation](SUPRA-PYTH-TESTNET.md). The Chainlink setup and observations below document the earlier investigation; they do not describe the active network configuration or the latest Klaris vault.

This integration targets the existing dedicated vault and immutable WMON / test-USDC pair on Monad testnet (10143). It adds deployment and wallet controls; no live activation, public investment eligibility, autonomous trading, or profitable performance is implied. The signed onboarding strategy remains paper-only. Manual manager transactions are identified separately from execution of that strategy.

## Mechanisms

- `ChainlinkVaultValuationSource.sol`: standard `AggregatorV3Interface` reads of independent MON/USD divided by USDC/USD. No oracle API key, subscription or user-triggered price update. Positive, complete rounds must be at most 300 seconds old, with valid start/update times and no future updates. Proxy/aggregator addresses, runtime hashes, feed descriptions and decimals are checked both by the server and source contract. Feed upgrades fail closed and require reviewed replacement infrastructure. Missing feeds block deployment; no administrative price injection or cached mark.
- `ChainlinkVaultValuationSource`: the hook-free pool must be initialized, have active liquidity, pass a 100 test-USDC virtual quote-reserve screen, and differ from the reference mark by at most 5%. A virtual reserve is a liquidity screen, not a promise of executable depth across ticks. Every trade is simulated and also checked by the contract.
- **Decimal convention**: the existing vault computes `positionBaseUnits * price / 1e18`, including sell-cap checks. For 18-decimal WMON and a 6-decimal quote, MON = 2 USDC produces `price = 2e6`, not `2e18`. This is a deployment-specific supplement to the six-decimal local fixture policy; fiat prices are references for valueless test tokens, not redemption values.
- `UniswapV4VaultVenue`: one fixed pool key, fee and tick spacing; zero hooks, no arbitrary calls, no native spending, no persistent pool-manager approvals. Only this vault’s restricted adapter may call it. Output goes directly to the vault. Callback identity and payload are bound; partial fills, wrong settlement amounts and output discrepancies revert. The minimum output is the stricter of the caller’s minimum and the oracle mark less the signed slippage ceiling.
- `VaultInvestorGateway`: one immutable vault, investor receives shares/cash, exact incoming transfer, minimum shares/assets and deadline, no administrator or sweep. Vault allowance is exact and cleared after deposits. Exits require an exact share approval and the vault’s available quote liquidity.
- `ChainlinkVaultTradingBundle`: controller-only infrastructure creation. It neither proposes configuration nor unpauses. It has no investor custody or administrator powers. Propose/apply retains the existing one-day notice, original identity, manager, strategy/risk commitments, caps, zero expense budget and history.

The server pins the network, external bytecode, Chainlink proxies and underlying aggregators, identity implementations, and reviewed vault/infrastructure artifacts. Readiness is checked at a named canonical block, not inferred from the historical registration receipt. RPC requests are paced for the public endpoint. The configured RPC and upgradeable external contracts remain trust boundaries. No continuous availability guarantee is claimed.

## Operator steps

1. Verify both Chainlink feed proxies for the actual network and configure their underlying aggregator/runtime/decimal pins in `deployments/pumpcoin-trading-network.json`. Do not use mainnet addresses on testnet or substitute a price from another token. A missing feed is represented explicitly as `null` and blocks deployment.
2. Open the agent profile and refresh readiness. Chainlink pushes updates automatically; there is no oracle-key entry or price-update transaction. Both feeds must satisfy the existing five-minute freshness policy, and the fixed pool must pass its liquidity and price checks. An offchain RPC read consumes no gas; submitted transactions consume normal MON gas. RPC providers may have their own limits or fees.
3. Use **Deploy trading infrastructure**, then verify the mined hash. The hash is saved before any receipt check. The verifier checks exact creation input, controller, value, canonical receipt and artifact before saving the deployment. A saved bundle survives restart and blocks repeat deployment planning.
4. **Propose configuration**, then wait one day. This starts the notice; no funds are approved or moved. **Apply configuration** only after the notice and healthy valuation; **Enable the configured vault** only after live checks pass. Pausing remains a separate controller action.
5. Investors approve the exact deposit amount, then deposit test-USDC. Exits approve exact Pump tokens, then redeem. Both enforce a 0.1% minimum-output tolerance and five-minute deadline. A stale or paused vault blocks share operations; insufficient quote liquidity blocks an exit. There is no liquidation or withdrawal queue.
6. Review and grant **Autonomous trading** permission with the controller, then run the [headless worker](AUTONOMOUS-TRADING.md). Its backend execution key signs trades without wallet prompts. Manual buy/sell actions remain available for external-manager diagnostics; those actions also require a current on-chain permission on new vaults.

Each wallet transaction is prepared and simulated separately. User approval occurs in the wallet. Submission hashes remain recoverable; receipt verification never resubmits. Do not discard a pending hash and send another deployment. Exported plans support another signing tool, while browser-wallet and Mera passkey submission are available directly. Physical Mera/WebAuthn transaction acceptance requires a supported authenticator; automated acceptance uses browser-wallet mocks and local EVM signers.

## Historical Chainlink observation, 12 October 2026

At Monad testnet block **70406059**, Chainlink's testnet reference directory listed BTC/USD, ETH/USD, LINK/USD, USDC/USD and USDT/USD, but **no MON/USD**. The listed USDC/USD proxy is `0x39820e7965e29DC86b94F20eD04e9c5cCf9aFf95` (8 decimals), backed by `0x56395e94c93DE46598537C4A81811a7a743D0826`. Identity and code were verified onchain. Its update timestamp was `1791733194`, versus block timestamp `1791810688`; it fails our 300-second freshness policy. The directory advertises a 86400-second heartbeat; that is not permission to relax the vault's policy. The published mainnet MON/USD address has no code on testnet. The live configuration therefore has `oracle: "chainlink"` and `monOracle: null`, with no Pyth fallback.

The fixed v4 0.3% WMON/test-USDC pool `0x5e65fc6c6777578390f275a30690331f2f3bd3a51bf63fdaeaaea7087ed836b7` still had **2.531268 test-USDC** of virtual quote reserves, below the 100-unit screen. Standard hook-free 0.01%, 0.05% and 1% fee pools for these exact immutable tokens had no active pool. This is a bounded search, not a claim that every possible pool has been enumerated. The official Kuru testnet registry uses USDC `0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570`, different from this vault's immutable quote token; its documented route cannot simply be substituted.

A subsequent runtime check also found that Klaris’s existing deployed vault differs from the current reviewed `PumpCoinRegisteredVault` artifact, which includes the newer controller-granted autonomous trading permissions. Readiness now reports this as a separate blocker, and no transaction plan can bypass it. A compatible vault/binding is required; the existing binding is not silently rewritten.

No live trading deployment, activation, deposit or trade was submitted. The one-day configuration notice cannot begin with the missing MON feed. No mocks are represented as live feeds, and no freshness, liquidity or slippage limit was relaxed. A new token pair/vault or alternate oracle requires an explicit scope decision rather than quietly changing this vault's mandate.

Sources: [Chainlink address directory](https://docs.chain.link/data-feeds/price-feeds/addresses), [Chainlink testnet reference data](https://reference-data-directory.vercel.app/feeds-monad-testnet.json), [Monad v4 registry](https://github.com/monad-crypto/protocols/blob/main/testnet/uniswap_v4.jsonc), [Monad Kuru registry](https://github.com/monad-crypto/protocols/blob/main/testnet/kuru.jsonc). Public read-only probe data is saved in `deployments/pumpcoin-chainlink-probe.json`.

## Chainlink verification

- 64 vault Solidity tests passed, including five Chainlink tests and 512-run mixed-decimal fuzz coverage. Invalid/incomplete rounds, stale/future timestamps, feed metadata changes, aggregator/code changes, price disagreement and shallow liquidity fail closed.
- All 151 Node tests passed, including seven affected trading/Chainlink checks. Receipt-backed Anvil flows exercise both legacy Pyth fixtures and the new Chainlink mode: exact infrastructure deployment/confirmation, restart recovery, one-day notice, activation, investor deposit, permitted manager buy/sell and full redemption. Missing MON pins, unsupported update requests and incompatible vault runtime block planning. These use local oracle/pool fixtures, not a live Monad market.
- Root/frontend/server TypeScript checks and the Vite production build passed.
- Browser verification showed Chainlink attribution, no oracle-update action, the 2.531268/100 liquidity screen and all live readiness blockers. No wallet transaction was submitted.

## Earlier verification (before the Chainlink integration)

- `forge test --match-path 'test/vault/*.t.sol' -vv`: 47 vault tests passed, including ten new v4/valuation/gateway checks and 512-run donation/conservation fuzz coverage.
- `node --import tsx --test tests/vault-trading.test.ts`: three market/pool/wallet regressions passed.
- `node --import tsx --test tests/vault-trading-service.test.ts`: receipt-backed Anvil deployment, persistent confirmation/restart, notice, activation, exact approvals, investor deposit, manager buy/sell, investor exit, stale-price rejection and code-pin rejection passed. The local fixtures use valueless tokens, a scripted manager and injected oracle/pool state. They do not prove real-pool profitability or live autonomous execution.
- Full Solidity suite and all 143 Node tests passed. Root and frontend TypeScript checks and Vite production build passed. The profile’s live readiness display was verified through the browser.

## Executable quote preview

Manager buy/sell review now uses a read-only `managerTrade` simulation through the vault, restricted adapter and actual configured v4 pool. The returned output includes the DEX fee and price impact; no balance, code or permission overrides are used. A second call validates the exact submitted calldata with the greater of the simulated-output slippage floor and the independent oracle/permission floor. Both calls and the gas estimate are bound to one block, whose canonical hash is rechecked. The stricter of the signed mandate and current controller permission sets the slippage allowance.

The UI separates expected output from minimum received and shows the observed block/time and a 30-second expiry. Wallet submission rejects expired previews, Mera rechecks before broadcast, and the trade calldata itself has a 30-second chain deadline. A quote is a simulated snapshot, not guaranteed mined execution. Stale feeds, missing liquidity, insufficient vault balances, missing permissions, exceeded caps, incompatible code, failed settlement and configuration gates cannot be bypassed to obtain an executable quote.

No live registration, infrastructure deployment, configuration or trade is implied by the local receipt-backed tests.
