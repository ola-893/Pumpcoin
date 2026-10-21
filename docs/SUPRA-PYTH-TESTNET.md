# Monad testnet: Supra MON and Pyth USDC

The active `deployments/pumpcoin-trading-network.json` selects `supra-pyth` on chain 10143. The owner approved this combination because the Pyth trial includes USDC/USD but excludes MON/USD. `pumpcoin-chainlink-research-network.json` preserves the earlier, blocked Chainlink investigation; it is not the active deployment configuration.

## Verified valuation

- Supra's Monad testnet verifier is `0xF8522B7fcE37439b98A2be282d413A44269028bE`. The source checks its reviewed runtime hash and verifies signed pull proofs containing exactly MON/USDT (569) and USDT/USD (48). MON/USD is their product. USDT is not assumed to equal one dollar.
- Pyth's Monad testnet contract is `0x2880aB155794e7179c9eE2e38200202908C17B43`. USDC/USD feed `0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` supplies the independent quote valuation. USDC is not assumed to equal one dollar.
- Both publications must be at most 300 seconds old. Supra's signed millisecond timestamps are retained, normalized to seconds for freshness, and cannot be refreshed by merely relaying an old proof. Duplicate/missing/extra feed IDs, invalid proofs, future/zero/stale timestamps and replayed/older observations revert. Pyth USDC additionally enforces its 1% confidence limit; Supra does not provide that confidence field.
- The returned mark is six-decimal quote units per 18-decimal WMON. The actual hook-free v4 pool must have active liquidity, at least 100 test-USDC of virtual quote reserves, and a spot price within 5% of the independent mark. Virtual reserves do not guarantee executable depth across ticks. Exact trades still enforce their simulated output, deadline, signed slippage ceiling and vault caps.

The key is read only by the local server from `PUMPCOIN_PYTH_API_KEY` in the project root `.env` (or the app's server environment). Never prefix it with `VITE_`. It is sent as a Bearer header to Pyth's official authenticated Hermes endpoint. Bounded oracle responses and sanitized errors prevent upstream bodies or credentials reaching the browser. A production bundle scan found no copy of the configured key.

## Live frontend setup

Use the agent profile in external Chrome with its controller wallet on Monad testnet. No terminal transaction is needed.

1. In **Operator setup → Controller setup and manual testnet actions**, review **Deploy trading infrastructure**, submit with the wallet, and verify the saved hash. Exact creation input, controller, value, canonical receipt, child runtime and immutable bindings are checked before accepting the deployment. This does not configure or unpause the vault.
2. Review **Propose configuration · one-day notice**, submit and verify its receipt. The notice can start before market readiness, but applying the configuration still requires healthy valuation after 24 hours. The original identity, manager, commitments, caps and zero expense budget remain bound.
3. In **Overview → Your investment → Controller: MON gateway setup**, review, deploy and verify the separate native-MON gateway. Its fixed pool and tokens must match the reviewed trading deployment. Infrastructure deployment alone does not make the vault investable.
4. Use **Relay verified Supra MON price** and **Refresh authenticated Pyth prices** to publish fresh signed data. Both updates are permissionless but consume testnet MON gas. The Pyth plan requests only USDC/USD in hybrid mode; it does not request the unavailable MON entitlement.
5. Initialize and fund the exact configured v4 pool. Its pool ID is `0x8bd734c49be0ac769780c5b74f71a5e334bd1b2ea1576c3592ebe02f73b13ed4`, using USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3`, WMON `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541`, fee 500, tick spacing 10 and no hook. The earlier 0.3% pool was both too shallow and far from the independent mark. Selecting an unused fee tier does not fund it. The **Small demo pool · controller funds** section provides a dedicated, receipt-verified pool helper, exact 0.2 test-USDC approval, and a funding review capped at 3 testnet MON plus 0.2 test-USDC. Unused inputs return atomically to the controller. It targets 125 test-USDC of virtual reserves in a 20-tick range (two increments of the pool’s tick spacing), not 125 test-USDC of deposited capital. This supports only tiny demo trades and stops working when the price leaves the range. The controller can remove the entire position and seed a fresh range; LP losses and fees affect what returns. Investor capital is not used.
6. After the displayed notice time, refresh prices and readiness, apply the configuration, verify the receipt, then enable the vault. These are separate controller transactions. No frontend flag bypasses contract checks.
7. Investors use the frontend to invest MON, receive Pump shares, then redeem their current value in MON. Gains, losses, conversion fees, liquidity and freshness affect the result. A funded, pinned headless-worker configuration and controller trading permission are still required to demonstrate autonomous trades.

A separate gas-capped, on-demand keeper and guarded valuation wrapper are now implemented. The keeper key is provisioned but initially unfunded/disabled; the wrapper requires a receipt-verified deployment, advancing checkpoints and explicit configuration activation. Prices still expire after five minutes, and stale data blocks valuation, trading and shares. See [keeper operation, actual costs and activation status](VALUATION-KEEPER.md).

## Validation and limits

On 12 October 2026, the real Supra verifier accepted a fresh public proof in an `eth_call`. Pyth returned an authenticated USDC update, and its real Monad testnet contract accepted an update simulation. Those calls did not persist prices or fund a pool.

All 90 vault Solidity tests and 178 application tests passed, including bounded pool funding, refunds, controller withdrawal, receipt recovery, wallet amount guards, and 12 hybrid-source checks and 512-run decimal fuzz coverage. The receipt-backed hybrid service test exercises deployment, confirmation, restart recovery, notice, activation, investor entry, restricted buy/sell, redemption, stale-price rejection and code-pin rejection on local fixtures. Frontend/root TypeScript checks and the production build passed. Local fixtures validate implementation; they are not a Monad testnet demo or evidence of returns.

Sources: [Supra pull oracle](https://docs.supra.com/oracles/data-feeds/pull-oracle), [Supra network addresses](https://docs.supra.com/oracles/data-feeds/pull-oracle/networks), [Supra feed IDs](https://docs.supra.com/oracles/data-feeds/data-feeds-index), [Pyth price updates](https://docs.pyth.network/price-feeds/core/fetch-price-updates), [Circle's Monad testnet USDC](https://www.circle.com/blog/usdc-cctp-v2-circle-wallets-and-circle-contracts-are-coming-soon-to-monad-what-you-need-to-know).

## Confirmed public setup on 12 October

- Trading bundle: `0xf07af10A7Af5D3d6E5beF3B3f22195a89C257770`, deployment transaction `0xdc493533160a89a46bd5bd7d2c957b09fd3b70a011cbbbded0ec684ed02e6fef`.
- Native MON gateway: `0xEb85915fab325b677F900D27712bcc1d085bA514`, deployment transaction `0xfb965e8173451fc43e5b8adf44a2891c44550066708136c845def3cb8c60fd64`.
- Configuration notice: transaction `0xda57f9aae1c06d5a5659007ef42535d5b986514426830b843acc933c82ed357d`; earliest application is **13 October 2026, 21:17:46 Africa/Lagos (UTC+1)**, subject to healthy prices and liquidity. The vault remains paused.
- The controller received 20 Circle faucet test-USDC. A funded pool and persisted fresh MON observation have not yet been confirmed. These receipts prove setup transactions, not trading performance or investment eligibility.

Public-RPC reads are batched in groups of at most five and paced to four calls per second. Simultaneous readiness requests share only work already in progress; later checks read again. Explicit block references, runtime pins, reorganization checks and mandate validation remain enforced. This read transport cannot broadcast transactions.
