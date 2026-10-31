# RYO quota and price recheck — October 24, 2026

Fresh read-only checks following the operator’s report that earlier failures might have involved rate limiting. No trading, policy changes, subscriptions or agent decisions occurred.

## Observations

| Check | Observation time (UTC) | Result | Advertised quota |
|---|---|---|---|
| Health | 20:30:19–20:30:21 | HTTP 200; status ok; protocol 2024-11-05; six tools | Not supplied |
| Credential/quota before prices | 20:30:21 | HTTP 200 | 60/minute, 60 remaining |
| REST analyze_token ETH | 20:30:22.362 | HTTP 400; VALIDATION_FAILED; couldn't analyze ETH right now | Limit 60, remaining 59 |
| REST analyze_token SOL | 20:30:42.364 | HTTP 400; VALIDATION_FAILED; couldn't analyze SOL right now | Limit 60, remaining 58 |
| MCP analyze_token ETH | 20:32:32.046 | HTTP 200; result.isError true; couldn't analyze ETH right now | Limit 60, remaining 59 |
| Credential/quota after final MCP call | After 20:32:32 | HTTP 200 | 60/minute, 59 remaining |

Lagos time is UTC+01:00: the final MCP analysis was requested at **21:32:32 on October 24**. Actual raw request and receipt times take precedence over rounded table entries.

Fresh authenticated tool discovery succeeded. ETH and SOL requests matched the advertised analyze_token schema. No HTTP 401, 403 or 429 was observed. The price errors did not contain a rate-limit code or Retry-After header. Raw rate-limit limit/remaining/reset headers were retained; unrelated headers, credentials and key-identifying whoami fields were excluded from the public report.

## Interpretation

Our RYO credential’s exposed request quota was **not exhausted when these calls failed**. This does not establish what caused previous failures, or rule out a rate limit, quota, outage or error inside one of RYO’s own upstream dependencies. RYO reports a generic tool failure, so the internal cause remains unverified. Health status confirms the endpoint is serving requests, not that its price provider is healthy.

Trace IDs for provider investigation:

- REST ETH: `eb34b8adc77c47d7a083431f32680ef5`
- REST SOL: `c1d0985ca82d40fbac8551006217c6de`
- MCP ETH: `6a7f2217658647918e57e46786421898`

No support message has been sent.

## Evidence and diagnostic limits

- [REST/health/quota captures](../ryo-rate-recheck-2026-10-24T20-30-19-482Z/responses.json)
- [Completed MCP handshake, token call and final quota capture](responses.json)

The first combined diagnostic reserved no capacity for a complete MCP handshake. Its local pacing wait exhausted a per-request abort timer after initialization; no token call was sent in that attempt. That **local diagnostic timeout is not counted as a RYO tool failure**. The MCP-only follow-up reserved handshake capacity and completed initialize → initialized → tools/list → tools/call successfully at the transport level, then received the explicit ETH tool error above. Production application files were not changed by this recheck.

Whoami identity/credential metadata was retained only in ignored local files with mode 0600. Public evidence contains numeric quota fields and allowlisted rate headers. A scan against configured secret values passed. SHA256SUMS detects changes relative to the manifest; it does not provide independent provider attestation.
