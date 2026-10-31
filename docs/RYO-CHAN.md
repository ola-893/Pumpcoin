# Pump research and practice trading

Pump's registered agents can carry a signed market/news research policy using free public RSS feeds and a local model. X/Multi-KOL collection was removed at the operator's request on 2026-10-23; no X API purchase is required. The existing agent directory, overview, trading history, identity/evidence and operator setup expose those records. Research has a virtual portfolio tied to its policy and agent identity. Historical signed Multi-KOL records remain unchanged and readable.

This implementation does not use CRE or FlowPay. No practice action sends chain transactions, approves assets or creates Pump shares. Funded execution now targets Ethereum Sepolia (WETH/test-USDC, Uniswap v4). Historical Monad records keep their original chain and signatures. Research prices and practice fills do not establish a testnet swap quote. See [Sepolia execution](SEPOLIA-EXECUTION.md).

## Current acceptance boundary

Implemented: policy authorization, source interfaces, market/news strategy plus historical Multi-KOL replay, local-model research transport, practice order/position accounting, signed receipts, SQLite persistence, replay/export, historical paired evaluation, local operator routes, supervised CLI, and hosted immutable-checkpoint publication/read routes.

**2026-10-21 update:** RYO MCP authentication, initialization and tool discovery are now verified against `https://app-ryochan.com/api/mcp`, using the operator's server-only credential. The actual server negotiates `2024-11-05` and advertises six tools: `market_overview`, `scan_market`, `analyze_token`, `deep_analysis`, `compare_tokens` and `monitor_market_sentiment_shift`. `check_safety` and `supported_tokens` were not advertised by this account/server. Pump validates discovered schemas and refuses unadvertised tools.

Actual ETH and BTC token-analysis responses reported errors/unavailable USD market data; the market scan returned zero candidates with `data_mode: unknown`, and overview fields were partial/null. These are retained provider failures, not invented observations. There is still no reviewed mapping from a successful priced token response to instrument identity, price, liquidity and their observation times. The local source preflight now preserves an unmapped/error response as raw evidence while leaving RYO-mapped markets empty; RYO-only policies remain blocked.

The canonical CoinDesk RSS URL is configured locally and returns 25 normalized news items through Pump. That historical check preceded the removal of X/Multi-KOL collection; X is no longer a live dependency. No genuine local-model practice trade or strategy comparison is claimed. See [live MCP verification and remaining blockers](testing/ryo-mcp-20261021/README.md).

**2026-10-23 zero-budget scope:** new setup creates one market/news policy with `voices: []`. The live X adapter, credential loading, handle-lookup route and CLI probe have been removed. Even retained X selections cause no X network requests. Proposed RSS URLs come from operator configuration, are editable and require policy signatures. Muse Sepolia local enrollment remains valid; its historical manifest references the earlier strategy scope and has not been edited. A new policy pins the current research engine. RYO price/liquidity mapping remains blocked by authentic upstream failures; the explicit Coinbase price-source repair below removes that dependency for new Coinbase-authorized policies; free headlines can support a cited HOLD, but cannot substitute for prices or create invented fills. Prior probes are in the [historical evidence report](testing/ryo-coverage-20261023/REPORT.md).

## Configure the operator

Use Node 22.13+ with `node:sqlite` available (verified locally on Node 22.23.2; Node currently prints its experimental SQLite warning). Install dependencies, then configure the server-only root `.env` using `.env.example`.

- `PUMPCOIN_RYO_MCP_URL` and `PUMPCOIN_RYO_API_KEY`: official builder MCP endpoint/access.
- `PUMPCOIN_RYO_AUTH_HEADER` / `PUMPCOIN_RYO_AUTH_PREFIX`: match the official authentication contract. The verified MCP endpoint uses a Bearer credential.
- `PUMPCOIN_RYO_PROFILE`: path to reviewed JSON mapping tool arguments and response fields from authentic data.
- `PUMPCOIN_NEWS_FEEDS`: exact allowlisted HTTPS feed URLs; policy-selected feeds must match this list.
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

