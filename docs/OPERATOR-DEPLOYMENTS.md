# Deployment boundaries and operator runbook

The active project is `/Users/deonorla/Documents/Github/pump`. The previous checkout is preserved at `/Users/deonorla/Documents/Github/pump-before-reconcile-20261013` with its original Git history, environment and ignored files. The current project's Git history and uncommitted work moved intact; no remote was changed or pushed.

New execution uses [Ethereum Sepolia](SEPOLIA-EXECUTION.md). Historical Monad instructions and receipts below retain their original scope. Sepolia Chainlink feeds are push feeds: no funded oracle relay keeper is needed.

## Current demo deployment policy

For Muse RYO Demo, infrastructure creations use the root `.env` `PRIVATE_KEY` through `operator:deploy`, with a maximum gas cost of 0.0001 test ETH per creation. The key stays in the local CLI. No infrastructure deployment button or signing-key input belongs in the frontend. A controller registering its own agent/vault and an investor approving, investing or redeeming remain wallet-reviewed user actions.

Current verified Muse infrastructure:

| Component | Address | Deployment transaction |
| --- | --- | --- |
| Trading bundle | `0xa7a1c721a7F2cD392Bd3d209FE9176D7c43f1C8D` | `0x86be3f0f92a461019d7f5f54d151c064412155bca2b067a2a455f4e8842e92b7` |
| ETH conversion gateway | `0x769CC5cBd4734E6bDdEa6D884DD4F5D2c8ae8f9D` | `0x1f766d48e7d05bd6c6971aec5bbffd416f59ab9ce37137d239571c111d22b7eb` |

The already-confirmed trading bundle is reused after checking its saved transaction; restarting the task must not create another bundle. Native conversion gateways are provisioned by the CLI as well. A pool funder or guard is deployed only if the selected network and current liquidity require it. Configuration activation and permission grants are separate from contract creation.

## Architecture

Contract creation is a blockchain transaction. Both a local deployment script and a browser wallet are valid ways to sign it. The distinction here is responsibility:

- Protocol infrastructure (trading bundle, guarded valuation source, conversion gateway and test-pool funder) is provisioned from the operator CLI, outside the product flow.
- A controller creating its own dedicated agent vault remains an explicit wallet operation during registration. `PumpCoinRegisteredVault` requires `msg.sender == controller`, registers the identity atomically and transfers its ownership to that controller. The CLI supports this same operation when its local key matches the registered controller.
- Deposits, redemptions, bounded trading grants and controller configuration retain wallet review. A controller's deployment key is never accepted by HTTP endpoints or passed to a frontend component.
- On-demand price requests wake the separately provisioned keeper. Advanced permissionless price/checkpoint maintenance remains available for paused-vault bootstrap; it cannot deploy infrastructure.

The root `PRIVATE_KEY` is read only by the local CLI. Vite loads private configuration through the existing `PUMPCOIN_` allowlist, and no `VITE_PRIVATE_KEY` setting exists. The deployment signer is not imported by the HTTP plugin or browser bundle. Never add a root key to client `define`, props or public JSON.

## Commands

Run from the project root, using Node 22 or newer:

```sh
npm run operator:deploy -- guard <registration-id>
npm run operator:deploy -- guard <registration-id> --broadcast
```

The first command is a dry run. `--broadcast` explicitly submits the reviewed creation. Supported kinds are `vault`, `trading`, `guard`, `native`, `native-guard`, and `pool-funder`. `--env /absolute/path/.env` selects a different local key file; otherwise the command reads the root `.env`. `--max-cost 0.001` is the default maximum EIP-1559 gas cost in native tokens per deployment. Sepolia is the default (`--chain 11155111`); historical Monad deployments require `--chain 10143` and a matching signed record. A larger infrastructure creation may exceed this cap; the CLI stops rather than increasing it automatically. No token transfers, configuration application or trader start is bundled with deployment.

Before signing, the CLI verifies the selected reviewed testnet chain, the signed registration's controller, reviewed runtime/dependency pins, exact creation simulation, account balance and maximum gas cost. The key cannot silently replace a controller or vault manager.

Every controller shares a deployment lock. Signed bytes and their expected hash are durably saved under ignored `.local/deployments` before broadcast. Pending transactions block new creation. After timeout, rerunning the same command follows or resends identical bytes, never allocates a fresh deployment nonce. A consumed nonce without the saved receipt, stale lock, changed journal, wrong signer, reverted receipt or dependency mismatch stops the command. Do not delete journals or locks to force a retry; resolve the recorded transaction first. Another external wallet can still consume the controller's nonce, so avoid concurrent controller submissions.

Canonical successful receipts need two confirmations. Existing service verification checks exact creation input, sender, runtime and immutable bindings before publishing a local address. A public receipt containing hashes, addresses and actual gas cost is saved under `deployments/agents`; it contains no private key, raw signed transaction or environment contents. Rerunning a verified command checks its existing receipt instead of creating another contract.

## Frontend audit and cleanup

Removed new infrastructure deployment controls from the trading workspace, MON investment panel and pool funding panel. Browser planning endpoints reject those creation actions before making RPC calls. The investment/trading wallet validator rejects transactions without a recipient; the separate, controller-owned registration-vault creation flow remains intentional. Historical deployment receipt recovery is preserved.

The readiness checklist now reports operator-provisioned infrastructure and valuation protection explicitly. Its main price action queues on-demand upkeep instead of making investors relay oracle transactions. Existing safety checks, live quotes, minimum output, configuration notice and wallet confirmation remain intact. The CLI uses the same receipt checks as the former browser deployment path.

## References

- [Ethereum: deploying smart contracts](https://ethereum.org/developers/docs/smart-contracts/deploying/)
- [Foundry: deployment scripts and configuration](https://getfoundry.sh/guides/scripting-with-config/)
- [Valuation keeper policy](VALUATION-KEEPER.md)

Validation and public guard deployment receipts: [13 October report](testing/operator-deployment-20261013/README.md).

`native-guard` uses its own durable deployment journal to provision a MON gateway whose immutable price source is the verified active guard. Existing gateway receipts remain preserved. Gateway source migration is permitted only while the vault has zero cash, positions and investor shares; the frontend rejects the older source binding rather than advertising it as investment-ready. No vault configuration, investor allowance or funds move as part of gateway creation.
