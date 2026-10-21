# Directory and profile data-source audit — 2026-10-13

Scope: `/agents`, `/agents/:id`, all four profile tabs, investment panel and nested operator panels. Static navigation, explanatory copy and action labels remain UI text. They do not supply agent names, balances, status, ratings, or results. No signed registration, historical model receipt, deployment or strategy commitment is rewritten.

| Visible element | Source / verification | Failure or scope handling |
| --- | --- | --- |
| Directory count, filters, version count, name, description, pair, model label | `/records`; manifest hash, controller/execution consent, registration ID, worker receipt and signed-history checks in `readDirectory` | Failed refresh is an error, not a fabricated empty directory; no example profiles |
| Registration badge, model policy | Validated registration status and signed `inferencePolicy` | Describes a signed local record, not continuous runtime attestation |
| Directory vault status and activity | `/agent-state`; same registry/vault/manifest as the selected record | Source block and time; read failure shown explicitly; recent trades scoped to returned block window |
| Current identity owner, vault controller, manager, published manifest | Contract reads at the observation block; registry implementation/code pins; exact manifest URI comparison | Changed ownership/authority/manifests produce mismatch state instead of a verified badge |
| Declared strategy limits, leverage and full description | Exact signed manifest | Explicitly a declaration; current enforced caps and strategy/risk commitments separately read from the vault and compared with the signed declaration |
| Current enforced trade/position/expense caps and configuration notice | Vault getters at the same anchored block; reviewed normalized runtime checked | No inferred notice based on a decorative demo badge |
| Model weights/runtime/source, worker actions and guard-challenge count | Original public admission receipt and signed declaration; browser replays its hash/arithmetic checks | Historical synthetic observation; source URL remains an operator declaration; no claim of hardware attestation or current loaded model |
| Current NAV, cash, position and share supply | Vault and token contract reads at one canonical block | Missing NAV stays missing; source status/reason exposed; decimals and symbols read from tokens |
| Deposits, withdrawals, executed trades | Vault logs matched byte-for-byte to canonical mined receipts; counters include all returned transactions before table truncation | Counts and flow totals apply only to disclosed recent window; zero never means lifetime zero |
| Performance / trust | Current identity comparisons, valuation state and disclosed evidence coverage | Fixed performance/rating placeholders removed. Recent logs cannot establish reconciled lifetime P&L or an invented trust score. Full accounting verification remains a separate requirement |
| Worker status | Backend runtime for the selected registration ID | Host-reported configured/running/state/change/cycle fields; chain/runtime failures independent |
| Investor MON/Pump balances, allowance, liquid redemption limit, readiness | `/native-state` for the selected vault and connected account; code/binding checks, canonical block hash and read token/share decimals | Wallet changes reject in-flight reads; failures clear success state; older snapshots marked; no example amount prefilled |
| Deposit/redemption previews, minimums, gas and deadline | Exact `/native-plan` contract simulation | Review amounts unchanged; no copied tolerance presented as current agent data; wallet submission remains separate |
| Operator readiness, pool liquidity screen and oracle freshness | `/trading-state` plus backend enforcement policy returned with that observation | Passed checks scoped to the read block; failed refresh cannot retain a ready badge |
| Permission expiry, daily turnover and slippage | `/autonomy-status` contract reads | Actual current grant shown after checking; signed proposed slippage separately labeled |
| Execution gas funding | Reviewed backend funding plan | Button has no copied amount; actual plan value shown before wallet action |
| Pool funding limits, allowance thresholds and transaction amounts | `/pool-state` policy and exact `/pool-plan` | Copied frontend budgets replaced by backend limits and plan values |
| Exports | Original signed record and separate raw public observed-state JSON | Integers stay decimal strings; no private runtime URLs, signer secrets or signed raw transactions exported |

Read-only testnet snapshots are in this directory under stable agent IDs. These snapshots are evidence of the test run, not fixtures consumed by the UI. Pages always call the APIs; they never import these files.

Validation: root TypeScript check; production frontend build; frontend lint; 22 targeted registration/source-integrity/API/native-investment/hybrid-vault/pool regression and integration tests; external Chrome inspection. No public-chain transaction, trader start or oracle refresh was executed for this audit.
