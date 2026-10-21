# Valuation guard and on-demand keeper validation

Date: 13 October 2026. This records the historical pre-deployment handoff. Both live guard deployments were subsequently completed; see [the operator deployment report](../operator-deployment-20261013/README.md) for current deployment status.

## Verified implementation

- Full Solidity suite: 108 passed, zero failed; includes guard bootstrap/recovery, advancing publication times, feed skew, dependency changes, live NAV, fuzzing and vault share operations during circuit breaks.
- Full application suite: 128 passed, zero failed; includes receipt-verified guard deployment, configuration notice/activation, keeper request coalescing and durable ambiguous transaction recovery on local EVM fixtures.
- Final API/keeper/native controls subset: 18 passed, zero failed.
- Root and frontend TypeScript checks passed. Final frontend production build passed.
- Git whitespace check passed. Existing lint warnings are not represented as a clean lint result.

## Live readiness at handoff

No guard deployment, keeper update or configuration activation was submitted by this implementation run. Local EVM tests do not establish public-chain performance.

The separate keeper is provisioned at `0xcF0C1eDcefff16e0136d777b11BD1d7fd4A3819B`, initially disabled, unfunded and with no execution window. The selected policy is on-demand refreshes for trading/deposits; no idle periodic price refresh is enabled. Trading remains paused.

`keeper-preflight.json` records read-only update estimates from the funded controller, while reporting the keeper's actual zero balance. A full refresh was estimated at 0.22897 test-MON. `azula-guard-plan.json` records a read-only guard creation simulation, estimated at 0.11902 test-MON. Estimates can change.

The external Chrome operator page is prepared for wallet review. Native browser control could observe the action selector but could not operate it reliably; no MetaMask confirmation request was opened. The owner was asked to select Deploy guarded valuation source, review/simulate, submit with wallet, and perform the final MetaMask confirmation.

After a verified creation receipt, remaining activation steps are funding/enabling a bounded keeper window, two advancing warm-up checkpoints, and the vault's normal configuration proposal/application. Worker source pins must then be updated to the verified wrapper before a separately reviewed trading grant. Recording a candidate guard alone is not activation.

See [valuation policy and operating instructions](../../VALUATION-KEEPER.md) for thresholds, budgets and remaining oracle trust assumptions.

Follow-up: the owner reported no deployment in MetaMask Activity. A read-only Monad check returned chain 10143, controller nonce 42 and keeper balance zero. None of the controller's four most recent CREATE addresses matched the reviewed guard runtime. There is still no verified deployment receipt; no live activation is claimed. Resetting native browser control did not restore action-selector interaction.
