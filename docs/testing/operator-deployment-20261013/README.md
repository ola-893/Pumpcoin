# Operator deployment and frontend cleanup validation

13 October 2026.

## Migration

The complete current project moved to `/Users/deonorla/Documents/Github/pump`, including its Git history, uncommitted work, encrypted signer store, deployment records and dependencies. The previous checkout remains intact at `/Users/deonorla/Documents/Github/pump-before-reconcile-20261013`. Git remotes were not changed or pushed. Local environment values were merged privately and root `.env` has mode 0600. The preview restarted from the new path on port 5173.

## Verified public deployments

| Agent | Guard | Transaction | Actual test-MON gas |
| --- | --- | --- | --- |
| Azula | `0x3fbACDf7a21c23EB6aa56E34cE8F5e8d0d1aa89e` | [Receipt](https://testnet.monadexplorer.com/tx/0x86534cdf42ffdc3865f88f2cc410a21cb3b49f880694facdc40694cab3717d84) | 0.119021964 |
| Klaris | `0x184299685D95F31cCd4ADc0222367C4bd6Df0631` | [Receipt](https://testnet.monadexplorer.com/tx/0x53036d6d89750e615e973989f0fddc1b341ba0cbb325d55ab655231624d05877) | 0.119021964 |

Total actual gas: **0.238043928 test-MON**. Each deployment stayed below the 0.3 MON maximum cost. Both guard creations were signed locally using the matching controller key, without exposing it in chat or a browser wallet request. Exact creation inputs, canonical receipts with two confirmations, runtimes and immutable/dependency pins were verified before recording the guards. Public receipt manifests are under `deployments/agents`.

Azula’s first transaction mined but confirmation polling encountered a missing `eth_blockNumber` read-method allowance. The method was added with a regression test. The existing signed journal and hash were recovered, and verification completed without a duplicate creation. Klaris then deployed and verified successfully through the same CLI.

## Frontend boundary checks

- Removed new trading-bundle, valuation-guard, MON-gateway and pool-funder creation controls. Browser planning endpoints reject these actions before RPC preparation.
- The generic investment/trading wallet flow rejects recipient-less creation requests. Controller-owned agent-vault registration remains an intentional, separate wallet flow. Existing receipt recovery is preserved.
- The main price action requests on-demand upkeep. Advanced non-deployment oracle maintenance remains available for paused-vault bootstrap.
- Chrome showed the new operator-provisioning message, valuation-protection row and on-demand price request. Native control of some disclosure/selector elements remains unreliable; detailed action boundaries were verified through API/wallet tests and the build.
- A scan of all 13 production browser JS/CSS/HTML files found no copy of the actual private key. The server/CLI signer is not bundled.

## Automated verification

- Final full application suite: **133 passed, zero failed**. The host run permits the localhost sockets required by integration tests; the earlier sandbox attempt was rejected by socket permissions.
- Root and frontend TypeScript checks passed. Frontend production build passed. Git whitespace check passed.
- Lint: zero errors, 11 pre-existing warnings. This is not represented as a warning-free lint result.
- The local EVM guard integration now uses the CLI deployment engine and retains receipt, warm-up, notice, activation, trading and stale-price regression checks.
- New deployment tests cover dry-run isolation, cost/nonce limits, wrong account/chain/value/recipient, durable ambiguous-send recovery, consumed nonces and tampered journals. Read RPC tests cover confirmation head reads while rejecting broadcasting.

## Remaining activation work

Guard deployment is complete; on-chain valuation migration is still pending. No price updates, deposits, trading grants, configuration application or trader starts were performed by the deployment CLI. The separate on-demand keeper remains unfunded and disabled. It needs funded, bounded activation, two advancing oracle/checkpoint observations and normal vault configuration activation. Worker source pins must be updated only after the new source is confirmed active. Standard configuration notice remains intact. Live trading remains paused.

See [operator runbook](../../OPERATOR-DEPLOYMENTS.md) and [valuation policy](../../VALUATION-KEEPER.md).
