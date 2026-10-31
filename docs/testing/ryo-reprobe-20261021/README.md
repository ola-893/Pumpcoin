# RYO re-probe and HOLD-path repair — October 21, 2026

This follow-up separates live provider observations from a controlled regression test. No genuine agent decision, practice fill or comparison result was created by this work.

## Live observations

The sanitized request/response bodies and receipt times are in [provider-evidence.json](provider-evidence.json). All times are UTC (`Z`); Lagos is UTC+01:00.

| Check | Observed result |
| --- | --- |
| `analyze_token`, `{"symbol":"SOL"}` | October 21, 09:36:59.586 UTC: MCP `isError: true`; trace `7e214b46a89d41389a7de45efb746618`. |
| `scan_market`, `{"chain":"eth","top_n":1}` | October 21, 09:37:00.326 UTC: MCP `isError: false`, payload `status: unavailable`, `data_mode: unknown`, zero candidates. No trace ID was supplied. |
| `GET /api/mcp/whoami` | HTTP 200; `tools:read`; expiry December 17, 2026; rate limit 60/minute and 60 remaining at that later check. Six published tools. Identifiers and credential omitted. |

These observations are consistent with a provider data problem, but do not prove its internal cause. The scan itself says no candidates matched the filters. No authentication failure or rate-limit rejection was observed. The precise HTTP status of the two tool calls was not retained; their MCP/application statuses are retained. Do not retrospectively fill that gap with an assumed HTTP 200.

