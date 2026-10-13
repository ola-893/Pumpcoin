# Stripe payout provider requirements

The verifier/session adapter is now implemented; see [the eligibility runbook](ELIGIBILITY.md) for the exact extracted-field schema, reviewed content-hash pins, and API. A compatible provider and authentic fixture are still outstanding. The requirements below remain provider-review gates, not claims that a deployed Stripe provider satisfies them.

You need a **provider ID and its pinned version** in addition to the Reclaim app ID and secret. No compatible Stripe provider has yet been selected or tested for this project. Reuse a provider only if its authenticated data and extraction satisfy this specification; otherwise create a custom one in the Reclaim developer tooling.

Required verified facts:

- The authenticated Stripe Connect account to which the payouts belong. Reject caller-supplied account IDs that are not bound to the authenticated response.
- Currency (start with USD only), integer minor-unit amounts, and an explicit test-mode/live-mode flag. Never aggregate different currencies.
- A precisely defined 90-day UTC window. Decide whether to use payout creation or arrival timestamps before implementation and use that definition consistently.
- Only payouts with the chosen successful/paid status. Exclude canceled, failed, pending, duplicated, and out-of-window items.
- Complete coverage of that window, including pagination or a trustworthy server-computed aggregate. A single dashboard page or a client-calculated total is not sufficient.
- An authenticated timestamp/freshness policy and provider identity/version. Pin verification to the expected provider, not merely any cryptographically valid proof.

The later verifier must bind the proof to a server-created session, borrower wallet, application, destination chain and registry. Require a wallet-signed challenge when issuing that session. Check the verified context, not a separately POSTed `subjectAddress`. Consume the session/canonical proof identity once. Wallet binding prevents proof theft but is not account-level Sybil resistance.

Stripe **payouts are not revenue or income**: payouts may differ because of timing, reserves, refunds and fees. UI and demo claims should say “verified 90-day payouts.” Thresholds and credential duration are demo policy, not credit underwriting. A Stripe test-mode proof demonstrates integration, not real earnings.

The application secret shared in chat should be rotated before use. Store the replacement only in the local ignored `.env` (or a secrets manager later); do not send it through chat. Session creation belongs on the backend; returning the app secret to the browser would still expose it even if it was fetched from a backend.

When ready, provide `RECLAIM_PROVIDER_ID`, `RECLAIM_PROVIDER_VERSION`, and the path of the local environment file. No secret is needed to run milestone 1.

References checked 2026-09-18:

- [Reclaim integration and provider-building entry points](https://docs.reclaimprotocol.org/)
- [JS SDK: context binding, provider pinning, server callbacks and verification result](https://docs.reclaimprotocol.org/manual/js-sdk/usage)
- [Proof and verification data structures](https://docs.reclaimprotocol.org/troubleshooting/anatomy)
