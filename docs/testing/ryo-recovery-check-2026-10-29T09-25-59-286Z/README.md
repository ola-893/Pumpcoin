# RYO recovery retry — October 29, 2026

The network-enabled Node health request timed out after its configured 20 seconds. An independent network-enabled curl GET to the same public health URL also timed out: exit code 28, HTTP code 000, zero bytes received after 15.006486 seconds. curl reported TCP connection time 0.231901 seconds; no HTTP status or response body was received.

This retry did not get far enough to test authenticated access, token pricing or sentiment. Those are unverified in this attempt. These observations establish lack of an HTTP response from this machine within the configured deadlines, not the specific internal cause or a global outage. The previously observed monthly-credit error was not re-observed here.

responses.json contains the Node diagnostic outcome. curl-health-control.json records the independent terminal control. The earlier default-sandbox attempt is retained separately and is not relied on to establish provider reachability. No application code, credentials, signed policies, ledger state or wallet state were changed; no provider messages were sent.
