# RYO-CHAN implementation plan for Pump

Status: implementation added for both strategy paths, signed policy/evidence, practice accounting and integrated profile UI. Authentic RYO/X access, genuine local-model research runs, live strategy comparison and cloud publication remain open acceptance gates. See [implementation and setup](RYO-CHAN.md) and [local verification](testing/ryo-integration-20261016/README.md).
Prepared: 16 October 2026, Africa/Lagos.

## 1. Product outcome

Pump becomes a place to register a locally hosted trading agent, define the evidence and rules it follows, observe its practice decisions, and inspect the resulting track record before considering a separate funded vault allocation.

The RYO work is the research and practice stage of Pump's existing agent lifecycle. It is not a separate RYO dashboard, a second agent directory, or a disconnected trading chatbot.

Core journey:

1. Register a real local model and agent identity using the existing workflow.
2. Sign a research policy: markets, sources, strategy, practice capital and risk limits.
3. Start the agent's practice runtime from its existing profile.
4. Follow sourced research, accepted/rejected decisions and practice positions on that profile.
5. Inspect the evidence and deterministic checks behind every decision and outcome.
6. View any existing Monad vault separately under the same agent identity. Practice history is evidence for evaluating the agent; it never becomes funded-vault performance.

The primary submission is Autonomous Agents. Pump's existing directory and profile also demonstrate the interface work. A New Skills submission is optional only if an original research capability is delivered against RYO's actual published tool specification; it is not an MVP dependency.

Official program reference: https://ryobuild.com/ . The supplied brief emphasizes market interpretation, practice trades, cause and effect, repeatable decision records, and optional Multi-KOL narrative convergence. Exact API endpoints, schemas, credentials and submission conditions must be confirmed during milestone 0; do not infer them from tool names.

## 2. Scope and implementation decisions

- Only RYO-CHAN integration is in scope. No CRE, FlowPay, x402 or unrelated protocol work.
- Practice execution is the delivered execution mode. It cannot send chain transactions, approve tokens, fund execution wallets, mint Pump shares or modify live trading permissions.
- Keep Pump's local-model policy. Use an installed non-Muse model such as the registered Gemma agent when available; verify the actual process and artifacts at implementation time. No silent hosted fallback or substitution with Qwen.
- Use the same registered agent, model measurements, version selection, evidence conventions and profile routes as the rest of Pump.
- RYO research is a first-class input to the decision runtime. Fetching data for an otherwise unrelated sidebar does not count as integration.
- Required market/safety inputs failing or becoming stale blocks new practice entries. Missing inputs remain missing. An existing position is marked unpriced when no valid execution/mark data exists; it is not closed at an invented price.
- Keep existing signed registrations, historical receipts, deployed contracts and previous testnet investments intact.
- A fresh practice session must not require a deployed or healthy vault. Monad oracle failures must not block practice research or rendering practice history.
- Implement spot-only practice BUY/SELL/HOLD initially: no leverage, shorts or derivatives execution. Derivatives data, if exposed by RYO, can be cited as research context only.

Confirmed user direction: implement BOTH market/news research and Multi-KOL narrative convergence, then compare originality and demonstrated reliability before choosing the submission's leading strategy. Both use the same Pump identity, runtime, evidence formats, risk/execution engine and profile. Their policy revisions, practice portfolios and evaluation results remain separately attributable. Live social-source access is a Multi-KOL release gate, not something to replace silently with sample posts.

## 2A. Two strategies, one integrated product

Strategy A — Market & News Evidence:

- Collect market overview, candidate research and safety evidence from RYO plus a small allowlisted set of timestamped news sources.
- Resolve the asset mentioned by a story, identify the original announcement/source where available, and distinguish verified facts, source claims and the model's interpretation.
- Evaluate the news thesis against observable market conditions and contradictory evidence. A story's popularity does not establish its truth or justify a trade.
- Produce a structured practice BUY/SELL/HOLD with cited catalysts, rule results, sizing and exit conditions. Treat an unverified catalyst or unavailable required evidence as a visible blocked/HOLD condition.

Strategy B — Multi-KOL Narrative Convergence:

