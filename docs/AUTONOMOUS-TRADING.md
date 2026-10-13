# Autonomous agent signing

The owner connects the controller wallet. The local helper provisions a separate execution key, signs its enrollment after verifying the owner's exact registration signature, and keeps that key out of the browser and model inputs. A separate headless process signs trades. Closing the browser does not stop that process.

Registration authorization is still an EIP-191 message with **no trading authority**. The controller separately deploys the dedicated vault, activates its venue/valuation through the existing one-day notice, funds it, and approves an on-chain trading permission. Initial setup has multiple transactions. After setup, trades require no owner wallet prompts. The separate investor/trading interface retains its own readiness and receipt checks; registration itself grants no investment eligibility.

## Custody and authority

The included signer uses an AES-256-GCM encrypted local keystore and a scrypt-derived encryption key. A random unlock credential lives in a separate private file, referenced by an environment **path**, not a raw execution private key. Files must be owned by the process user, have no group/other permissions, and be regular files; the key directory must be private. Encryption authenticates the controller, agent name, address and format. Existing key files are never silently replaced when decryption fails.

This is **local operator custody**, not a TEE, MPC wallet, hardware wallet, or ERC-7715 implementation. The operator and any process that can compromise the unlocked host can obtain/use the execution key. JavaScript account objects/strings cannot be reliably wiped; mutable encryption buffers are cleared. Run the local model with a separate operating-system identity/sandbox and no access to signer files or the unlock credential. Host isolation is an operational requirement, not a property proven by a prompt or this test suite. For hosted production custody, replace the signer with a reviewed policy-enforced signing provider and authenticate tenants/operations before exposing a service publicly. The current helper stays loopback-only and is not a production multi-tenant API.

Trading capital belongs to the vault, not the execution EOA. Only a small gas balance belongs in the EOA. Its manager role cannot administer the vault, change policy, or withdraw investor shares without their allowances. The model receives a strategy description, declared limits and an anchored cash/position snapshot. It cannot select a contract, method, recipient, arbitrary calldata or signing key.

## On-chain limits

New `PumpCoinRegisteredVault` deployments start paused, with no adapter, unavailable valuation, and `tradingPermissionRequired = true`. They cannot fall back to unrestricted manager execution. Existing non-proxy deployments cannot gain these changes in place. Legacy `UnoraVault` fixtures retain their original manual-manager behavior until a controller enables permission enforcement; once enabled it cannot be disabled.

The controller's `grantTradingPermission` binds the current manager and configuration hash and permits at most 30 days. `managerTrade` enforces:

- The current manager, matching manager/configuration versions, and an unexpired grant.
- The configured two-token pair, restricted adapter/venue, and vault recipient.
- Existing quote-denominated per-trade and position limits.
- UTC daily **gross turnover**: buys plus sells, rounded up for position-token input. This is neither a rolling 24-hour cap nor a daily loss guarantee. Renewing, revoking, changing manager or configuration cannot reset already-used turnover. A cap can prevent further unwinds; size it with exit capacity in mind, or let the controller raise it explicitly.
- A minimum output based on the healthy configured valuation and the granted slippage ceiling. A malicious manager cannot bypass it with `minOut = 1`. This is protection relative to that valuation, not proof of a fair external market price. The price source and reviewed venue remain trust boundaries.
- A transaction deadline no more than five minutes ahead, exact allowances, atomic input/output accounting and allowance reset.

The grant/revoke boundaries enter the vault configuration/performance history. Manager rotation, controller transfer or applied governed configuration invalidates the old grant. Revocation and pause remain available when valuation is unavailable. A transaction mined before revocation may succeed; ordering determines effectiveness. The worker refuses permission ceilings above the signed manifest's declared slippage.

Both six- and eighteen-decimal positions follow the existing source convention: `price` is quote base units per `1e18` position base units. For 18-decimal WMON at 2 test-USDC, `price = 2e6`; for the 6-decimal 1:1 fixture, `price = 1e18`. The worker and on-chain slippage check use the same convention. The existing six-decimal quote requirement remains.

## Setup

Use a Node version supported by the repository and install the root/app dependencies. Build the contracts and provision an unlock credential outside the repository and key directory:

```sh
npm ci
cd app
npm ci
cd ..
forge build --root contracts
npm run signer:init -- /absolute/private/service-secrets/pumpcoin-unlock
export PUMPCOIN_SIGNER_PASSWORD_FILE=/absolute/private/service-secrets/pumpcoin-unlock
# Optional; defaults to <repository>/.local/execution-signers
export PUMPCOIN_SIGNER_DIRECTORY=/absolute/private/pumpcoin-execution-signers
cd app
npm run dev
```

Back up encrypted keystores and the unlock credential separately. Losing either loses that execution key; the controller can pause/revoke and rotate the manager, but cannot recover a missing key. Never commit the unlock credential, key files, private registration records, or worker configuration. `.local/` is ignored. Mount the unlock file read-only into the helper/worker service. Do not run `signer:init` against an existing credential: it intentionally refuses overwrite.

On `/register`, connect the controller, enter the agent name and choose **Prepare agent execution wallet**. The same controller/name recovers the same encrypted signer across helper restarts. Complete local inference checks, then **Authorize agent enrollment**. The backend verifies the controller signature and signs the exact execution-role challenge; no second wallet connection or generic HTTP signing endpoint is used. Existing external signers retain an explicit enrollment-signature fallback.