The MCP adapter accepts the actually negotiated 2024-11-05 version as well as 2025-06-18 and 2025-03-26, sends the negotiated protocol header, initializes a session, and checks the actual tool catalog. Tool arguments are checked against the advertised type, required fields, object/array constraints, enums and bounds; unsupported schema constraints require review. Read-only names still require advertisement before use. Complex/provider-specific semantics still need authentic contract acceptance. RPC requests default to a conservative 6 per wall-clock minute per adapter instance (including discovery), with a hard maximum of 30 and an operator-configurable `PUMPCOIN_RYO_RATE_PER_MINUTE` setting (`Rate_Per_Minute` is also accepted by the CLI). This local budget is not an account-wide quota guarantee; parallel processes share the provider quota. Source responses are bounded, redirects refused, and combined snapshots capped at 2 MB. Common policy snapshots coalesce and cache for up to 30 seconds, preserving original timestamps.

### Free news sources; no X dependency

Set `PUMPCOIN_NEWS_FEEDS` to exact operator-allowlisted public HTTPS RSS, Atom or JSON feed URLs. Current local configuration uses the canonical CoinDesk RSS feed; source preflight has observed 25 items. The operator setup form reads these configured URLs as editable proposals, rather than hardcoding agent source state. Review and sign the policy before collection becomes an agent decision.

The old X token can remain unused in the local `.env` or be removed by the operator. Pump no longer reads it, loads it into the helper, resolves creators or requests timelines. Historical X normalizers/strategy replay remain solely for inspecting existing evidence; they do not enable live collection. This does not delete or silently re-sign historical agent records.

No paid fallback was added. RYO uses the already-configured builder credential. Missing data from the signed pricing source still blocks entries. The existing local model interprets news and must HOLD without usable market evidence. One free source's successful response does not prove its stories true, independent or complete. Inspect original URLs, source timestamps, raw responses and model judgments separately.

### Free practice prices independent of RYO availability

In Operator setup, select **Coinbase public USD spot book** in both the source check and proposed policy. Check the desired symbol first. No Coinbase key or purchase is required. The new signed `marketRules.source: coinbase-exchange` explicitly authorizes this source; an omitted source retains RYO semantics. An ETH policy must authorize `coinbase:ETH-USD | ETH | coinbase-exchange`, never a Sepolia token address. The venue identifier is not a blockchain claim.

Pump captures the exact public `GET https://api.exchange.coinbase.com/products/ETH-USD/book?level=2` response, request URL, HTTP status, request/receipt times and provider book time. It rejects auctions, crossed/locked/empty/unordered books, malformed decimals and missing/future provider times. HTTP failures and invalid bodies are retained without market-coverage claims. Reads coalesce/cache without changing timestamps. The raw-to-normalized transform is recomputed during checkpoint verification.

The reference price is the best bid/ask midpoint rounded down to USD micro-units. Measured depth is the **smaller** total bid/ask USD notional within 10 bps of that midpoint, rounded down. Aggregated size is never multiplied by order count. This is displayed exchange depth, not total token liquidity or DEX reserves. The signed minimum and at-most-1% participation cap still apply at proposal/fill. Signed adverse slippage must be at least 10 bps and cover the observed spread. Orders still need a later provider observation, news support, local-model interpretation and the existing loss/exposure/fee checks. Virtual fills use declared adverse slippage and fee assumptions; they are not actual exchange executions or executable Sepolia quotes. Depth is a point snapshot and may change.

RYO `analyze_token` observations are retained separately. An unavailable/unmapped RYO response cannot claim price coverage, but does not veto a Coinbase-authorized practice entry. RYO-only policies still require their reviewed mapping. No existing policy, registration or history is rewritten. Sign a new policy for the current engine. See the [live capture, independent arithmetic and reproduction steps](testing/market-prices-20261023/REPORT.md).