- Monitor up to 20 selected voices, beginning with a small real-source watchlist to verify the end-to-end integration.
- Extract token mentions, sentiment, conviction and urgency, count distinct independent support under the declared deduplication rule, and show conflicting views.
- Require the signed convergence rule AND RYO market/safety checks to pass before entry. Urgent language never overrides risk limits.
- Record which evidence changed the convergence result and why the resulting action differs from the prior decision.

For a concrete original mechanism, add evidence-sensitivity inspection: replay the deterministic signal/risk layer with one cited source or creator omitted and show whether its removal changes the threshold result. Keep the original receipt unchanged and label the derived view as a counterfactual inspection, not a historical decision or new observed fact. Offer the equivalent catalyst-removal inspection for the news lane. This makes the contribution of an individual source visible instead of merely presenting a model-written explanation.

Both strategies are capabilities of a registered Pump agent. Operators can enable either or both in its research configuration. Evaluation uses two labelled virtual sessions under that identity; it does not start two funded traders or mix their cash/exposure. Routine sessions share a per-endpoint inference queue, with start/stop controls per strategy and one agent-level overview.

### Comparison protocol

Agree and freeze the comparison configuration before evaluation: same measured local model/runtime, supported market universe, observation window, market snapshots where applicable, virtual starting capital/currency, risk constraints, fee/slippage assumptions and polling schedule. The different news versus social evidence is an explicit experimental difference. Queue execution may occur sequentially; record each inference's actual start/finish and data age rather than claiming simultaneous decisions.

Each lane has its own signed strategy/policy hash, decision chain and virtual ledger. No shared hypothetical capital, double-counted returns or merged winning trades. Missing evidence is a result, not a reason to silently substitute another strategy. Keep all sessions, rejected decisions, resets, policy revisions and unsuccessful runs.

Evaluate:

| Dimension | Measured evidence |
| --- | --- |
| Reliability | Completed scheduled cycles, source availability, invalid outputs, failure/recovery behavior, duplicate events and restart correctness |
| Evidence quality | Citation validity, source attribution, freshness, missing-data disclosure, contradictory evidence and deterministic replay results |
| Decision usefulness | Whether new observations change explicit signal components/actions, whether rejected candidates are explained, and whether exits follow the original policy |
| Operational cost | Provider requests, inference duration, queue delay, token counts where supplied, storage and documented API costs; unknown cost is not zero |
| Practice outcomes | Net return, drawdown, exposure, closed-position sample count and fees over the same window; no profitability requirement or claims of skill from a short sample |
| Originality | Human review of specific original mechanisms, integration depth, comparison with cited prior work, and how much useful behavior is more than raw API/model output |

Do not invent an automatic innovation score or optimize a composite score after seeing results. Require correctness gates for both lanes first: attributable real inputs/inference, no duplicate fills, replayable accounting, restart persistence and explicit source failures. Prefer the strategy that passes those gates and has the clearest original mechanism and causal demonstration. State inconclusive results when coverage or samples differ too much.

Deliver a comparison section within the same agent profile, plus an exported evaluation report linking exact policies, model measurements, sessions and coverage. Report both the full observation window and any common-data subset separately. Synthetic failure tests and historical replay results are useful but cannot count as successful live observation cycles.

The final submission can lead with the stronger strategy while retaining the other as an inspectable comparison. Both are implementation requirements; a blocked social adapter must be reported as blocked rather than described as a completed second strategy.

## 3. Current code to extend

| Existing area | Current role | Planned integration |
| --- | --- | --- |
| `app/src/lib/registration.ts`, `AgentRegistration.tsx` | Model declaration, wallet consent and local admission | Add the signed research-policy step and practice-first completion path |
| `agent-registration/core.ts`, `service.ts`, `types.ts` | Exact manifest commitments and registration persistence | Associate versioned research policies with the exact registration without rewriting its manifest |
| `local-inference/discovery.ts` | Loaded weights and runtime measurements | Reuse model matching before and after research inference |
| `agent-registration/worker.ts`, `proposal.ts` | Local inference and bounded spot proposals | Extract reusable transport/model checks; add a separate versioned research request/output schema |
| `agent-registration/decision-receipt.ts` | Signed, linked execution evidence | Reuse canonical encoding/signature conventions in a distinct practice receipt format |
| `agent-registration/autonomy-runtime.ts` | Local operator start/stop/status | Add practice runtime lifecycle and shared per-model inference scheduling |
| `market-data/` | DEX Screener research, outside the current decision prompt | Add RYO adapters, typed evidence envelopes and immutable snapshot capture |
| `AgentDirectory.tsx`, `AgentProfile.tsx`, `AgentStateEvidence.tsx` | Discovery, agent history, chain state and evidence | Make practice state, decision history and track record part of the same surfaces |
| `app/src/lib/query-client.ts`, agent-state hooks | Shared React Query state and historical snapshots | Add mode-aware practice queries without reintroducing blocking chain loaders |
| `hosting/api.ts`, `hosting/storage.ts`, public exporter | Hosted reads and historical registrations | Publish verified practice checkpoints through a dedicated ingestion/read path |
| `vault/ledger.ts`, `vault/nav.ts`, `vault/chain-history.ts` | Funded-vault accounting | Leave as funded accounting; do not coerce practice events into its ledger |

