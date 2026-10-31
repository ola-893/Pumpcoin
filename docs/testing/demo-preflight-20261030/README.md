# October 30 demo readiness evidence

This folder preserves readiness checks. It is not a completed new-agent investment/redemption demo. Follow [the live checklist](../../DEMO-CHECKLIST.md) for that status.

- `readiness.json`: the initial read-only local baseline, before a research policy/session existed.
- `strategy-artifacts.json`: the current declaration's source inventory. Its SHA-256 commits to these source bytes; it does not establish that they ran or are secure.
- `policy-proposal.json`, `evidence.json`, `trace.json` and `summary.json`: a passed **unsigned rehearsal** using the existing Muse Sepolia enrollment; never inserted into the new agent's signed history. Inference ran 19:19:59–19:22:43 UTC and proposed HOLD.
- `engine/` and `rehearsal-artifacts.json`: exact source snapshot used for that rehearsal. The verifier uses this snapshot, so later live-engine changes do not rewrite the historical prompt.
- `fresh-registration.json`, `fresh-enrollment-worker.json`, `fresh-policy.json` and `fresh-checkpoint.json`: the new Muse RYO Demo enrollment and signed practice history, including retained failures. These belong to the current run, separately from the unsigned rehearsal.
- `vault-preflight-diagnosis.json`: live full-document registry storage failure and successful commitment-only creation simulation; not a deployment receipt.
- `chain-readiness.json`: balances, infrastructure code pins, feed freshness and active pool liquidity at one anchored Sepolia block; no new-agent vault or executable quote is established.

The RYO pack timestamp can be generation time. Component dates and unknown technicals/chain/contract stay visible. RYO token and sentiment tools can share an upstream source. Coinbase public spot-book depth is independently attributed and used for virtual practice only; it is not Sepolia pool liquidity. Decrypt publication selection and previews are recorded in the exact prompt.

Two earlier model attempts timed out (90 seconds, then 180 seconds). Their failure summaries are retained when packaged. Muse's template does not consume `enable_thinking`; the installed llama-server supports `reasoning_effort: none`. The final request records that setting explicitly, but subsequent runs show that this alone does not guarantee a short response or completion within the live deadline. Do not treat that setting as proof that internal reasoning was disabled. [Server API reference](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#post-v1chatcompletions-openai-compatible-chat-completions-api).

Reproduce local consistency checks from the repository root:

```sh
npm test
npm run typecheck
npm run build
npm run lint
node --import tsx docs/testing/demo-preflight-20261030/verify-rehearsal.ts
node --import tsx docs/testing/demo-preflight-20261030/verify-current.ts
```

The model incorrectly described `745046280792` micro-USD of depth as “745B notional.” Actual observed depth was **$745,046.280792**. The unedited model output remains visible as a judgment; the deterministic guard used integer micro-USD and blocked entry. The current prompt now explicitly states the scale and distinguishes RYO USD prices. A new signed live session must verify that clarification; the archived rehearsal is not proof of the updated prompt's behavior.

The last command requires the saved `policy-proposal.json`, `evidence.json` and `trace.json` plus the archived engine source. It replays normalization, source/timing checks, prompt construction and entry guards. It does not rerun the model or independently authenticate the provider response. A new live observation may differ and needs current provider availability and the declared local model. No credentials belong in this folder.