```sh
npm run agent:research -- sources --check-symbol ETH --market-source coinbase-exchange --output <new-price-preflight.json>
```

### Response mapping format

The profile has this shape; this is a schema example, not a working RYO mapping:

```json
{
  "version": 2,
  "tools": {
    "analyze_token": { "arguments": { "symbol": "{{symbol}}" } }
  },
  "fields": {
    "id": { "tool": "analyze_token", "pointer": "/REVIEWED_INSTRUMENT_ID_PATH" },
    "symbol": { "tool": "analyze_token", "pointer": "/REVIEWED_SYMBOL_PATH" },
    "network": { "tool": "analyze_token", "pointer": "/REVIEWED_NETWORK_PATH" },
    "price": { "tool": "analyze_token", "pointer": "/REVIEWED_USD_PRICE_PATH" },
    "liquidity": { "tool": "analyze_token", "pointer": "/REVIEWED_USD_LIQUIDITY_PATH" },
    "observedAt": { "tool": "analyze_token", "pointer": "/REVIEWED_PRICE_TIMESTAMP_PATH" },
    "liquidityObservedAt": { "tool": "analyze_token", "pointer": "/REVIEWED_LIQUIDITY_TIMESTAMP_PATH" },
    "mode": { "tool": "analyze_token", "pointer": "/REVIEWED_LIVE_MODE_PATH" }
  }
}
```

Use `{{symbol}}` inside reviewed argument values for watchlist substitution. Pointers are JSON Pointers into decoded tool results. The mapped mode must be exactly `live`; price and liquidity must be positive USD decimal values with at most six decimal places. Price and liquidity times need explicit timezones, and their oldest timestamp governs freshness. This example contains placeholders and cannot serve as a live mapping.

Version 2 removes the unsupported boolean safety requirement. A newly signed policy commits to exact instrument IDs, symbols and networks, a minimum observed liquidity, and maximum liquidity participation (at most 1%). `riskEvidence: record-unavailable-block-reported` explicitly permits **unknown risk coverage**; it is an operator authorization, never a provider safety certificate. If a reviewed mapping includes `riskFields: {flags: {tool, pointer}, observedAt: {tool, pointer}}`, every reported flag blocks new entries and its timestamp must be fresh. An empty flags array records only that the mapped response reported no flags. Without that mapping the stored risk status is `unavailable`.

Existing v1 authorizations cannot acquire these rules automatically. Sign a new v2 policy against the current engine. A successful priced RYO response remains a live dependency for RYO-only policies; removing the impossible safety boolean does not fabricate price or liquidity.

## Operator flow

1. Register a genuinely running local model or select its existing signed registration. A vault is not required for practice.
2. Open **Operator setup** in research/practice mode. Select the pricing provider, enter exact observed instrument identities and symbols, and select operator-allowlisted news feeds. X accounts are not used.
3. Review virtual capital and every risk/execution limit. Proposed form defaults are editable policy inputs, never observed agent data.
4. Review the exact policy and approve the controller signature. The configured execution key countersigns; the service verifies both. The policy commits to the registered manifest and actual research-engine source digests.
5. Select the market/news session and run an observation or start the practice worker. Changes create new policy revisions; existing positions/orders must finish before a new policy is activated.
6. Inspect sourced decisions, guard results, delayed orders, position exits, virtual metrics and coverage on the same profile.
7. Verify replay and export the signed checkpoint. Reloads read SQLite, not browser-invented balances.

Missing or stale selected-source publications produce a signed blocked record without requesting model inference. Fresh selected-source publications may still reach the registered local model when RYO market inputs are unavailable, allowing an evidence-linked HOLD. Post classification uses the signed watchlist; it does not establish a tradable instrument, quote or safety verdict. Orders retain the existing market and risk requirements. Missing marks leave open positions unpriced. The registered model's actual loaded artifacts are checked around inference. An endpoint now running another model fails the check rather than silently substituting that model.