Important limitation: the present worker mainly receives balances and freshness/valuation flags. Its existing onboarding check uses synthetic inputs. Neither is an implementation of market-aware RYO practice trading. Existing funded decision receipts also assume a vault and anchored chain snapshot, so they must not be relabeled as paper decisions.

## 4. Integrated architecture

```text
Registered Pump agent + signed research policy
                  |
          Local practice runtime
                  |
     RYO tools + configured source adapters
                  |
   Validated, immutable market evidence bundle
                  |
        Local model interpretation
                  |
    Citation validation + deterministic signals
                  |
       Practice risk and execution rules
                  |
     Atomic decision + practice ledger commit
                  |
   Signed checkpoint -> Pump directory/profile
```

The LLM interprets evidence and proposes an action. Deterministic code resolves instrument identity, validates references, applies signal/risk rules, computes permitted size, and records simulated fills. Model text cannot define provider URLs, invoke tools, choose signing keys, override caps or manufacture execution prices.

## 5. Identity, policy and evidence model

### Signed research policy

Introduce `AgentResearchPolicy-v1`, signed with a distinct consent domain by the controller and execution key. Bind it to the existing registration ID and manifest commitment, controller, execution key, policy nonce and version. Signature scope is practice research and receipt attribution; it grants no financial authority.

Policy fields:

- Enabled strategy kinds and versions, with separate signed policy bindings; prompt, signal-engine and risk-engine digests.
- Supported instrument identifiers, source allowlist and market network/venue.
- Observation freshness limits, evidence window, cadence and API/inference budgets.
- Optional selected KOL account IDs (maximum 20), operator-assigned weights, convergence threshold and dissent rules.
- Virtual starting capital, risk per position, maximum position and total exposure, concurrent positions, entry cooldown and daily loss/drawdown limits.
- Entry, stop, target, time exit, sizing and re-entry rules.
- Versioned fill, fee, slippage and mark-to-market assumptions.

No retroactive modification of policies or historical balances. Policy edits create new signed revisions and evaluation periods. Open positions keep their originating policy and exit rules until closed; the MVP waits for them to close before starting the new revision. A reset creates a visibly new session and retains the old history.

### Proposed records

| Record | Required contents |
| --- | --- |
| `ResearchPolicy` | Agent/registration binding, signed policy and implementation versions |
| `ResearchSnapshot` | Source, tool/version, request arguments, instrument identity, observation/retrieval times, availability and raw/normalized content hashes |
| `NarrativeSignal` | Evidence references, deduplicated creators/posts, token resolution, sentiment, conviction, urgency and convergence components |
| `PracticeDecision` | Session/sequence/previous hash, policy hash, evidence bundle hash, model/request/output references, cited factors, proposal, guard results and final outcome |
| `PracticeEvent` | Virtual capital initialization, order intent, fill/rejection, position change, mark, close and fee; each linked to its cause |
| `PracticeCheckpoint` | Signed decision/event heads, coverage, last observed times, schema versions and metrics digest |

All records distinguish `live-observed`, `historical-replay` and `synthetic-test`. A published source or signed receipt does not establish source truth, complete history or attested model execution. Published checkpoint retention makes later rewriting detectable to a reader retaining earlier heads; an operator can still withhold unpublished decisions or entire forks.

## 6. RYO market and optional social ingestion

