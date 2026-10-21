# Pump research and practice trading

Pump's registered agents can carry a signed research policy enabling both market/news and Multi-KOL narrative strategies. The existing agent directory, overview, trading history, identity/evidence and operator setup expose those records. Each strategy has a separate virtual portfolio under the same policy and agent identity.

This implementation does not use CRE or FlowPay. No practice action sends chain transactions, approves assets or creates Pump shares. Existing MON vaults and receipts remain available under **Funded Monad vault**.

## Current acceptance boundary

Implemented: policy authorization, source interfaces, both deterministic strategies, local-model research transport, practice order/position accounting, signed receipts, SQLite persistence, replay/export, paired evaluation, local operator routes, supervised CLI, and hosted immutable-checkpoint publication/read routes.

**2026-10-21 update:** RYO MCP authentication, initialization and tool discovery are now verified against `https://app-ryochan.com/api/mcp`, using the operator's server-only credential. The actual server negotiates `2024-11-05` and advertises six tools: `market_overview`, `scan_market`, `analyze_token`, `deep_analysis`, `compare_tokens` and `monitor_market_sentiment_shift`. `check_safety` and `supported_tokens` were not advertised by this account/server. Pump validates discovered schemas and refuses unadvertised tools.

Actual ETH and BTC token-analysis responses reported errors/unavailable USD market data; the market scan returned zero candidates with `data_mode: unknown`, and overview fields were partial/null. These are retained provider failures, not invented observations. There is still no reviewed mapping from a successful priced token response to instrument identity, price, liquidity and safety. The local source preflight now preserves an unmapped/error response as raw evidence while leaving mapped markets empty and entry eligibility blocked.

The canonical CoinDesk RSS URL is configured locally and returns 25 normalized news items through Pump. Direct X access is still unconfigured; the market-wide sentiment tool is not a source of user-selected creators' posts. No genuine local-model practice trade or strategy comparison is claimed. See [live MCP verification and remaining blockers](testing/ryo-mcp-20261021/README.md).

## Configure the operator

Use Node 22.13+ with `node:sqlite` available (verified locally on Node 22.23.2; Node currently prints its experimental SQLite warning). Install dependencies, then configure the server-only root `.env` using `.env.example`.

- `PUMPCOIN_RYO_MCP_URL` and `PUMPCOIN_RYO_API_KEY`: official builder MCP endpoint/access.
- `PUMPCOIN_RYO_AUTH_HEADER` / `PUMPCOIN_RYO_AUTH_PREFIX`: match the official authentication contract. The template defaults are MCP conventions, not a verified RYO-specific claim.
- `PUMPCOIN_RYO_PROFILE`: path to reviewed JSON mapping tool arguments and response fields from authentic data.
- `PUMPCOIN_NEWS_FEEDS`: exact allowlisted HTTPS feed URLs; policy-selected feeds must match this list.
- `PUMPCOIN_X_BEARER_TOKEN`: authorized X API v2 read token, subject to the account's access and quotas.
- Existing encrypted execution signer settings: used through a narrow receipt-signing callback. No model gets access to an account or secret.

Never use `VITE_` variables for these settings. Never paste keys into the profile. The research CLI loads the root `.env`; already exported environment variables take precedence. No provider subscription is purchased by the implementation.

```sh
npm run agent:research -- sources
# After configuring official RYO access, inspect its real MCP tool catalog:
npm run agent:research -- sources --discover
# Unsigned preflight only: inspect access and missing data before signing policy.
npm run agent:research -- sources --check-symbol ETH --output <new-source-probe.json>
npm run dev
```

The MCP adapter accepts the actually negotiated 2024-11-05 version as well as 2025-06-18 and 2025-03-26, sends the negotiated protocol header, initializes a session, and checks the actual tool catalog. Tool arguments are checked against the advertised type, required fields, object/array constraints, enums and bounds; unsupported schema constraints require review. Read-only names still require advertisement before use. Complex/provider-specific semantics still need authentic contract acceptance. RPC requests are capped at 30 per minute per adapter instance, or a lower `PUMPCOIN_RYO_RATE_PER_MINUTE` setting (`Rate_Per_Minute` is also accepted by the CLI). Source responses are bounded, redirects refused, and combined snapshots capped at 2 MB. Common policy snapshots coalesce and cache for up to 30 seconds, preserving original timestamps.

### Response mapping format

The profile has this shape; this is a schema example, not a working RYO mapping:

