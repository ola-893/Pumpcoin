# Muse local registration — 13 October 2026

Muse Glimmer 30B UD-Q4_K_XL was already installed with Ollama. A local APFS clone of those weights runs in the supported llama-server on 127.0.0.1:8081, text-only, with 4096 context. Qwen inference was stopped for this demo.

The measured 15,878,222,368-byte weights digest matches Hugging Face LFS metadata at Unsloth commit faa5b025c584459c13febfa5c59883516710ae39. Runtime measurements hash llama-server and its mapped non-system native libraries; they do not attest the host.

All three real local synthetic onboarding inferences returned HOLD/0. Eight deterministic injected guard challenges passed. These are onboarding checks, not funded trades, a backtest or proof of profitability. Exact requests, raw answer content and guarded outputs are saved in worker-check.json.

The dedicated Muse execution address is 0x4775Ae60A798F58140Ce3c6ab2751106C22fd40A. The declaration uses the existing controller 0xe26468ae02368a75DBDBea58F367B7313942ad26, testnet demo zero configuration notice, a 0.01 test-USDC trade cap and a 0.05 test-USDC exposure cap.

unsigned-manifest.json is a preparation artifact only. The browser creates a new commitment when local measurement timestamps change. The external Chrome flow subsequently completed the three worker inferences, controller wallet signature and agent enrollment signature. The signed record was persisted at 2026-10-13T15:43:09.737Z (16:43 Lagos time); signed-registration.json contains the public receipt. Its deployment is now verified: ERC-8004 identity #2295, vault 0x506Bd00B5E19Da455CbFb04335cF7c4d0eb1f803, receipt 0x5e9d6aea0f052b85ee0694b6c0784abb2d873c883251c333c07716f72c5b8527. Investment, live trading and redemption are not yet established by this bundle.

Muse needs a bounded 512-token completion budget because its reasoning consumes completion tokens before the JSON answer. Other models retain their prior 96-token request format so historical signed receipts are not rewritten. Seventeen registration and decision-receipt tests passed; root typecheck passed.

Public identity and paused-vault creation was simulated successfully on Monad testnet. The preparation read a controller balance of 8.725217347144221736 test MON and estimated a 2.43083034 test MON gas budget, with no blockers. The transaction has zero transfer value. vault-deployment-review.json contains the unsigned deployment calldata and scope. Native MON investment/redemption require a separate gateway setup.

Stable profile: http://127.0.0.1:5173/agents/0xd5acff118c2a3c54378c9dea722aea900049855ebc581177393a81a0b4641755

## Verified protocol provisioning

Trading bundle: 0xDa4C24c42A907964fC948ddD5D8a821DFaBE6Ebc; transaction 0xca84ec194d2677f0292b22607e194e0c4b0467b79e03750477f6cfe78ee05521; actual gas 0.50610819 test-MON.

Valuation guard: 0x1de1Da47D231B41541Aba41d1dA5F687FE06a574; transaction 0xcda57d74d1f8e8dcd31bb33c8240afa3a1a8003b6484d4730b6c3d140786ba97; actual gas 0.119021964 test-MON.

MON gateway: 0x6f79393D0DA6F46c7CD29c958D7bb58316a9599a; transaction 0x3916c62338cc2cdd44c86658e249893b7cf63eb1428212584581fe73c040160c; actual gas 0.26174016 test-MON.

Canonical receipts, runtimes and immutable pins were verified through the operator deployment workflow. Their public manifests are in deployments/agents. Total actual infrastructure gas: 0.886870314 test-MON. Pool liquidity passed the subsequent read; alignment to fresh oracle prices still requires a new check.

The separate encrypted oracle keeper received 1 test-MON with a durable, fixed-recipient funding transaction, gas capped at 0.01 test-MON. See keeper-funding.json. It retains on-demand refreshes and the existing transaction/day/reserve limits. The bootstrap eligibility fix permits requested refreshes for empty, paused, unconfigured guarded vaults only; funded or configured paused vaults remain excluded. Nine keeper tests, the hybrid trading integration regression and the root typecheck passed. Pending recovery handles checksummed addresses, on-demand snapshots exclude inactive agents, and oracle preparation reuses its same block-bound inspection with a canonical-block and sixty-second age check. Independent immutable checks are batched without removing any pins.

The investor selected the connected controller wallet and 0.1 test-MON for the upcoming investor demo. No investment was submitted by this provisioning work.

The keeper received one additional fixed-recipient test-MON top-up after repeated snapshots delayed updates outside the guard skew window. See keeper-topup.json. Total funding is 2 test-MON; existing 2 MON daily gas, 0.3 MON transaction, and 0.1 MON reserve limits remain in force. The keeper runs only within the reviewed time window and explicit on-demand requests. No guard observation, investment, trade or redemption is implied by funding.