Milestone 0 must obtain the current official RYO MCP/REST documentation and an authentic response. Pin a supported schema version or explicit adapter version; record capability discovery rather than invent endpoint paths or response fields.

The program names `market_overview`, `scan_market`, `analyze_token`, `deep_analysis`, `compare_tokens`, `check_safety` and `supported_tokens`. Implement only the subset needed by the selected strategy first. Prefer REST for a bounded server adapter if both documented transports offer equivalent evidence; retain a provider interface so transport does not leak into domain logic.

Requirements:

- Server-only credentials; allowlisted provider hosts and tools; request size/time/concurrency/rate limits; bounded retries and backoff.
- Resolve assets by provider instrument ID and chain/contract where relevant. A ticker alone is insufficient. Ambiguous mentions remain unresolved and cannot open a position.
- Preserve provider observation time separately from retrieval time and cache age. Unknown provider time limits what freshness can be established.
- Validate units, decimals, quote currencies, source availability and safety fields. Missing liquidity/safety data is not a passing check.
- Store a bounded immutable evidence bundle before inference. Preserve exact input bytes where licensing permits; otherwise retain permitted normalized fields, identifiers and hashes and disclose reduced replayability.
- Treat source text as untrusted data. Links/posts cannot issue system instructions or alter the runtime's risk policy.
- Never map a RYO/mainnet asset price onto Pump's testnet WMON/test-USDC vault accounting. Research instrument identity and funded instrument identity remain explicit.

For Multi-KOL:

- Select and validate up to 20 account IDs inside the same agent configuration; a handle change does not silently change identity.
- Use an authorized X API/data provider. Confirm access and cost before promising live monitoring. Discord/Telegram are optional and require access to the selected channels.
- Keep original post IDs, authors, timestamps, links, quoted/reposted provenance and fetch cursors. Deduplicate the same underlying message so copied posts do not count as independent support.
- Extract mentions, sentiment, conviction and urgency with source references. These are model classifications, not objective truths or automatic trade commands.
- Compute convergence deterministically from distinct selected voices in a signed lookback window; publish the exact rule components, evidence coverage and counter-signals. Operator trust weights are preferences, not verified creator reputations.
- Late/deleted/edited posts append observations; they do not rewrite earlier evidence. Never use a post for an earlier decision before it was observable.
- An explicit historical-replay mode can demonstrate source logic, but cannot be labelled live monitoring. If live access is unavailable, keep that lane visibly blocked or historical-only, progress the market/news lane, and resolve access before calling both strategies complete.

## 7. Decision, risk and practice execution

The model returns structured interpretation: resolved candidate IDs, evidence references, supporting/conflicting factors, proposed action, time horizon and proposed exit rationale. Any claimed numeric fact must refer to a validated evidence field; UI values are read from those fields rather than copied from prose. Reject unsupported references and malformed/incomplete inference.

Store the exact bounded request and raw response under a declared publication policy. Public records show concise decision factors and outcomes, not hidden model reasoning. Private strategy prompts can remain local, but withholding them must be disclosed as limiting full inference replay.

Deterministic guards enforce source freshness/completeness, token identity/safety, strategy entry conditions, available virtual cash, sizing, exposure, concurrent positions, cooldown and loss limits. Record model HOLD, risk rejection, unavailable input and runtime error as different outcomes. Valid exits remain evaluable when entry-only checks fail; missing price evidence blocks pricing an exit rather than inventing one.

Position sizing is computed from the signed policy and ledger, bounded by available virtual cash, maximum notional, remaining portfolio exposure and risk budget divided by stop distance. Prices/amounts use integer or decimal-safe arithmetic. No positive-risk entry without a valid bounded stop. Proposed invalid sizes cannot become accepted through silent clipping without a visible guard result.

Practice fills:

- Persist the decision/order intent before fill evaluation.
- Use the first eligible observed quote after the decision plus the configured execution delay; no pre-decision quote or look-ahead fill.
- Apply declared adverse slippage and fees. These are simulation assumptions, never claimed actual executions or gas expenses.
- Apply the same execution model to entries and exits. Handle price gaps at the available price rather than guaranteeing a stop price.
- If candle-based replay is used, only completed observable candles are eligible. When both stop and target occur in one candle without ordering evidence, use the documented conservative stop-first rule.
- If a quote never arrives or becomes stale, retain an unfilled/blocked intent according to policy expiry. A restart cannot create another fill.

