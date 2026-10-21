# Valuation upkeep and circuit breaker

Implemented 13 October 2026. The owner chose **on-demand refreshes** to conserve faucet MON. Live trading remains paused. Implementation, provisioning and on-chain activation are separate states.

## Price policy

The existing source derives MON/USD from signed Supra MON/USDT and USDT/USD proofs, divides by signed Pyth USDC/USD, and uses the resulting six-decimal quote-unit mark for 18-decimal WMON. Stablecoins are not assumed to equal $1. Signed publication times, not relay times, determine freshness. Stale/missing/future prices, excessive Pyth confidence, insufficient active pool liquidity and more than 5% pool/oracle disagreement already block valuation. A slippage floor by itself cannot establish the mark's correctness.

The new `GuardedHybridValuationSource` wraps that reviewed source and adds:

- At most 60 seconds between the composite MON publication and USDC publication.
- Runtime pins for the underlying source, Pyth proxy and pool state reader.
- A 3% change limit relative to the accepted checkpoint; the current live mark is used for NAV, not a cached checkpoint price.
- An initial two-observation warm-up and two-observation recovery after a large move or expired checkpoint. Observations and their publication times must advance by at least 60 seconds and agree within 1%.
- A five-minute maximum checkpoint age, in addition to underlying feed expiry. Replaying old data or frequently resetting a checkpoint cannot bypass these limits.
- No owner method to inject a price or override the circuit breaker.

This is a continuity/circuit-breaker policy, not a second independent MON oracle or a pool TWAP. A persistent faulty signed oracle price may eventually pass recovery. The two providers price different legs; they are not a consensus quorum on MON. Supra's composite source exposes its oldest publication, so the wrapper cannot recover the two underlying Supra leg timestamps separately. Pyth governance and configured RPCs remain trust boundaries; another contract cannot inspect the proxy's implementation storage directly. The keeper and production readers check that slot and implementation runtime off-chain before signing.

The small testnet pool is a consistency/liquidity screen, not a guarantee that the full NAV can be liquidated at the mark. Exact swap simulations, minimum output, per-trade/exposure caps and available redemption liquidity remain required. These safeguards strengthen the valuation surface; they do not turn test tokens into redeemable dollar assets.

## On-demand keeper

`oracle-keeper.ts` uses a separate encrypted signer with **no vault manager, withdrawal or administration authority**. Its only permitted calls are `updateMon`, Pyth `updatePriceFeeds`, and checkpoints on a verified guard for the selected registrations. Source targets come from receipt-verified, runtime-pinned infrastructure. A shared USDC update is deduplicated across vaults.

The provisioned address is `0xcF0C1eDcefff16e0136d777b11BD1d7fd4A3819B` on Monad testnet. It starts disabled, unfunded and without an execution window. Creating it transferred no tokens and submitted no transaction.

Trading requests blocked by unavailable valuation and investment/redeem requests blocked by readiness enqueue a ten-minute request. Repeated requests coalesce. The keeper skips paused vaults except explicitly requested, empty, unconfigured guarded vaults that need initial observations. Funded or configured paused vaults remain excluded. It stops idle refreshes after the requested healthy state is reached and performs extra advancing observations only when the guard needs priming/recovery. Each feed advances separately so an already refreshed USDC observation cannot repeatedly take priority over MON. Invalid zero amounts cannot wake upkeep. A queued request does not authorize a trade or investment; the original operation must pass fresh checks and simulation on retry.

Defaults: 0.3 MON maximum total cost per update, 2 MON per UTC day, 0.1 MON reserve, at most 24 update transactions per day, and 500 gwei maximum fee. A separately enabled window may last at most one day. Pyth's update value counts toward cost as well as actual receipt gas. Reverted transactions count. Gas limits are not raised to force activity; an EIP-1559 estimate is clamped only if the current base fee plus tip still fits the reviewed cap.

Signed bytes and their expected maximum cost are journaled and fsynced before broadcast. Uncertain submissions are recovered using the same bytes, never a new nonce. Canonical receipts are checked with two confirmations and costs are recorded before another update. A process lock prevents concurrent signing; stale locks are never stolen automatically. Storage, proof, dependency, budget or RPC failures stop the CLI rather than inventing a price. Stopping the process cannot cancel a transaction already submitted.