```json
{
  "version": 1,
  "tools": {
    "analyze_token": { "arguments": {} },
    "check_safety": { "arguments": {} }
  },
  "fields": {
    "id": { "tool": "analyze_token", "pointer": "/REVIEWED_INSTRUMENT_ID_PATH" },
    "symbol": { "tool": "analyze_token", "pointer": "/REVIEWED_SYMBOL_PATH" },
    "network": { "tool": "analyze_token", "pointer": "/REVIEWED_NETWORK_PATH" },
    "price": { "tool": "analyze_token", "pointer": "/REVIEWED_USD_PRICE_PATH" },
    "liquidity": { "tool": "analyze_token", "pointer": "/REVIEWED_USD_LIQUIDITY_PATH" },
    "safe": { "tool": "check_safety", "pointer": "/REVIEWED_BOOLEAN_SAFETY_PATH" },
    "observedAt": { "tool": "analyze_token", "pointer": "/REVIEWED_PRICE_TIMESTAMP_PATH" },
    "liquidityObservedAt": { "tool": "analyze_token", "pointer": "/REVIEWED_LIQUIDITY_TIMESTAMP_PATH" },
    "safetyObservedAt": { "tool": "check_safety", "pointer": "/REVIEWED_SAFETY_TIMESTAMP_PATH" },
    "mode": { "tool": "analyze_token", "pointer": "/REVIEWED_LIVE_MODE_PATH" }
  }
}
```

Use `{{symbol}}` inside reviewed argument values for watchlist substitution. Pointers are JSON Pointers into each decoded tool result. The mapped mode must be exactly `live`, safety a boolean, price/liquidity positive USD decimal values with at most six decimal places, and each price/liquidity/safety observation time must have an explicit timezone. The oldest of those timestamps governs freshness and order eligibility. A fresh price must not make an old safety result appear fresh. Different real schemas require a reviewed adapter update and new engine commitment, never silent coercion of simulated/unknown data into live data. This strict mapping is an explicit outstanding compatibility gate.

## Operator flow

1. Register a genuinely running local model or select its existing signed registration. A vault is not required for practice.
2. Open **Operator setup** in research/practice mode. Enter provider-supported symbols, selected X numeric IDs and operator-allowlisted news feeds.
3. Review virtual capital and every risk/execution limit. Proposed form defaults are editable policy inputs, never observed agent data.
4. Review the exact policy and approve the controller signature. The configured execution key countersigns; the service verifies both. The policy commits to the registered manifest and actual research-engine source digests.
5. Select a strategy/session and run an observation or start the practice worker. Repeat for the other strategy. Changes create new policy revisions; existing positions/orders must finish before a new policy is activated.
6. Inspect sourced decisions, guard results, delayed orders, position exits, virtual metrics and comparison coverage on the same profile.
7. Verify replay and export the signed checkpoint. Reloads read SQLite, not browser-invented balances.

Missing required sources produce a signed blocked record without requesting model inference. Missing marks leave open positions unpriced. The registered model's actual loaded artifacts are checked around inference. An endpoint now running another model fails the check rather than silently substituting that model.

The bounded model prompt first removes stale/future publications, then uses ten latest news posts or the latest post per selected X account, with 500-character previews and up to 2,048 completion tokens. Configure the registered local server with sufficient context for the selected watchlist and voices; an exceeded context or truncated response fails the cycle. The exact selection and counts are recorded in the inference request. Full captured observations and decoded raw response bodies remain in the evidence bundle. Exact MCP response IDs, tool arguments, reviewed mapping, tool catalog and receipt times are retained; normalization is recomputed on export/publication verification. Exact successful model response envelopes are also retained. No authorization headers or keys are captured by this transport. Convergence describes the selected observations; it is not a claim of complete social-market coverage. Post text is untrusted input; the model has no source-fetching or financial tools.

## Practice rules and accounting

- Spot BUY/SELL/HOLD only, using virtual USD and quantity base units; no leverage or short positions.
- Model output is strict structured interpretation with existing evidence references. Unsupported citations, unexpected fields and malformed responses fail. A BUY must classify every selected post for its proposed symbol so an omitted opposing observation is not silently excluded by the parser. This does not independently establish correct sentiment.
- Market/news entry needs a cited fresh supporting catalyst; contradictory classified news blocks it. This is source-attributed interpretation, not independent verification that a story is true.
- Multi-KOL entry needs the signed count of distinct selected voices, non-low conviction and no opposing selected voice. Reposts/quoted origins and normalized copied text are transitively grouped. A maximum matching counts at most one selected account per evidence group and one group per account, independently of input order. Distinct accounts/text do not prove independent control or independent research. Account weights/reputation scoring are not implemented; selected voices currently have equal weight.
- Both need uniquely resolved market identity, positive available price/liquidity, boolean passing safety and complete RYO watchlist coverage.
- Sizing respects cash, signed position/exposure limits, stop-distance risk including declared fee/slippage allowance, cooldown, concurrent positions and the UTC daily loss limit. Risk budget and cooldown are rechecked when an order fills. The daily reference is the first available observation of that UTC day, not a reconstructed midnight price; missing day-opening marks block entries until a priced reference is available on a later day.
- Orders fill only on a subsequent eligible observed quote, with declared adverse slippage/fees. Old cached quotes cannot fill newly created orders.
- Stops/targets/time exits use observed point prices. There are no invented intraperiod highs/lows or guaranteed stop prices. Price gaps execute at the observed adverse price. Missing or regressing price observations do not fabricate a fill. Positions retain their latest observation timestamp; older prices leave the current mark unavailable.
- Equity, realized/unrealized P&L, simulated fees and current/max observed drawdown derive from the ledger. Win rate is unavailable without closed positions. Virtual capital is not trading profit.