The worker must continue to review open positions and produce policy-driven exits, not just accumulate BUY recommendations.

## 8. Persistence, runtime and hosted publication

Use a local SQLite database for immutable snapshots, signed policies, decisions, practice events, cursors and pending publication. Choose a maintained Node-22-compatible SQLite driver during implementation. Commit each decision and its resulting ledger mutations in a transaction, with unique cycle/order/event IDs and one writer per session. The funded-vault journal remains untouched.

Start with a supervised local CLI worker, not a Vercel request or Vite development lifecycle as the scheduler. It owns polling, model checks and durable restart recovery. Expose start/stop/run-once/status through the existing authenticated local operator helper. Stop/resume behavior and remaining pending work are explicit.

Use a per-inference-endpoint queue and bounded concurrency, so practice and funded workers do not race for the same model. Recheck actual model identity; stop on an artifact mismatch. A registered Muse agent cannot silently run on the Gemma server now occupying its endpoint.

For hosted Pump, add a dedicated append-only publication API and storage namespace. The current Blob adapter only stores transaction reviews and is not a general event database. Do not reuse transaction-review paths or ephemeral function files as practice history.

Publication carries verified agent/registration binding, execution-key signatures, ordered sequence and previous head, policy hash and idempotency key. Validate schema, content hashes, signer, bounds and storage authorization before accepting immutable objects. Enforce append consistency with a transactional per-session head; object storage alone is not a compare-and-swap database. Implementation must select a durable transactional index for hosted heads before enabling concurrent uploads. Persist a local outbox and retry the identical objects after failure. Concurrent heads are reported as conflicts, not overwritten.

The public API serves sanitized published records only. Local endpoints, keys, credentials and private prompts are never uploaded by default. Published signatures authenticate assertions; they do not make operator-provided marks or timestamps independently verified. Public UI states publication and observation freshness and says runtime unobservable when appropriate.

## 9. Changes to the main Pump interface

| Surface | Core behavior after integration |
| --- | --- |
| Registration | Identity/model -> research strategy/sources/risk -> sign -> start practice; existing vault setup remains available for funded use |
| Agent directory | Same cards and agent IDs; show practice status, last decision, coverage and eligible practice metrics, with optional funded-vault status |
| Agent overview | Strategy selection and comparison, latest evidence-driven action, what changed, current strategy's practice portfolio, key risk checks and source freshness |
| Trading history | Practice decisions and fills under an explicit mode selector; existing actual vault receipts remain separately labelled |
| Identity & evidence | Existing signatures/model evidence plus signed research policy, cited snapshots, decision receipts, checkpoints and replay/export |
| Operator setup | Sources, KOL selection if enabled, virtual capital/risk policy, worker controls, budgets, policy versions and publication status |
| Investment panel | Practice mode shows virtual portfolio and explains no Pump shares are minted; funded mode retains actual MON/Pump controls and chain readiness |

Keep existing `/agents` and `/agents/:agentId` routes. A nested decision detail link is appropriate, but no separate RYO application/navigation silo. Existing agents with no research policy show a precise setup state; never substitute a demonstration agent or synthetic statistics.

Display identity validity, evidence coverage, practice performance and funded-vault performance as distinct concepts. A losing practice record does not invalidate a correct identity. Do not introduce an unexplained composite trust score.

## 10. Metrics and state management

Practice metrics come only from the authoritative practice ledger: initial virtual capital, cash, open exposure, realized P&L, unrealized P&L, fees, equity, return and drawdown. Derive returns/drawdown from a time-ordered equity series under the versioned mark policy. Win rate uses closed positions, sample count and stated break-even handling. No metric is shown as zero merely because data is missing.

Show valuation time, history coverage, rejected/HOLD counts, sessions/resets and policy revision alongside metrics. Aggregate only compatible sessions/periods; no ranking of unlike starting capital/currencies/strategies as if directly comparable. Research failure rates and stale marks are evidence-quality facts, not profit figures. No claims of statistically established skill from a short demo.