The host must remain awake with the keeper process running. This is a local keeper, not a deployed highly available service. A gas cap is a spending bound, not an uptime guarantee. When upkeep stops or funds run out, the existing contracts expire valuation and block share operations/trading.

## Actual cost simulation

The saved live preflight simulated both permissionless updates from the already funded controller; the keeper wallet itself was unfunded. It submitted no transaction:

| Update | Estimated testnet MON |
| --- | ---: |
| Shared Pyth USDC | 0.02151 |
| Azula Supra MON | 0.20747 |
| Full refresh | 0.22897 |

At a 180-second refresh cadence that is approximately 110 MON/day for this single active vault, before guard checkpoints. Prices and gas can change. On-demand operation avoids this idle spend. Funding 0.5 test-MON initially supports approximately one complete refresh while preserving the reserve; it is not a promise of a day's operation.

## Commands and activation

```sh
npm run oracle:keeper -- init <explicit-registration-id> [second-registration-id]
npm run oracle:keeper -- request <registration-id>
npm run oracle:keeper -- check
npm run oracle:keeper -- run
npm run oracle:guard-plan -- <registration-id> /tmp/new-guard-plan.json
```

`init` creates an exclusive private configuration and separate encrypted key; it does not fund or enable them. `request` only queues a request. `check` simulates from the controller and reports the keeper's actual balance. `run` refuses disabled/expired configuration; after funding, enable only the reviewed time window in `.local/oracle-keeper-config.json`. API keys stay server-side in `.env`; none are embedded in public configuration or output. No signing key or unlock material is exported.

For the guard, use `npm run operator:deploy -- guard <registration-id>` to simulate, then add `--broadcast` to deploy with the local controller key. Infrastructure creation is no longer exposed as a frontend action. See [the operator runbook](OPERATOR-DEPLOYMENTS.md). Receipt verification checks exact controller creation input, canonical success, runtime and immutable pins before recording the candidate. A recorded candidate does not claim activation.

Prime two advancing guard checkpoints with fresh aligned oracle data. The on-demand keeper can do this when enabled/funded; the manual checkpoint action also remains available. Then propose/apply the complete configuration through the vault's existing policy. Standard vaults retain the one-day notice; the explicitly labeled instant demo retains zero notice. During migration, keep investor/trading activity paused until the new source and fresh readiness are verified. Applying a new source starts a new accounting period and invalidates existing trading permission.

The native conversion gateway and venue retain their original immutable oracle reference. The vault's new guard additionally gates NAV and share operations; both marks derive from the same underlying source. The worker's reviewed source address/hash must be updated to the confirmed wrapper after activation, retaining the underlying/dependency pins. An old worker configuration fails closed rather than silently adopting a new source. Then a new bounded trading grant can be reviewed separately.

## Verification

Solidity tests cover bootstrap, replay resistance, feed skew, expired checkpoints, jump quarantine, unstable recovery, dependency failures, live mark accounting and fuzzed decimals. A real local vault rejects share previews/deposits/redemptions during the circuit break without changing cash or shares, then resumes after recovery.

The local EVM service regression verifies exact guard deployment and receipt recovery, restart, advancing checkpoints, preserved configuration notice, activation and stale rejection. Keeper tests cover deduplication, allowed selectors/targets/value, dry-run isolation, durable ambiguous broadcast recovery, actual gas accounting, request coalescing/expiry and guard priming. Local fixtures are not live operator trades or investment performance.

Sources: [Supra pull oracle](https://docs.supra.com/oracles/data-feeds/pull-oracle), [Pyth signed update flow](https://docs.pyth.network/price-feeds/core/fetch-price-updates), [Monad oracle infrastructure](https://docs.monad.xyz/tooling-and-infra/oracles).

For the explicitly approved live demo, the keeper may retain an on-demand request until its existing ten-minute expiry with `keepWarmRequests: true`. This setting does not create requests or extend expiry. The default still clears healthy requests immediately. Muse’s operator reviewed 4 test-MON daily gas, 50 updates, the existing 0.3 MON transaction cap and 0.1 MON reserve for this bounded demo; funded balance and durable actual spend remain additional limits.