Position P&L is constrained by virtual portfolio rules, not guaranteed risk: gaps and missing quotes can exceed a planned stop loss. This is a practice execution model, not a claim of executable exchange quotes or live fill quality.

Evidence-sensitivity inspection removes one cited news item or selected creator from the deterministic signal check and reports the counterfactual result. It does not rewrite the original decision, re-query the model or establish causal truth about market price movement.

## Durable worker and replay

```sh
npm run agent:research -- status <registration-id>
npm run agent:research -- once <registration-id> <session-id>
npm run agent:research -- watch <registration-id> <session-id>
npm run agent:research -- export <registration-id> <session-id> <new-checkpoint.json>
npm run agent:research -- verify <checkpoint.json>
```

SQLite state lives in ignored `.local/research/pump.sqlite`. Decisions, evidence, resulting events and portfolio updates commit atomically under a per-session writer lease. The CLI is the supervised long-lived runtime; Vite controls are useful locally but a dev-server restart stops that local in-process loop. Restart does not reset the stored portfolio or duplicate a fill. Replay checks protect reads and exports against changed balances, missing events and history gaps. A stale running label without an active local lease is reported as an error, not an active agent.

Replay verifies authorizations, chained signatures, evidence hashes, exact research request/raw response, deterministic signals, guards, orders, events and portfolio. It does not rerun the LLM or attest its execution. Historical engines need their matching implementation; the current verifier rejects an unknown engine digest. Practice receipts can be withheld before publication; signatures alone cannot establish complete history or trustworthy host clocks.

Both strategies use the same signed comparison policy but separate sessions/capital. The evaluation reports their observation windows, common-window cycle counts, availability, accepted/HOLD/blocked/error counts and mean recorded inference time. API monetary cost is unknown until actual provider billing data is available. Whole-session returns are explicitly labelled as covering potentially unequal periods. Overlapping-period equity changes and drawdown use observed boundaries, which are displayed separately for each lane; at least two priced observations are required. Qualified shared evidence captures and closed samples are counted, and insufficient evidence stays inconclusive. No automatic innovation score or best-strategy claim is assigned.

## Hosted publication

```sh
# Inspect the exported public checkpoint before deliberately publishing it:
npm run agent:research -- publish <checkpoint.json> <https://your-pump-origin/>
```

Hosted publication uses the existing private Blob store in a separate `research/` namespace. A checkpoint contains public practice evidence and the exact inference prompt/response, so review provider licensing and prompt visibility before publishing. It contains no provider credentials or signing key.

The hosted API verifies the published registration, policy/receipt/checkpoint signatures and deterministic replay before accepting immutable content-addressed objects. Identical retries are idempotent. Readers select a consistent prefix of decision history; conflicting forks fail visibly and do not become a canonical result. There is no mutable last-writer-wins head and no claim of global append consensus. The bounded reader rejects namespaces beyond 1,000 objects or checkpoints beyond 5 MB. This initial full-checkpoint transport needs chunked history/retention design for larger deployments.

Public reads survive cold starts through durable objects, with a bounded 30-second read cache. Hosted state is explicitly a published historical checkpoint; it cannot observe or start the operator's local model. Publication has not been performed or cloud-tested by this implementation task.

## Access gates still required for the bounty recording

1. RYO builder access is verified. Obtain a successful token response and confirm current price/liquidity/safety/identity semantics; the current errors cannot establish those mappings. Authenticated discovery and unavailable-response contract tests are included.
2. News ingestion is configured and verified locally. Configure authorized X reads before claiming live Multi-KOL monitoring. Review feed licensing before publishing captured text.
3. Run the actually registered local model against real evidence for each strategy and capture the resulting sessions. HOLD/losses are valid results.
4. Verify a practice position lifecycle and evaluate both lanes over a common window. Synthetic tests are not counted as successful live cycles.
5. Verify public checkpoint upload/read against the configured hosted store and record the final UI walkthrough.

Live access and raw research probes are verified; downstream price/safety mapping, signed agent cycles, genuine practice trades, strategy comparison and the completed bounty demonstration remain open.

## Provenance audit

See the [2026-10-17 audit and reproducible evidence package](testing/ryo-audit-20261017/README.md) for independent Python accounting references, controlled failures, transformation boundaries, browser/API/database agreement and unresolved authenticity gates. The stricter engine has a new source digest. Existing signed policies are never silently rewritten or migrated; historical checkpoints require their matching engine. At audit time the real local research database contained no policies or sessions.