The bounded model prompt first removes stale/future publications, then uses ten latest news posts (historical Multi-KOL replay retains its prior selection rules), with 500-character previews and up to 2,048 completion tokens. Configure the registered local server with sufficient context for the selected watchlist and publications; an exceeded context or truncated response fails the cycle. The exact selection and counts are recorded in the inference request. Full captured observations and decoded raw response bodies remain in the evidence bundle. Exact MCP response IDs, tool arguments, reviewed mapping, tool catalog and receipt times are retained; normalization is recomputed on export/publication verification. Exact successful model response envelopes are also retained. No authorization headers or keys are captured by this transport. Convergence describes the selected observations; it is not a claim of complete social-market coverage. Post text is untrusted input; the model has no source-fetching or financial tools.

## Practice rules and accounting

- Spot BUY/SELL/HOLD only, using virtual USD and quantity base units; no leverage or short positions.
- Model output is strict structured interpretation with existing evidence references. Unsupported citations, unexpected fields and malformed responses fail. A BUY must classify every selected post for its proposed symbol so an omitted opposing observation is not silently excluded by the parser. This does not independently establish correct sentiment.
- Market/news entry needs a cited fresh supporting catalyst; contradictory classified news blocks it. This is source-attributed interpretation, not independent verification that a story is true.
- Historical Multi-KOL replay only (not live collection): entry needs the signed count of distinct selected voices, non-low conviction and no opposing selected voice. Reposts/quoted origins and normalized copied text are transitively grouped. A maximum matching counts at most one selected account per evidence group and one group per account, independently of input order. Distinct accounts/text do not prove independent control or independent research. Account weights/reputation scoring are not implemented; selected voices currently have equal weight.
- Both need the exact signed instrument identity/network, fresh positive price/liquidity, the signed liquidity floor/participation limit and complete watchlist coverage from the signed market source (`ryo` when omitted in an older policy). Risk coverage is explicit; reported flags block entries. Unknown coverage is accepted only through the signed v2 policy described above.
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

1. RYO builder access is verified. Obtain a successful token response and confirm current price/liquidity/identity/timestamp semantics; the current errors cannot establish those mappings. Authenticated discovery and unavailable-response contract tests are included.
2. Free news ingestion is configured and verified locally. X/Multi-KOL monitoring is removed. Review feed licensing before publishing captured text.
3. Run the actually registered local model against real evidence for each strategy and capture the resulting sessions. HOLD/losses are valid results.
4. Verify the news-based practice position lifecycle once authentic priced evidence is available; no two-lane comparison is required. Synthetic tests are not counted as successful live cycles.
5. Verify public checkpoint upload/read against the configured hosted store and record the final UI walkthrough.

Live access and raw research probes are verified; downstream price/liquidity mapping, signed agent cycles, genuine practice trades, strategy comparison and the completed bounty demonstration remain open.

## Provenance audit

See the [2026-10-17 audit and reproducible evidence package](testing/ryo-audit-20261017/README.md) for independent Python accounting references, controlled failures, transformation boundaries, browser/API/database agreement and unresolved authenticity gates. The stricter engine has a new source digest. Existing signed policies are never silently rewritten or migrated; historical checkpoints require their matching engine. At audit time the real local research database contained no policies or sessions.

The [October 21 re-probe](testing/ryo-reprobe-20261021/README.md) confirms SOL tool failure, unavailable chain-filtered scanning, and valid read-only credentials with remaining quota. That dated probe predates the v2 eligibility repair: risk flags remain observations, while the operator now signs explicit asset/liquidity rules with unknown risk coverage disclosed. Missing authentic priced mappings still block entries. A genuine live HOLD still requires the registered model to be running and a reviewed controller-signed research policy. The HOLD-path regression uses explicitly controlled test data, not live evidence.
