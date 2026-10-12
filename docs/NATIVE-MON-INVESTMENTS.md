# Native MON investment and redemption

The agent profile has an **Invest & redeem MON** panel. It prepares transactions for the connected investor on Monad testnet (10143); the frontend never signs with the agent’s execution key.

## Accounting and conversion

The existing vault keeps its six-decimal test-USDC accounting and twelve-decimal Pump shares. `NativeVaultInvestorGateway` provides atomic conversion using the same fixed, hook-free WMON/test-USDC v4 pool as the reviewed trading bundle:

1. Investment wraps the investor’s native MON, swaps WMON for quote, and deposits the actual received quote for Pump shares issued directly to the investor.
2. Redemption burns the investor’s approved Pump shares at current vault value, swaps the received quote for WMON, unwraps it, and returns native MON to that investor.

Pump tokens represent ownership in one vault, not a guaranteed MON repayment. Trading losses, operating expenses, MON/quote exchange rates and conversion fees affect exit amounts. A new deposit does not count as profit. Redemption requires sufficient liquid quote funds; it cannot force the agent to close an open position. Test-USDC is a test token and this conversion is not a claim of USD redeemability.

The gateway has no generic calls, arbitrary recipients, administrator withdrawals or retained deposit allowances. It binds one vault, wrapped token, price source, pool manager, pool ID and slippage ceiling. Source changes invalidate the old gateway. Exact-input settlement, token/native balance deltas, current valuation source, positive minimum outputs and a bounded deadline are checked on-chain. Excessive conversion loss, partial fills and recipient payment failure revert the entire investment or redemption.

## Frontend workflow

Use the external browser with the configured Monad wallet. All public demo actions happen through the frontend:

1. Register the locally hosted agent and verify its signed manifest and local inference receipt.
2. On its profile, finish the public identity/vault creation and verify the mined transaction.
3. Use controller setup to deploy the reviewed valuation/trading bundle and propose its configuration. The one-day notice and fresh oracle/liquidity gates remain enforced. Apply the configuration after the notice and enable the vault.
4. The controller reviews and deploys the dedicated MON gateway from **Invest & redeem MON**, then verifies its receipt. Deployment can happen before the configuration notice matures, once the trading bundle exists.
5. An investor chooses **Invest MON**, enters an amount, reviews the exact simulated output and MON/gas amounts, and confirms in the wallet. Verify the mined receipt to refresh share balances.
6. After trading results have changed the vault value, choose **Redeem Pump for MON**. Approve only the exact share amount if required, verify that receipt, then review and confirm the actual redemption. The preview uses the current share value and executable conversion rather than promising the original MON amount.

Each conversion is simulated twice at one canonical block, including the vault share operation. The final transaction enforces a 0.1% simulated-output tolerance in addition to the signed independent-price floor. Reviews expire after 30 seconds; conversion deadlines are 120 seconds from the anchored block. The wallet rechecks the selected account, chain and review expiry immediately before submission. Confirmation delayed beyond the on-chain deadline reverts.

The backend retains exact reviewed transactions in `.local/vault-native/plans/`; confirmed gateway bindings are stored in `.local/vault-native/`. The frontend saves review IDs and submitted hashes before clearing a review. Receipt checks verify chain, sender, destination, calldata, native value and canonical mined block against the server’s saved transaction. Unknown submissions block another investment until the wallet activity hash is recovered. A declined wallet request allows review and retry.

## Current public demo status

As of 2026-10-12, Klaris’s latest signed local registration has no public vault binding. External Chrome visibly shows the MON panel’s **Setup required** state. No public MON deposit or redemption has been executed by this implementation.

Public trading infrastructure still needs verified fresh MON/USD and USDC/USD feeds and sufficient, fairly priced liquidity in the configured pool. A missing feed, stale valuation, immature configuration, paused vault or failed liquidity/deviation check blocks investment. Do not relax these checks or present local fixtures as a Monad testnet demo.

Development validation covers atomic MON entry/exit, fees, fair share issuance, higher/lower NAV exits, exact approvals, failed settlement rollback, expired/stale/paused inputs, recipient failure, recovery across service restarts and wallet amount/destination tampering. Contract and integration fixtures are development tests only; the demo is the live public-chain frontend workflow above.
