# Screen-recording pass · October 31, 2026

All three scenes were performed in external Chrome during this pass: local registration, investor evidence inspection, and a fresh Sepolia deposit/redemption. The video file itself was not independently inspected.

| Scene | Verified result |
| --- | --- |
| Registration | Fresh signed version of **Muse RYO Recording**, saved at **16:27:26 Lagos**. Three local admission inferences, eight injected guard challenges, controller/execution signatures. Both signed versions retained. |
| Investor inspection | Existing **Muse RYO Demo**: genuine signed ETH HOLD, separately attributed RYO/Coinbase/news observations, six retained errors, $10,000 virtual equity, zero positions. Browser replay matched seven observations. The model decision was captured earlier at 14:41:47 Lagos; it was inspected rather than rerun during this pass. |
| Investment | **0.000001 test ETH → 0.002239 Pump**, mined at **16:35:12 Lagos**, block 12034767. |
| Redemption | **0.002239 Pump → 0.000000997597061804 test ETH before gas**, mined **8 minutes 36 seconds later** at **16:43:48 Lagos**, block 12034809. |
| End state | **1 Pump seed**, 1 test-USDC NAV, zero WETH and zero native-gateway allowance. No funded agent trading permission was granted. Chrome showed 1 Pump and a verified receipt. |

Fresh local enrollment and financial agent are separate identities. The new registration has no linked vault or research policy. It must not inherit the original agent's history. No funded AI trade, trading profit, strategy winner or performance rating is claimed. Conversion difference is 2,402,938,196 wei before gas (about 0.2403%); investor gas totals 129,359,422 wei, below the 0.0001 test-ETH ceiling.

## Evidence

- `registration.json`: fresh enrollment, manifest `0xccdade5532a7479513deb780478d008a286d20201561a958bdc3b40636d51f6d`; registration `0xc612e56ef6990289a2be162f1588fc9065b6892923e3a7b69adf040c1c38c4d0`.
- `deposit-review.json`, `approval-review.json`, `redemption-review.json`: exact simulated transactions, minimum outputs, values and deadlines used during the recording.
- `deposit-chain.json`, `approval-chain.json`, `redemption-chain.json`: public mined transactions, receipts and canonical blocks.
- `expired-redemption-review.json`: earlier browser review expired without submission; refreshed review succeeded. There was no second deposit or on-chain failed redemption in this pass.
- `verified-lifecycle.json` and `verify.ts`: independent live RPC reconciliation of reviewed calldata, canonical receipts, deadlines, shares, return, seed, allowance and gas.
- `external-chrome.json`: host-observed UI values compared with stored/chain evidence; no cryptographic screen attestation.
- [Source inventory, template declaration and original/modified templates](../demo-resume-20261031/README.md), [seven-observation checkpoint](../demo-resume-20261031/checkpoint-seven-observations.json), [original signed financial/research registration](../demo-preflight-20261030/fresh-bound-registration.json).
- [Voice-over script](VOICEOVER.md).

## Reproduce

From the repository root, with dependencies and contract artifacts installed:

```sh
node --import tsx docs/testing/recording-20261031/verify.ts
node --import tsx docs/testing/demo-resume-20261031/verify-research.ts
shasum -a 256 -c docs/testing/recording-20261031/SHA256SUMS
```

The lifecycle verifier uses public Sepolia RPC and loads no private key. It compares exact recorded hashes, rather than attributing later transactions to this pass. The previous pass's verifier was also bounded to its original redemption block and rerun successfully; later recordings must not change its historical outcome.

Signatures establish declarations and signers, not hardware execution, provider truth, complete coverage or profitability. Replay verifies the stored transformations and accounting; it does not regenerate the model answer. [Deposit](https://sepolia.etherscan.io/tx/0x9f2982b83d3ca155dd6177a0477e16a1c1594a7ca7d314838e39e5574f7aa379) · [Allowance](https://sepolia.etherscan.io/tx/0xa998e33a179fb8de39bb5d51b59e103133277f0bdb0d9b68a260cd9f48a42e7e) · [Redemption](https://sepolia.etherscan.io/tx/0x7c461a0f338b604ec0137180fe79a37984eb6725324a85a966192e8bfae90fa2).
