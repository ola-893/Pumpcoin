# RYO additional-token price probes — 2026-10-23

Read-only provider diagnostics. No agent decisions, ledger changes, swaps or funded transactions. Credentials and response headers are excluded.

## Additional tokens

MCP discovery succeeded and the actual advertised argument schema was checked. Calls were paced at least 12 seconds apart, with a rolling six-request budget that includes discovery.

| Symbol | Request time UTC | HTTP | Tool result | Price |
|---|---|---|---|---|
| BNB | 2026-10-23T15:57:11.120Z | 200 | isError: true; couldn't analyze BNB right now | None |
| XRP | 2026-10-23T15:57:23.122Z | 200 | isError: true; couldn't analyze XRP right now | None |
| DOGE | 2026-10-23T15:57:35.123Z | 200 | isError: true; couldn't analyze DOGE right now | None |
| ADA | 2026-10-23T15:58:10.478Z | 200 | isError: true; couldn't analyze ADA right now | None |
| AVAX | 2026-10-23T15:58:22.480Z | 200 | isError: true; couldn't analyze AVAX right now | None |
| LINK | 2026-10-23T15:58:34.480Z | 200 | isError: true; couldn't analyze LINK right now | None |
| INJ | 2026-10-23T15:58:46.481Z | 200 | isError: true; couldn't analyze INJ right now | None |
| CAKE | 2026-10-23T15:58:58.482Z | 200 | isError: true; couldn't analyze CAKE right now | None |

**0/8** additional symbols returned a price. These are upstream error responses, not prices rejected only by Pump’s field mapper. This sample cannot establish that every possible RYO symbol fails. Prior ETH, SOL and BTC failures are retained in the preceding coverage reports.

## Cross-checks

- 2026-10-23T15:59:10.483Z: documented REST analyze_token with {"symbol":"INJ"} → HTTP 400, VALIDATION_FAILED, “couldn't analyze INJ right now” (trace 6f86605ac23b4c518b090ba2b67bc7ab).
- 2026-10-23T20:53:04.506Z: documented REST deep_analysis with {"symbol":"BNB","include_perp":false} → HTTP 400, VALIDATION_FAILED, “Current USD market data is unavailable for BNB.” (trace b5c5ae2d36504604bd95a84681349c6a).
- 2026-10-23T20:53:16.508Z: documented REST deep_analysis with {"symbol":"CAKE","include_perp":false} → HTTP 400, VALIDATION_FAILED, “Current USD market data is unavailable for CAKE.” (trace d4e46ee300944459af27f3e1b06fc85b).

The later deep-analysis checks occurred in a separate observation window (20:53 UTC); they must not be treated as simultaneous with the 15:57–15:59 UTC analysis batch. Both used include_perp: false. Their explicit “Current USD market data is unavailable” replies show that disabling derivatives did not produce prices for these two assets.

REST uses the official guide’s bare argument object, not a JSON-RPC envelope. HTTP 400 VALIDATION_FAILED is the server’s error label; it does not by itself prove bad symbol arguments. The published schema accepted these requests, and BNB/CAKE deep-analysis responses specifically identify unavailable current USD market data. The internal cause still requires RYO’s logs. No HTTP 401/403/429 was observed in these probes. No provider-wide availability claim or exact internal diagnosis is established.

`responses.json` retains discovery/catalog and all eight raw MCP replies plus the direct INJ REST reply. `deep-analysis-rest.json` retains the two later tool checks. `summary.json` provides their compact interpretation; raw files take precedence. SHA256SUMS detects file changes relative to this manifest, not independent provider authenticity. No message has been sent to RYO.
