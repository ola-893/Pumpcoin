# RYO fault isolation — October 24, 2026

**Finding:** RYO exposes an upstream **monthly credit exhaustion** error through its sentiment tool. It identifies code **1010**, says **“Monthly credit limit reached. Your credits are shared between REST API and MCP.”**, and supplies an upgrade URL on **coinmarketcap.com**. This is separate from the operator credential’s 60-per-minute RYO allowance. The response is RYO’s assertion about its research dependency; we did not access that upstream account independently.

## Verified boundary

Pump source check → authenticated RYO endpoint → published tool execution → research-data dependency → public response. Earlier direct MCP/REST token probes reproduced failures outside Pump. This check uses the documented REST endpoints directly, bypassing Pump’s UI, market mapper, signed policies, local model and ledger. No production code, credentials, policies, balances or sessions were changed.

| Boundary or tool | Actual result |
|---|---|
| Authentication and scope | whoami HTTP 200; tools:read; six tools; unexpired credential |
| Operator quota | 60 remaining before, 57 after; no HTTP 429 |
| Catalog/arguments | All six valid calls checked against the current advertised schemas |
| market_overview | HTTP 200, partial/live; market totals, sentiment, breadth and movers null/empty |
| monitor_market_sentiment_shift, 7d | HTTP 200, unavailable/unknown; nested upstream code 1010 and explicit monthly-credit message |
| scan_market, top_n 3 without chain/theme filters | HTTP 200, unavailable/unknown; zero candidates even without filters |
| analyze_token ETH, explicit chain eth | HTTP 400; couldn't analyze ETH right now |
| deep_analysis SOL, include_perp false | HTTP 400; current USD market data unavailable |
| compare_tokens BTC/ETH, spot | HTTP 400; not enough current USD market data for comparison |
| Negative control: missing required symbol | HTTP 400; requires a symbol; latency_ms 0, distinct from the valid-token failure |

Requests ran **21:28:52–21:31:01 UTC (22:28:52–22:31:01 Lagos, October 24)**. Tool calls were at least 21 seconds apart. The full raw bodies and per-response rate headers are retained in responses.json. Headers identifying sessions/credentials and whoami key identity metadata are excluded. Missing-argument control is explicitly labeled; it is not an asset availability test.

## What this does and does not establish

1. **Confirmed:** the operator credential authenticates and lists scope tools:read with all six tools. Its exposed rate allowance is not exhausted. That is stronger evidence against a wrong/expired credential or an exhausted operator per-minute limit, but not independent inspection of every server-side entitlement.
2. **Confirmed:** RYO can dispatch tools and serialize responses. Public OpenAPI explicitly documents that a failing REST tool becomes HTTP 400, so VALIDATION_FAILED alone is not proof that the request symbol is invalid. The missing-symbol control produces a specific immediate argument error, while valid requests progress to analysis failures.
3. **Confirmed:** the sentiment tool reports monthly credit exhaustion in its upstream research dependency and links CoinMarketCap. Waiting a minute, changing tickers, switching MCP/REST, changing Monad/Sepolia, or editing Pump’s mapper cannot replenish that upstream monthly allowance. We do not know its reset date, account ownership, plan or shared allocation beyond what RYO reports.
4. **Strong hypothesis, not fully proven:** the same exhausted market-data dependency explains the empty overview/scan and generic token-price failures. Cross-tool missing market data is consistent with it, but token wrappers hide the inner error, so only RYO’s logs can confirm the shared code path or another concurrent failure.
5. **Not safe as trading evidence:** overview labels regime neutral and 0% market-cap change while primary market totals are null; availability marks market_totals available despite the null measurements. Do not treat these labels/default-looking values as independently measured market facts. No placeholder signal was integrated into Pump.

The official builder guide was fetched again and is byte-for-byte unchanged (12,471 bytes, SHA-256 c87611bd99d825bdb44f1b4f0ccafbb1d09b2f6c4cbbb13f965eaf65e182c77c). Current official OpenAPI confirms the REST failure envelope and that whoami/catalog reads are not tool-quota charges; excerpts/hashes are in official-contract-excerpt.json. Official CoinMarketCap documentation also identifies code 1010 as monthly credit exhaustion, but the decisive evidence here is the literal nested error returned by RYO.

## Concrete next step

RYO’s operators need to inspect the upstream CoinMarketCap account/credential configuration used by this research path and restore available allowance or a working upstream configuration. We have no authorization/access to administer it, and no purchase or subscription is proposed. They should correlate the sentiment request at **21:29:15–21:29:16 UTC** with these token traces:

- ETH with chain eth: 822e60f1a5504dec8959f1695a8a98bd
- SOL deep analysis: aafc8b3ee53841478ae956d631360a92
- BTC/ETH comparison: 637f052137134e33bf8ae87c572236c5

### Unsent support draft

On October 24, 2026, our authenticated whoami returned tools:read and 60/minute available quota. At approximately 21:29:16 UTC, monitor_market_sentiment_shift with {"time_window":"7d"} returned status unavailable, data_mode unknown, and data.error.details code 1010: “Monthly credit limit reached. Your credits are shared between REST API and MCP.” It links to coinmarketcap.com/api/pricing/. Direct token calls with valid advertised arguments still fail; traces above are included. Could you verify the upstream credit/configuration used for these calls and confirm whether the same dependency causes token-price failures? Overview also returns market_totals available while its cap/volume values are null. Please preserve unavailable status rather than treating nulls/default-looking regime values as measurements.

No support message was sent. Public evidence was scanned against configured secret values. SHA256SUMS establishes integrity relative to this package, not independent provider attestation. The upstream-error.json excerpt contains no credential or key identity.