Extend the existing shared TanStack Query client. Keys include agent, registration, strategy kind, research-policy revision, session, execution mode and checkpoint head. Immutable evidence/decisions cache by content hash; mutable summaries refresh independently. Keep last valid data visible with its original timestamp while revalidating. Invalidate affected session queries on a confirmed new checkpoint. Deduplicate common market fetches across both strategies and bound polling; do not refetch unchanged model artifacts per component mount. Switching strategies cannot show the other strategy's positions or metrics under the new label.

Practice profile rendering must not await Monad RPC, vault NAV, an unrelated worker or every provider. Per-source loading/error states and independent queries replace a global checking-chain-state gate. Only cache public/sanitized responses; never cache signed action challenges, keys or credentials.

## 11. Proposed module layout

```text
market-data/ryo.ts                 documented RYO transport adapter
market-data/evidence.ts            typed snapshots, validation and references
market-data/social/                authorized KOL adapters and cursors
research/policy.ts                 signed agent research configuration
research/signals.ts                deterministic strategy/convergence rules
research/strategies/market-news.ts market/news interpretation and signal policy
research/strategies/multi-kol.ts   selected-voice convergence policy
research/evaluation.ts            frozen-config two-strategy comparison
research/inference.ts              bounded local-model interpretation
research/decision.ts               practice receipt types and verification
research/store.ts                  SQLite records, locks and transactional commit
research/runtime.ts                shared agent practice lifecycle
research/run.ts                    supervised CLI entry point
research/publication.ts            immutable checkpoints and durable outbox
practice/ledger.ts                 deterministic portfolio/event replay
practice/execution.ts              observed-price fill and exit model
practice/metrics.ts                coverage-aware practice metrics
hosting/research-api.ts            signed publication and public reads
app/src/lib/research-query.ts      shared practice queries
app/src/components/AgentResearch*  components embedded in existing profiles
tests/research-*.test.ts           provenance, policy, runtime and API regressions
tests/practice-*.test.ts           accounting, execution and replay regressions
```

Share model transport, canonical encoding, signer plumbing and query infrastructure where their contracts fit. Do not change the four-file signed funded-strategy implementation casually: modifying its digest is a new signed configuration and can conflict with existing immutable vault commitments. Extract compatible shared utilities or introduce versioned practice modules while retaining verification for historical code/receipts.

## 12. Delivery milestones and acceptance gates

| Milestone | Deliverables | Complete when |
| --- | --- | --- |
| 0. Capability and scope check | Confirm RYO tool docs/access, actual schemas, allowed assets, news and social access; record authentic sample responses and freeze comparison plan | Authentic RYO data and usable news/social access are demonstrated, unavailable fields are understood, and no API endpoint is guessed |
| 1. Agent policy and durable records | Signed research-policy binding, schemas, SQLite store, practice session, public/private evidence boundary | Existing agent adds a signed policy; reload/restart retains it; legacy registration signatures still verify |
| 2A. Market/news strategy | RYO adapter, immutable market/news snapshots, freshness/safety validation, catalyst and market rules | A real candidate is evaluated with cited catalyst, market context and counter-evidence; missing/ambiguous evidence blocks entries |
| 2B. Multi-KOL strategy | Authorized social source, selected accounts, attribution/deduplication, interpretation and convergence rules integrated with the same RYO adapter | Genuine selected-source observations produce an inspectable convergence result and contradictory evidence; unavailable social coverage is explicit |
| 3. Research runtime and practice ledger | Local inference, risk checks, autonomous loop, observed-price entry/exit, signed decisions, restart recovery | A real local-model cycle produces a linked decision; practice events replay exactly; retry/restart cannot duplicate a fill |
| 4. Core UI integration | Registration, directory, profile, history, evidence and controls; shared caching and mode semantics | The complete flow works inside existing Pump routes without opening a separate product or waiting on chain state |
| 5. Hosted continuity | Verified publication/read endpoints, persistent checkpoint index, outbox and public queries | A local checkpoint appears on hosted Pump and survives reload/cold start; tampered/out-of-order publications fail |
| 6. Comparative evaluation | Frozen paired evaluation, per-strategy metrics and human originality review, integrated comparison view | Both lanes are evaluated honestly; reliability, coverage, costs and causal behavior are inspectable; a leading strategy is selected with stated reasons or result remains inconclusive |
| 7. Recording and submission | Working-agent walkthrough, comparison, saved evidence, replay command, precise README and demo script | Evidence -> decision -> practice entry -> later exit/outcome -> replay is inspectable, with failures and execution mode labelled |