The controller approved the configuration proposal in external Chrome. Its canonical transaction is 0xcbaf1ecc2ebae08beece7d18a64360e3f0fdfd29de5c3283372f3be31cc5695c, block 70756940, actual gas 0.03912041322 test-MON. See config-proposals.json. The guard first candidate checkpoint is 0x1c3a2c05e6a7469e384514c71ff485fb0fdc0f982254dce83328af7dd164df55. A subsequent scheduler fix refreshes only the feed that has not advanced beyond candidatePublication+60, preventing repeated USDC updates from starving MON. Configuration is still pending activation.

Guard acceptance was verified at block 70759524: acceptedAt 1791918184, candidateAt 0, status available. The accepting checkpoint transaction is 0xed517db7b590574b62e5571b4d69d942c7692f63e215b67e66d3f79fa2534f90. See oracle-checkpoints.json. This is valuation infrastructure evidence, not trading performance.

Configuration activation confirmed in transaction 0x1a6ad076ee4cb1cee24ccfc6ae29416dc94ebd56ad6b7495e66f3352355f76e5 (block 70759755; gas 0.07910809044 test-MON). Vault enable confirmed in 0xf6440e3bd3b4277a5614e342512f217190b1c1857349ff38706fc4700c0ac809 (block 70760257; gas 0.00423536396 test-MON). The subsequent read found configured=true and paused=false, with investment awaiting fresh prices. These operations transferred zero MON to the vault; no investor shares have been minted yet.

The investor explicitly approved raising the oracle keeper update-count allowance from 24 to 30 for the demo, preserving the 2 test-MON daily spend cap, 0.3 MON per-update cap, 0.1 MON reserve and bounded on-demand window. Prior receipts and gas accounting remain intact.

The investor subsequently explicitly approved one additional test-MON keeper top-up and a 3 test-MON daily keeper gas limit. The update-count limit remains 30, per-update ceiling 0.3 MON, reserve 0.1 MON, and operation on-demand within a reviewed window. This changes only oracle upkeep funding and limits, not the 0.1 MON investor amount.

The original MON gateway 0x6f79393D0DA6F46c7CD29c958D7bb58316a9599a remains deployed and its receipt is preserved, but its immutable source differs from the activated guard. A replacement using the same reviewed gateway contract was verified at 0x03b54B7C55FdfD4956077381c6EF1A983AfcfCb5, bound directly to guard 0x1de1Da47D231B41541Aba41d1dA5F687FE06a574. Creation transaction 0x075be54854d1be44a84756dc147e416673fde23e25343bb0ceb04422bbc0bb2d, block 70762174, gas 0.26173914 test-MON. Source-specific deployment records retain the original baseline and reject mismatched investment routes; replacement is limited to zero cash, positions and share supply. Five native investment/deployment tests and TypeScript passed.

Mined keeper receipts now reconcile their original signed hash, allowed selector/value/fee, signer, chain, canonical block, confirmations and gas accounting without a duplicate full vault snapshot. Unmined rebroadcasts and every new update retain the full runtime/dependency inspection. The ambiguous-send recovery regression explicitly forbids a second vault snapshot once its receipt is mined; nine keeper tests and TypeScript pass.

The controller-approved guard checkpoint 0x3581199bdaab9e01c39962becb499e896131fda5727d544180ffbbe69bf99510 confirmed at block 70764047 (gas 0.01775691468 test-MON); guard acceptedAt 1791919585 and candidateAt 0 were verified. The 0.1 MON investment simulation subsequently revealed FirstDepositTooSmall: registered vaults require 1 test-USDC to initialize. No investment transaction was submitted. The user explicitly approved seeding 1 test-USDC from the connected controller before the separate 0.1 MON demo deposit, and raised the keeper count allowance to 40 while retaining its 3 MON daily gas cap, 0.3 MON transaction cap and 0.1 MON reserve.

The investor UI now displays the on-chain first-deposit minimum while supply is zero, and maps the forwarded FirstDepositTooSmall contract error to an actionable message. Exact bounded quote-token approvals can be prepared during price warm-up without previewing NAV; deposits, redemptions and trades still require live readiness. Native/hybrid service integration tests and TypeScript pass.

Seed deposit verified in 0x1d9af03f38461fcc56f006e46bf68a42b092e5ca7581ba8f11e32661dfcfec84 at block 70767126: 1,000,000 quote base units deposited and 1,000,000,000,000 share base units minted to the connected controller. See seed-deposit.json. This is 1 test-USDC capital and 1 Pump share, not profit. The user explicitly approved a final keeper ceiling of 4 test-MON daily gas and 50 updates, plus a fixed 1 test-MON top-up (keeper-topup-3.json). Its 0.3 MON update cap and 0.1 MON reserve remain. keepWarmRequests preserves explicitly requested ten-minute windows instead of ending them immediately at the first healthy snapshot; expiry, request scope, fee caps and reserve still apply. Twelve keeper/native/frontend API tests and TypeScript passed.