The [organizer-hosted builder guide](https://dev.ryobuild.com/docs/MCP-Builder-Guide.md), dated August 13, was fetched and verified byte for byte against the [pinned third-party copy](https://raw.githubusercontent.com/PugarHuda/nota/7f1189a9b9b3747acfcb09621df2acde30f10e13/docs/MCP-Builder-Guide.md): 12,471 bytes, 452 lines, SHA-256 `c87611bd99d825bdb44f1b4f0ccafbb1d09b2f6c4cbbb13f965eaf65e182c77c`. No diff or newline difference exists. The root-domain guide URL returns an HTML app page despite HTTP 200. The actual guide documents free `whoami` quota inspection, excludes a symbol-only safety claim, and contains no submission rules. The live catalog remains the authority for this credential's available tools. No symbol-only safety tool is advertised. No successful liquidity field was observed in these failed probes. [Source hashes and organizer verification](organizer-verification.json).

## Targeted repair

Previously the worker required complete mapped RYO markets before calling the local model. Fresh real news could therefore never produce a reasoned HOLD during market-data failures. The worker now permits interpretation when the selected strategy has fresh, normalized publications and available publication-source coverage. With no such publications it still skips inference.

Post classifications may reference the signed watchlist without a priced market. This establishes a model interpretation only. BUY/SELL proposal validation, instrument identity, fresh price, positive liquidity, the existing passing-safety gate and all portfolio rules remain enforced. The prompt requires HOLD when market evidence is missing and prohibits inventing prices or safety from publications or an empty flags list. No risk flags were converted to `safe: true`; no second provider was added. Restoring prices alone will not unblock BUY.

The regression uses explicitly controlled source and model responses in an in-memory database. It verifies a controller/execution-authorized session, one HOLD receipt, checkpoint replay, unchanged cash, no orders/positions, stale-source inference exclusion, unknown-symbol rejection and tamper rejection. This is correctness testing, not a live model run. Existing signatures are not rewritten: the changed engine requires a new reviewed policy.

Validation: **180 Node tests passed** and root TypeScript checking passed. Reproduce:

```sh
node --import tsx --test tests/research-runtime.test.ts tests/research-strategies.test.ts tests/research-provenance.test.ts
npm test
npm run typecheck
```

For fresh live evidence, use the existing source check (requires the server-only `.env`; consumes read-only provider quota):

```sh
npm run agent:research -- sources --discover
npm run agent:research -- sources --check-symbol SOL --output .local/research/new-sol-probe.json
```

The builder guide documents a free, read-only `GET` to `$PUMPCOIN_RYO_MCP_URL/whoami` using the same server-side Bearer credential. Keep its key identifier and label private when preparing a public report. No credential belongs in browser code or shell output.

## Actual local state and acceptance limits

- The local SQLite store contained **zero policies, sessions, decisions and events** at verification. External Chrome's Gemma profile also displayed no signed policy or practice history, with RYO/news configured and RYO mapping/X still required. This is a baseline consistency check; a new HOLD rendering was not verified. A later source-check walkthrough was interrupted by Chrome window changes, and the normal Chrome profile emitted a Talisman-extension initialization error. No wallet settings were changed.
- Gemma's registered local health endpoint refused connections (`ECONNREFUSED`). A running model with matching signed weights/runtime artifacts is required before claiming a genuine inference. No replacement model or hosted fallback was used.
- A reviewed controller-signed research policy is also required before a genuine session. The controlled test signatures do not authorize a real agent.
- Priced instrument mapping, liquidity and an appropriately sourced safety check remain unmet entry dependencies. This repair deliberately chooses HOLD/blocked entries rather than changing that policy or declaring RYO risk flags a safety verdict.
- Multi-KOL still requires authorized X access and selected account IDs. No paid xAI service or alternative social source was introduced. No strategy winner is supported.
- The [official landing page](https://ryobuild.com/hackathon) bundle lists November 11, 2026, 23:59 JST (`2026-11-11T23:59:00+09:00`), equivalent to November 11 at 15:59 Lagos time. The [public configuration API](https://app-ryochan.com/api/hackathon/config) instead returns `2026-11-11T23:59:59Z`, equivalent to November 12 at 00:59:59 Lagos time, and currently reports `submission_open`. These primary sources disagree by about nine hours. Plan around the earlier published time; the definitive timezone still needs organizer clarification.
- The [current public OpenAPI schema](https://app-ryochan.com/api/openapi.json) advertises video, repository and X-post URL fields, rules/secrets confirmations, and an authenticated private-repository request flow. Final-submit requiredness is enforced by the service; it was not exercised. The official config links a submission form, but the linked PDF currently returns HTML, not a PDF. Exact rubric weights, disqualification/reuse wording, a required `main` branch and a requirement to commit a PDF remain unverified. No authenticated participant route was called, no repository was requested, and no rules were accepted.

## Help Desk draft — not sent

> On October 21, 2026 at 09:36:59.586 UTC, `analyze_token` with `{"symbol":"SOL"}` returned MCP `isError: true`, message "couldn't analyze SOL right now", trace `7e214b46a89d41389a7de45efb746618`. At 09:37:00.326 UTC, `scan_market` with `{"chain":"eth","top_n":1}` returned `status: unavailable`, `data_mode: unknown`, zero candidates and no trace ID. Exact HTTP codes for these tool captures were not retained. A subsequent documented `whoami` request returned HTTP 200 with `tools:read`, an unexpired key and remaining quota. Earlier ETH/BTC calls also failed and overview data was partial. Could you investigate these traces and confirm the expected instrument, price, liquidity and timestamp fields? We understand token research is not a symbol-only safety verdict. Please also provide the current official submission checklist, deadline and reuse policy.

> The current landing page specifies November 11 at 23:59 JST, while `/api/hackathon/config` specifies November 11 at 23:59:59 UTC. Which timezone governs the deadline? The configuration's `project-submission-form.pdf` link returns HTML; please provide the actual form and confirm whether it must be committed to `main`.

No external message was sent. The draft excludes credentials, key identifiers, labels and private local endpoints.

## Reuse disclosure for the eventual submission

Pump's existing registration, local-model discovery, identity/evidence, Monad vaults, Pump shares/gateways and archived credit implementation predate this RYO integration. They are already present in base commit `2e7d758` (October 13, 2026). RYO research/practice work first appears in public integration commit `a614b7d` (October 21, 2026), followed by `b7ac1e4` documentation and this repair. Those are repository-history facts, not proof of when code was authored or whether reuse is eligible under organizer rules. Disclose this base and dependency licenses; do not claim the entire repository was created from scratch for this entry.
