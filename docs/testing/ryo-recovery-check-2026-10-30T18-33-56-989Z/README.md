# RYO recovery confirmed for sampled MCP tools — October 30, 2026

Checks completed at approximately **19:34 Lagos time (18:34 UTC)**.

| Check | Result |
|---|---|
| Public health | HTTP 200; status ok |
| Authenticated whoami | HTTP 200; tools:read; 60/60 quota before tool calls |
| MCP analyze_token ETH | HTTP 200; isError false; status partial; data_mode live; market_data available |
| MCP monitor_market_sentiment_shift, 7d | HTTP 200; isError false; status ok; data_mode live; execution completed |

ETH returned **$2,225.893527293818**, provider as_of **2026-10-30T18:34:00Z**. Sentiment returned Fear & Greed **35 (fear)**, with a seven-day baseline of 47 and a change of -12 points. The sentiment response attributes its evidence to CoinMarketCap. The historical code 1010/monthly-credit error was absent in these sampled responses. This is evidence of recovered data for these tools, not independent knowledge of the provider account’s billing/reset history or complete service recovery.

ETH technical analysis remains partial: RSI(14) and ATR(14) are null. The asset’s chain and contract are null, and the response does not provide measured liquidity. The textual catalyst calling liquidity deep is not a numeric liquidity observation. These gaps must not be filled from market cap, volume or a headline. A successful priced response does not by itself satisfy Pump’s signed instrument/liquidity entry requirements.

The actual MCP discovery, request arguments, raw tool bodies, protocol responses, provider timestamps, receipt times and rate headers are in responses.json. summary.json extracts the successful observations. Only ETH analysis and seven-day sentiment were tested; this run does not verify REST, other symbols, Pump’s response mapper, model inference, a signed practice policy, a ledger fill or funded Sepolia execution. No production files, policies, balances or wallet state changed.

Credentials, whoami key identity and session headers are excluded from the public evidence. The configured-secret scan passed. Hashes establish integrity relative to this manifest, not provider authenticity.
