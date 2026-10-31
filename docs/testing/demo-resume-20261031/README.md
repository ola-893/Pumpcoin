# Demo continuation · October 31, 2026

**Later recording:** [October 31 recording pass](../recording-20261031/README.md) contains a fresh on-camera enrollment and a separate new investment/redemption. The receipts below remain this earlier historical pass.

**Confirmed:** Muse’s enabled Sepolia vault received a separate 1 test-USDC controller seed. The investor deposited **0.000001 test ETH**, received **0.002239 Pump**, then redeemed those shares **5 hours 49 minutes later** for **0.000000997597011611 ETH before wallet gas**. Exactly **1 Pump seed share**, 1 test-USDC NAV and zero WETH remain. The native gateway allowance is zero.

| Evidence | Scope |
| --- | --- |
| `investor-lifecycle.json` | Canonical deposit/approval/redemption events, exact calldata, independent share/token/gas reconciliation, end state |
| `investor-deposit.json` | Saved exact review compared with mined deposit; capital, not profit |
| `controller-seed.json` | Separate 1 test-USDC / 1 Pump seed and cleared quote allowance |
| `failed-redemption.json` | Earlier redemption reverted 12 seconds after deadline; no shares burned; gas retained |
| `pool-maintenance.json` | Nine approved controller maintenance transactions, separate from agent or investor performance |
| `pool-maintenance-verification.json` | Independent canonical receipt/token-flow and cleared-allowance check |
| `checkpoint-six-observations.json` | Six signed inference errors; unchanged $10,000 virtual cash, zero proposals/orders/positions |
| `checkpoint-seven-observations.json` | Genuine signed HOLD after six retained errors; exact raw provider/model exchanges and deterministic ledger |
| `research-verification.json` | Signatures/replay, unchanged history prefix, seven valuation marks and independent zero-order accounting |
| `recording-registration.json` | Separate fresh Muse RYO Recording local enrollment, saved October 31 at 13:46:02 UTC |
| `recording-source-inventory.json` | Signed source inventory commitment including explicit local template configuration |
| `recording-registration-verification.json` | Registration signatures, synthetic admission receipt and source/template byte checks |
| `original-template.jinja`, `direct-answer-template.jinja`, `template-change.json` | Exact local template change, explicitly separate from weights/runtime hashes |
| `diagnostic-runtime-flags.json`, `diagnostic.json` | Historical-input diagnostics: timeout then rejected invalid classification; never live decisions |
| `external-chrome-verification.json` | Observed UI values compared with saved commitments and ledger |
| `VOICEOVER.md` | Narration constrained to completed actions and explicit recording limits |

## Verified behavior and limits

- External Chrome displayed the actual identity, model provenance, source timestamps, six failures, 1.002239 Pump after investment and 1 Pump after redemption. A connected MetaMask wallet confirmed the investor operations.
- RYO token analysis was partial; sentiment returned successfully. Coinbase practice-book data and Decrypt RSS remain independently attributed. Research is not executable DEX liquidity. A subsequent genuine live ETH HOLD was accepted at 13:41:47 UTC. Its exact exchange cites RYO token research, sentiment and one news post; six errors remain. No funded AI trade or practice fill is claimed.
- The successful return is 2,402,988,389 wei below the initial ETH deposit (about 0.2403%) before wallet gas. This is conversion cost/rounding, not agent trading P&L. Investor transaction gas including the failed on-chain redemption is separately reconciled at 133,715,203 wei.
- Controller setup and LP maintenance are separate receipts. Failed wallet allowance submission did not enter the chain; it was cleared only after activity and latest/pending nonce checks. A retried limited approval succeeded.
- Quote repair gives a full 30-second opening window after simulation. The five-minute chain deadline, canonical block, fresh oracle checks, exact input/allowance and minimum outputs remain enforced. Six targeted tests, build, typecheck and signed-history replay passed. Test fixtures and fork simulation are verification only, never live evidence.
- Fresh local registration was performed in external Chrome for a distinct “Muse RYO Recording” agent at 13:46:02 UTC. It has no vault or research session. Muse RYO Demo retains the original research/financial history. Screen-recording completeness is not independently established. Hardware execution attestation, provider truth and collection completeness are not established by signatures or replay.

## Recorded local runtime recovery

The same Muse weights and executable/runtime files were verified before the genuine live cycle. Changing runtime flags alone timed out after 240 seconds. A reversible local chat-template experiment changed only the generation suffix from `<|start|>assistant` to `<|start|>assistant to=user<|message|>`. The first historical-input diagnostic then completed but invented an empty post reference; validation rejected it. The fresh live cycle independently returned valid JSON and cited supplied evidence. No source inputs or answers were edited.

This is an explicit local experiment, not the official model default. The original signed research policy and engine digest are unchanged. The original enrollment's weights/runtime hashes do not bind launch flags or this external template; that connection is host-observed. The fresh recording registration signs a source inventory that includes its template hash and configuration. Neither is hardware attestation. See the [Meta prompting guide](https://dev.meta.ai/docs/muse-glimmer/prompting) for Muse's reasoning/answer recipients.

With the installed runtime and existing local Muse weights, reproduce the configuration using the files here:

```sh
/opt/homebrew/bin/llama-server --model .local/muse-glimmer/Muse-Glimmer-30B-UD-Q4_K_XL.gguf --alias muse-glimmer-30b --host 127.0.0.1 --port 8080 --ctx-size 8192 --parallel 1 --n-gpu-layers 99 --batch-size 512 --ubatch-size 512 --reasoning off --reasoning-budget 0 --chat-template-file docs/testing/demo-resume-20261031/direct-answer-template.jinja
```

The stored live request/response is inside the seventh receipt. Re-running inference is not guaranteed to reproduce model text exactly; deterministic replay verifies the stored interpretation and ledger. Future live observations require fresh provider availability and source times. No autonomous loop remains active.

## Reproduce

From the repository root with dependencies and contract artifacts installed:

```sh
node --import tsx docs/testing/demo-resume-20261031/verify-research.ts
node --import tsx docs/testing/demo-resume-20261031/verify-recording-registration.ts
shasum -a 256 -c docs/testing/demo-resume-20261031/SHA256SUMS
node --import tsx docs/testing/demo-resume-20261031/verify-pool-maintenance.ts
node --import tsx docs/testing/demo-resume-20261031/verify-investor-lifecycle.ts
node --import tsx --test tests/native-review-timing.test.ts tests/native-investment.test.ts tests/native-investment-service.test.ts
```

The two receipt verifiers use public Sepolia RPC and do not load a private key. RPC responses are a trust boundary. [Deposit](https://sepolia.etherscan.io/tx/0x394d8ce99fea7d76a609ec729e3ea800f5187e5142cfe1132a5efe11ec8e81a6) · [Redemption](https://sepolia.etherscan.io/tx/0x3179e51c9a920155ffc4b24767a595461ea3b5e904727640395947218ac3a020).

Official maintenance references: [Uniswap deployments](https://developers.uniswap.org/docs/protocols/v4/deployments), [router implementation](https://github.com/Uniswap/v4-core/blob/main/src/test/PoolSwapTest.sol). No credentials or raw signed transactions belong in this package.
