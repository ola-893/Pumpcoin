# Pump RYO provenance and correctness audit

Scope: the existing market/news and Multi-KOL strategies, agent registration/profile/evidence flow, and practice ledger. No new strategy, financial transaction or public deployment was added.

## What is authentic here

[observed-state.json](observed-state.json) records a read-only check of the actual local database and API for the existing Gemma Demo registration. RYO access, response mapping, news feeds and X access were all unconfigured. The actual database had **zero policies, sessions, evidence captures, decisions and events**. No authentic provider response, market-aware local-model exchange or practice trade existed to trace.

External Chrome (Guest session, without connecting a wallet) showed the same state on Gemma's overview, trading-history and identity/evidence tabs: **Practice setup required**, required source configuration, and **No signed research policy or practice history is recorded for this agent**. The enrollment inference receipt was separately labelled synthetic. The manifest commitment shown in Chrome matched the public API inventory. Populated portfolio/decision rendering remains unverified with genuine data.

Everything under `accounting-cases.json` and every source/model example in the audit tests is **test-owned synthetic material**, never live agent history. None was inserted into the real research database or published.

## Demonstrated weaknesses and repairs

| Weakness | Repair and regression evidence |
| --- | --- |
| Queued entries could fill after cooldown became active or beyond the current risk budget | Recheck both limits at execution, including earlier fills within that observation. `research-audit.test.ts`. |
| A fresh-enough but regressing quote could exit or revalue a position using older information | Retain the last position observation time; reject older exit/fill observations and report an unavailable mark. `research-audit.test.ts`. |
| Synthetic evidence could advance an existing pending order | Reject synthetic ledger advancement. Test inputs for arithmetic remain isolated test fixtures, never product data. `research-audit.test.ts`. |
| Copied/reposted consensus could depend on classification order | Transitive evidence grouping plus bipartite account/group matching. At most one count per account and evidence group. `research-audit.test.ts`, `research-strategies.test.ts`. |
| Inference and source timestamps were not fully checked | Enforce capture ≤ inference start ≤ inference end ≤ decision; publications, retrievals and observations cannot postdate capture. `research-provenance.test.ts`. These are consistency checks, not independently trusted clocks. |
| Only normalized observations were retained, making transformations difficult to reproduce | Retain decoded raw bodies, tool arguments/request IDs, mapping/catalog and receipt times; recompute normalized observations and coverage claims before accepting/exporting checkpoints. Reject mismatches. `research-provenance.test.ts`. |
| One market timestamp could conceal old liquidity or safety information | Require separate mapped price/liquidity/safety timestamps and use the oldest for eligibility. An authentic provider contract is still required. `research-provenance.test.ts`. |
| Selected opposing posts could be omitted from entry classifications | BUY output must classify every selected post for its proposed symbol. Sentiment remains a model judgment. `research-provenance.test.ts`. |
| Exact model response envelopes were discarded | Retain full successful response JSON and verify model, completion status, no tool call, and exact content against interpretation. A re-signed truncated envelope is rejected. `research-provenance.test.ts`. |
| Local reads did not bind policy signing keys back to the public registration | Require the registration ID/manifest and registered controller/execution keys, in addition to the policy signatures. A substituted stored key is rejected. `research-runtime.test.ts`. |
| Stored aggregate state and events could diverge from signed decision history | Reconcile signatures, policy/session binding, sequence/counters, raw normalization, events and portfolio before serving reads or exports. Cache successful verification by the complete input fingerprint. `research-runtime.test.ts`. |
| A single lane could establish a common window; unequal lifetime returns appeared beside each other | Require two distinct strategies, show lifetime returns as unequal-period results, calculate overlapping-period metrics with explicit observed boundaries, and count qualified shared evidence. Insufficient samples remain inconclusive. `research-audit.test.ts`. |
| Partial database failures could leave uncertain persisted state | Controlled duplicate-event insertion confirms transactional rollback of evidence, receipt, events and aggregate state; a repeated commit is rejected. Restart/lease tests retain state. `research-store.test.ts`. |

## Transformation trace and trust boundaries

