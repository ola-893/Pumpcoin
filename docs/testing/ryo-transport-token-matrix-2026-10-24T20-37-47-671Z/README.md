# RYO token × transport price check — October 24, 2026

Authentic read-only `analyze_token` calls for all eleven symbols discussed in this task, through both MCP and documented REST. This is not an exhaustive list of every token supported by RYO; its live catalog supplies no supported-token enumeration tool. No inference, policy changes, ledger events, swaps, deposits or funded transactions were performed.

| Token | MCP | REST |
|---|---|---|
| ETH | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| BTC | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| SOL | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| BNB | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| XRP | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| DOGE | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| ADA | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| AVAX | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| LINK | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| INJ | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |
| CAKE | HTTP 200; MCP tool error | HTTP 400; VALIDATION_FAILED |

**No prices were returned: 0/22 checks.** All 11 MCP calls returned HTTP 200 with result.isError:true; all 11 REST calls returned HTTP 400 with code VALIDATION_FAILED.

Token calls ran from 2026-10-24 20:37:50.016 to 20:45:08.786 UTC (**21:37:50–21:45:08 Lagos time, October 24**).

Completed 22/22 token/transport checks. The read-only credential/quota check returned HTTP 200 before the test. HTTP 429 responses: 0. Minimum remaining requests reported in token-response headers: 56. See summary.json for per-response headers, messages and trace IDs.

The two transports used the same bare symbol argument and the actual authenticated tool catalog. MCP used a negotiated 2024-11-05 session and retained initialize → initialized → tools/list → tools/call. REST used POST /api/mcp/tools/analyze_token/call with a bare {symbol} body. No response was replaced with a fixture.

Tool calls were at least 20 seconds apart. A separate rolling budget limited all HTTP calls, including MCP discovery and quota reads, to six in any 61-second period. Capacity for the full handshake was reserved before starting its per-request abort timers. Retry-After/reset backoff was available for explicit HTTP 429; no immediate retry or hidden duplicate tool call was made.

Timestamps in responses.json and summary.json are UTC. For Lagos add one hour. The observation window for each token/transport is explicit; the 22 probes were sequential rather than simultaneous. File hashes establish integrity relative to this manifest, not independent provider authenticity.

HTTP 200 with MCP isError:true is a tool failure, not a successful price. REST VALIDATION_FAILED is the provider’s error label; it does not itself establish which internal component failed. Unexhausted public credential quota cannot rule out rate limiting or other failures inside RYO’s own upstream dependencies. Successful structured responses, if any, require inspection of actual price/identity/timestamp semantics and are not automatically verified tradable markets.

The public package excludes credentials, session IDs, unrelated headers and whoami key identity fields. Only numeric quota fields and allowlisted rate headers are retained publicly. The exact raw whoami body is stored only in ignored local files with mode 0600. No support message was sent, and production application files were not changed by this diagnostic.
