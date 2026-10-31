# RYO retry — October 29, 2026

At 10:24:33.117 UTC (11:24:33 Lagos), public /health returned HTTP 200 and status ok. The following authenticated /whoami request did not complete within its 20-second client deadline. That capture is in [the first attempt](../ryo-recovery-check-2026-10-29T10-24-32-200Z/responses.json).

At 10:25:23 UTC (11:25:23 Lagos), a separate direct authenticated REST analyze_token request with {"symbol":"ETH"} was attempted without gating on whoami or repeating health. It also timed out after the configured 20 seconds; no HTTP status, headers, body or price was received. [Direct request-start and diagnostic outcome](responses.json).

Public health has resumed responding compared with the immediately preceding health timeouts. Authenticated research/pricing recovery remains unconfirmed. A timeout does not establish rejected credentials, rate limiting, the historical upstream monthly-credit error, or a global outage. MCP and sentiment tools were not reached in this retry. No production code, policies, balances or wallet state were changed; no provider message was sent.