| Stage | Material and transformations | What a reviewer can check |
| --- | --- | --- |
| Retrieval | Reviewed MCP tool arguments, matching JSON-RPC response IDs, decoded body text, tool catalog/mapping, source receipt time. HTTP errors/timeouts produce source failure status; failed bodies are not retained by this initial adapter. | Captured successful requests/responses can be linked and replayed. No provider credential or auth header is captured by the transport. HTTPS acquisition is not independently attested. |
| RYO normalization | Exact configured JSON Pointers; decimal-to-six-place integer units; explicit-timezone timestamps; provider identity/network/mode; oldest price/liquidity/safety timestamp. | Raw-to-normalized equality. The test mapping is not a real RYO schema. Ticker/identity and safety semantics remain provider-contract gates. |
| News normalization | At most 50 entries/feed; malformed/missing publication/link/title entries skipped; HTTPS references; HTML tags stripped; normalized text capped at 4,000 characters; copied text grouped. | Original decoded feed body and deterministic parser output. Feed truncation, syndicated stories, edits, licensing and source truth remain limits. |
| X normalization | First page, up to 20 posts per selected account; author filtering; origin references for reposts/quotes; text capped at 4,000 characters. Empty successful pages are distinct from missing access. | Original response and origin/account attribution. This is not full historical collection or proof of independent account control. |
| Prompt selection | Remove stale/future publications; choose ten latest news posts or latest post per selected account; 500-character previews. Exact selected IDs/text/counts are in the request. | Reconstruct the exact prompt from evidence and policy. Omitted material is not treated as interpreted evidence. Limited context can omit an older opposing post; the UI must not imply full narrative coverage. |
| Local interpretation | Strict action, citations and per-post sentiment/conviction/urgency; exact request, full successful response, content and timestamps retained. Loaded model artifacts checked around the call. | Unsupported references, omitted selected entry classifications, truncation and envelope mismatches fail. Neither sentiment truth nor actual execution is attested by a signature. Failed inference envelopes are not currently retained. |
| Deterministic decision | Signed signal/risk rules, source availability/freshness, independent text/account groups, sizing, delayed order eligibility. Sensitivity removes evidence from deterministic checks only. | Replay the same guard outcome and order without rerunning the LLM. Sensitivity is not causal proof of market price movement. |
| Practice execution | Virtual USD has six decimals; quantity has twelve. BUY price rounds upward, quantity rounds downward, unused rounding dust stays in cash. BUY fee rounds upward on requested notional; SELL fee rounds upward on observed gross proceeds. Adverse slippage applies both ways. | Independent Python calculations below; no fill before a later eligible quote; no double fill; final cash = initial cash + realized P&L after closing all positions. Stops execute at observed gaps, not guaranteed prices. |
| Persistence / UI | Atomic receipt/evidence/event/portfolio transaction; replay-checked local reads; immutable published checkpoints with prefix/fork checks; query caching separate from chain requests. UI labels model judgments and normalized previews, with raw/trace inspection. | Database/API/Chrome agreement for the authentic empty state. A full populated genuine-data walkthrough and cloud publication remain blocked. |

## Independent checks and reproduction

Use the project Node 22 runtime and installed dependencies. From the repository root:

```sh
python3 docs/testing/ryo-audit-20261017/accounting-reference.py
node --import tsx --test tests/research-audit.test.ts tests/research-provenance.test.ts tests/research-store.test.ts tests/research-runtime.test.ts tests/research-strategies.test.ts tests/practice-ledger.test.ts
npm test
npm run typecheck
npm --prefix app run build
npm run lint
```

The Python reference imports no Pump code. Its fixed-seed 24 cases independently calculate entry price/quantity/cash, entry and exit fees, adverse stop-gap proceeds, realized P&L and final cash. The TypeScript tests compare the ledger to those saved reference values, rather than generating expectations with the implementation under test.

For a fresh authentic local inventory, run Pump locally, then:

```sh
node --env-file-if-exists=.env --import tsx docs/testing/ryo-audit-20261017/collect-state.ts
```

This deliberately exports only configuration booleans, table counts and public registration identifiers. It does not sign a policy, start a worker or call an external provider. It overwrites the inventory artifact with the operator's current observations; preserve the original if comparing runs.

The source commitment now also includes scheduler/service, persistence, checkpoint verification, comparison and its own digest definition; it is a commitment to the listed implementation files, not a runtime/OS attestation.

See [verification.json](verification.json) for recorded command results and [manifest.json](manifest.json) for source/artifact SHA-256 digests. Run `python3 docs/testing/ryo-audit-20261017/verify-package.py` to check them. These digests make the audit package reproducible; they are not an external attestation of the audit itself.

## What signatures establish

- Controller and execution signatures bind exact practice authorization, agent/manifest, policy limits, engine commitment, nonce, origin and expiry. They convey no funded-vault authority.
- Decision signatures bind the operator's recorded evidence, interpretation, timestamp, sequence and previous hash. Removing/changing an interior record breaks replay; conflicting published prefixes are detected.
- Checkpoint signatures bind the exported state and history. Replay independently checks the deterministic accounting and transformations for that engine.
- They do **not** prove provider truth, actual model execution, trusted timestamps, account independence, complete source retrieval, absence of withheld attempts/tail records, best execution, licensing or profitability. The signed-fixture test deliberately shows that a test key can sign fabricated but internally consistent observations. Failed attempts before a signed commit are not a complete audit log.

## Comparison result and open acceptance gates

**Insufficient evidence. No strategy winner.** There are no genuine sessions, common observation window, shared qualified captures or closed practice positions to compare.

Remaining dependencies: official RYO builder endpoint/access and authentic schemas/semantics (including all three observation times); authorized X reads; allowlisted licensed news feeds; a running registered local model with enough context; and genuine cycles for both strategies under the same reviewed policy. Then verify source captures, delayed fills/exits and overlapping-period results in Chrome. Hosted storage publication/read must also be checked separately.

The audit changes the research-engine digest. No real policy existed to migrate. Historical signed policies/checkpoints require their original engine and are not silently rewritten. Existing funded vaults, funded strategy code and historical investment receipts were outside this repair scope.

Protocol reference: the [official MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) documents response-ID/session behavior and the negotiated protocol-version header. This supports transport checks, not a claim of RYO compatibility. RYO's [public program site](https://ryobuild.com/) did not supply an authenticated tool schema during the audit.
