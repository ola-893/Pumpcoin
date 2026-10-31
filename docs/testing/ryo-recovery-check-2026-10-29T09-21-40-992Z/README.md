# RYO recovery check — October 29, 2026

Public health responds, but authenticated access and pricing did not complete within the configured 20-second request timeout. No usable price was returned. This does not establish an HTTP authentication rejection, a specific upstream failure or continuing monthly-credit exhaustion today.

| Attempt | Raw public health observation (UTC) | Subsequent authenticated request | Result |
|---|---|---|---|
| First | 09:14:53.972, HTTP 200 / status ok | GET /whoami | 20-second timeout; no HTTP response captured |
| Repeat | 09:15:35.090, HTTP 200 / status ok | GET /whoami | 20-second timeout; no HTTP response captured |
| Direct price control | 09:21:49.072, HTTP 200 / status ok | POST /tools/analyze_token/call with {"symbol":"ETH"} | 20-second timeout; no HTTP response captured |

Lagos time is UTC+01:00; the final public health response was observed at **10:21:49 on October 29**. Health reports server ryo-chan, protocol 2024-11-05 and six tools. It does not verify authenticated research execution.

The direct price check intentionally bypassed whoami so a failure limited to whoami would not alone prevent a price attempt. No MCP tool call or sentiment request was completed in this check: the original sequence stopped at authenticated access, and the direct REST control timed out. The previous upstream monthly-credit error therefore remains a historical finding, not a freshly confirmed cause for these timeouts.

Evidence:

- [First network-enabled attempt](../ryo-recovery-check-2026-10-29T09-14-52-992Z/responses.json)
- [Repeat network-enabled attempt](../ryo-recovery-check-2026-10-29T09-15-34-338Z/responses.json)
- [Direct REST price attempt](responses.json)

The separate 09:14:18 attempt failed under the local sandbox's network restrictions and is not counted as a provider outage. All three attempts above ran with permitted network access. The diagnostic output retains the health bodies and timeout messages; failed requests produced no HTTP status, headers or response body to retain. Do not infer 401, 429, or a provider trace ID from a timeout.

No application files, signed policies, ledger balances or wallet state were changed. Calls were read-only. Credentials and identity metadata are excluded. A configured-secret scan passed; hashes establish integrity relative to the manifest, not independent provider attestation.