Build one vertical slice early with the market/news lane: authentic RYO response -> stored evidence -> registered local model -> validated decision -> same agent profile. Then implement the Multi-KOL lane against those same contracts, rather than building a second runtime/UI. Prepare social access in milestone 0 so this order does not hide an unresolved dependency. Complete both lanes before adding optional platforms, additional RYO tools or New Skills packaging.

No promises of a profitable trade or an entry during a live recording. HOLD is a valid live outcome. Prepare a separately labelled historical replay with captured evidence showing entry, rejection and exit under the unchanged policy; never adjust rules retrospectively merely to manufacture those scenes.

## 13. Required verification

- Provider contract tests against captured authentic response shapes, plus explicit unavailable/rate-limit/timeout/schema-drift cases. Synthetic test fixtures remain test-labelled.
- Both strategy lanes under the same agent: distinct policy signatures, decision sequences and portfolios; shared snapshots where appropriate; inference queue fairness; no cache/metric/session bleed; comparison cannot omit failures or select only winning sessions.
- Ambiguous ticker, wrong chain/address, copied KOL messages, conflicting voices, edited/late posts and source-text prompt injection.
- Invalid signatures, mismatched agent/model/policy, altered evidence or decision hashes, missing citations, reordered/gapped receipt chains and conflicting published heads.
- Exact deterministic replay of stored signals, guards, fills, ledger and metrics. A rerun of the LLM is a separate optional experiment, not the replay pass condition.
- Accounting invariants: conserved virtual capital apart from P&L/fees, no overspending, no double fills, correct realized/unrealized P&L, valid fee/slippage units and no paper event in funded accounting.
- Execution cases: stale/missing quote, stop gaps, ambiguous candles, next-observable fill time, repeated decision, restart during commit/publication and loss-limit enforcement.
- Negative financial boundary: practice runtime never imports transaction send/approval/funding services or obtains an account with transaction-signing capability. Receipt signing is a narrow operation; assert zero blockchain mutations in integration tests.
- Browser acceptance in external Chrome: actual local-model registration/policy signing, operator run/start/stop, sourced decision inspection, position lifecycle, evidence export/replay, navigation/reload cache behavior and explicit mode changes.
- Hosted acceptance: public records available after cold start; correct agent isolation, upload limits, signature/replay checks, publication conflicts and no private runtime/config leakage.
- Existing typecheck, relevant regression tests, frontend build and required lint checks pass. Run contract regressions only if contract/binding behavior is touched; this plan requires no new Solidity contract.

## 14. Demo and release definition

Suggested recording order:

1. Register a different installed local model or open its actual signed identity; create and sign its research policy on camera.
2. Enable both strategies under the same agent, select markets/news sources and KOL accounts, and display their signed policies and comparable risk limits.
3. Run/start the same agent and show authentic RYO market evidence with original observation times.
4. Open a decision: evidence references -> interpretation -> signal/risk checks -> accepted or rejected practice order.
5. Show the practice portfolio and subsequent position review/exit. Use a labelled captured historical session if elapsed live data does not produce a complete position lifecycle during recording.
6. Change the evidence or risk condition in a separately labelled replay scenario and show its causal effect; do not mutate a completed real receipt.
7. Switch strategies on that profile and inspect the comparison: the evidence each used, different actions, source coverage, reliability, costs and separately labelled practice outcomes.
8. Export and replay each decision/session and demonstrate that an altered receipt fails verification.
9. Reload and open the public agent profile to show persistent history, fresh/stale status and the distinction from any actual Monad vault.

Release requires both strategies integrated into the same practice-agent journey with authentic provider data and real local inference, a repeatable deterministic audit path, persistent records, honest unavailable states, a recorded position lifecycle and a defensible comparison. Registration-only screens, provider response widgets, canned model answers, disconnected notebooks or a read-only narrative feed do not satisfy this plan.

Open inputs to resolve before implementation: RYO official API/MCP access and licensing; live X access if Multi-KOL leads; approved provider/API budgets; public evidence visibility preferences; hosted transactional checkpoint storage. These are explicit implementation gates. The plan authorizes no purchase, new public deployment or financial transaction by itself.