Deploy/verify the vault with the controller. Configure a reviewed restricted venue adapter and healthy valuation using the existing notice procedure, then activate/fund it. From the latest agent profile, review duration and UTC turnover, then approve trading permission with the controller. Mera and browser EOAs use the controller transaction path. The UI displays on-chain permission state, not a claim that a worker is online.

Create an operator-reviewed, private worker configuration based on [the example](examples/autonomy-worker.example.json). Fill every address/runtime pin from the actual reviewed direct deployments, including constructor immutables. An ERC-1967 identity registry requires its implementation pins; beacon proxies are unsupported. The vault/adapter/venue/source pins require reviewed direct code. The `dependencies` array pins the underlying oracle and exchange contracts (Supra verifier, Pyth proxy and implementation, pool manager and state view for the active hybrid bundle; Chainlink feed proxies and aggregators for a separately selected Chainlink bundle). ERC-1967 dependency proxies require both implementation address and runtime hash; beacon proxies are rejected. The operator must enumerate every transitive dependency. Nonstandard proxies are unsupported, and pinning a proxy shell alone is insufficient. Monad configurations require a nonempty dependency list. Use the matching confirmed local registration ID. An arbitrary RPC remains trusted; block anchoring detects inconsistencies/reorganizations, not a consistently dishonest RPC.

```sh
export PUMPCOIN_AUTONOMY_CONFIG=/absolute/private/pumpcoin-autonomy.json
npm run agent:trade -- --once # inspect one cycle first
npm run agent:trade          # persistent headless worker
```

Run the worker under a supervised service with the same private registration/key access and mounted unlock credential. There is no need for a browser or controller wallet connection once permission is active. The separate [trading/deposit workflow](TRADING-AND-DEPOSITS.md) supplies the reviewed Uniswap v4 setup. The active Monad testnet route uses [Supra MON + Pyth USDC](SUPRA-PYTH-TESTNET.md). A worker configuration must pin its actual deployed bundle, adapter, source, venue and dependencies; startup fails closed until those dependencies exist. The active hybrid route needs signed Supra MON relays and authenticated Pyth USDC updates at least every five minutes. A funded continuous oracle keeper is not provisioned by this change. The worker blocks when either price is stale or unavailable. The confirmed notice becomes applicable on 13 October 2026 at 21:17:46 Africa/Lagos, subject to liquidity and valuation checks. A reviewed live-worker configuration and on-chain permission are still required; local acceptance does not demonstrate live autonomous execution. No controller prompt is required for permitted worker trades. No real funds or public deployments were used for this change's acceptance run.

## Execution and recovery

The worker validates the signed registration, confirmed vault, runtime pins, controller/manager, identity ownership, strategy/risk commitments, token decimals, limits, adapter binding and healthy valuation at an anchored block. It rechecks local model artifacts around inference. It constructs only `managerTrade`, rechecks chain state after inference, simulates, applies a gas budget, signs locally, **persists the exact signed bytes/hash before broadcast**, and waits for canonical receipt confirmations (default 2, configurable 2–64).

The worker journals pending transactions across restarts and only rebroadcasts identical signed bytes while submission is ambiguous. It does not create a second nonce/trade in response to a timeout. A received/reverted receipt consumes the action and records its status; a reorganization or changed prior receipt blocks further work. A configured gas-price ceiling (default 100 gwei) and 1.5M gas ceiling apply per trade; keep the execution EOA's gas funding bounded as well.

A journal write or durability failure stops the process before further broadcast.

A process lock prevents two workers in the same state directory from using one execution account simultaneously. Run exactly one worker service per execution key; copying state/key files to multiple hosts or using different journal directories defeats this local lock. After an abrupt kill, inspect the lock PID and ensure the old process is stopped before removing only its stale lock. Back up/migrate the journal with the signer. Never discard a pending journal to “retry” an uncertain trade. A replaced/dropped transaction or deep reorganization requires operator investigation; automatic economic resubmission is intentionally blocked. Two confirmations mitigate ordinary reorg exposure but do not promise chain finality.

In persistent mode, unavailable valuation, expired/revoked permission, changed runtime or inference errors put the worker into a blocked state with no new trade. It retries on subsequent polls and can resume after the prerequisite recovers. `--once` surfaces failure. Renewal, funding, configuration changes and emergency revocation are controller actions. The permission defines the agent’s trading authority. Worker status, vault readiness and performance are tracked separately. Hardware-backed attestation — coming soon.

## Validation

`tests/autonomous-signer.test.ts` covers encrypted persistence/restart, metadata tampering, unsafe file permissions/symlinks, one-controller enrollment, wrong owners/origins, expiry/replay and 18-decimal trade construction. `contracts/test/vault/AutonomousTrading.t.sol` covers expiry, revocation, manager/controller/configuration changes, daily turnover/renewal/day boundaries, enforced slippage, atomic budget rollback and fuzzed turnover.

`tests/autonomous-trading.test.ts` uses actual Anvil contracts, encrypted execution keys, signed transactions, mined BUY/SELL receipts, restart reconciliation without duplicate submissions, 18-decimal position accounting, daily-cap HOLD and a mined revocation revert. Inference proposals, valuation and venue are deterministic fixtures. These tests establish signing/execution behavior, not authentic live inference, live DEX prices, Monad deployment or audited production custody.
