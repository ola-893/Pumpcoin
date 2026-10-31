# RYO / creator coverage acceptance — 2026-10-23

**Scope changed after these probes:** the operator removed X/Multi-KOL to keep the project within a zero-cash budget. New policies use market/news only; live X collection and token loading are removed. This report retains the historical access probes. See [the current news-only acceptance report](../news-only-20261023/REPORT.md).

This package distinguishes real provider observations, controlled tests and operator configuration. It does not establish a working live strategy or authorize funded trades.

## Creator selection

The operator asked Pump to choose the pilot accounts. The editable server configuration proposes three sources, with no assigned trust score or presumed independent control:

| Handle | Selection rationale | Primary identity/context source |
| --- | --- | --- |
| `VitalikButerin` | Ethereum protocol and technical context; not a promise of timely market calls | [Author's site](https://vitalik.eth.limo/), [X profile](https://x.com/VitalikButerin) |
| `ki_young_ju` | On-chain market analysis, offering a different type of evidence | [CryptoQuant analyst profile](https://consensus.cryptoquant.com/analyst/ki_young_ju) |
| `lookonchain` | Wallet-flow observations for tracing claims back to transactions | [Official site](https://www.lookonchain.com/) links to [this X profile](https://x.com/lookonchain) |

Research date: 2026-10-23. These selections are hypotheses for a small pilot, not a measured ranking or endorsement. Posts may cite one another or the same underlying event. Existing repost/origin grouping and text deduplication do not establish organizational independence or independent corroboration. Do not promise that these accounts will produce fresh, convergent signals within a particular recording window.

`PUMPCOIN_KOL_HANDLES` supplies proposed handles to the local setup form. It does not modify signed policies. X user lookup must resolve all selected handles to distinct, public numeric account IDs. Its raw response is shown before policy review. A successful lookup is not successful timeline coverage. The operator subsequently configured `PUMPCOIN_X_BEARER_TOKEN`. The first lookup returned HTTP 402 `credits-depleted`, so no numeric identities or posts have been substituted. See the current access result below.

## Current X access result

At **2026-10-23 15:15:30.839 UTC**, a bounded `GET /2/users/by?usernames=VitalikButerin,ki_young_ju,lookonchain&user.fields=protected` diagnostic returned HTTP **402**, title `Payment Required`, type `https://api.x.com/2/problems/credits-depleted`, detail `credits depleted`. The token is configured; usable access and endpoint permissions remain unverified until X credits are available. No timelines were requested and no posts were fetched. [Exact sanitized error capture](x-access-402.json) is included. No credits were purchased and no recurring collection was started.

## Actual RYO observations

Official [MCP builder guide](https://dev.ryobuild.com/docs/MCP-Builder-Guide.md) and the authenticated tool catalog were consulted. Authentication/`whoami` and discovery worked. The following paced, read-only tool calls did not supply usable priced markets:

| Request start (UTC) | Tool and exact arguments | Observed result | Trace ID |
| --- | --- | --- | --- |
| 2026-10-23 11:45:31.455 | `analyze_token {"symbol":"SOL"}` | MCP tool error; SOL analysis unavailable | `c521c7df5db949b5b078ebadfc29e012` |
| 2026-10-23 11:45:43.646 | `scan_market {"chain":"eth","top_n":2}` | Unavailable; `data_mode: unknown`; zero candidates | Not supplied |
| 2026-10-23 11:45:55.921 | `deep_analysis {"symbol":"BTC"}` | Current USD market data unavailable | `69a707850a06438b9236ffc61bcf211d` |

The exact retained tool exchanges are in [ryo-probes.json](ryo-probes.json), with [SHA256SUMS](SHA256SUMS). Credentials, quota identity and transport headers are excluded; tool response bodies are retained. Hashes establish file integrity relative to this manifest, not provider authenticity. The package is an **unsent support report**: no message has been sent to RYO.

A further ETH preflight at **2026-10-23 14:45:16 UTC** still returned a tool error, trace `53de3c333be54c21844078de27570bce`; see [the additional raw capture](ryo-resume-eth.json). It contained zero mapped markets; the separate configured news feed supplied 25 normalized items.

No successful response proves the instrument-ID, price, liquidity and observation-time mapping. `PUMPCOIN_RYO_PROFILE` remains unset. Do not derive a field mapping from a fixture, a headline or an unavailable response. Buy eligibility remains blocked. A different symbol is not evidence of restored coverage.

## Repairs and checks

- Local Muse detection now resolves relative weights paths using the inspected model process's working directory, and still verifies the actually mapped GGUF and runtime artifacts. External Chrome displayed **Locally detected**, `muse-glimmer-30b`, 15.88 GB and a matched download record at 2026-10-23 11:56:01 UTC. This is a file/process measurement, not hardware-backed model-execution attestation.
- X handle resolution requires separate authorized X credentials and complete public identity coverage; it rejects partial, protected, ambiguous, duplicate and non-string numeric identities. Raw lookup content and receipt time are reviewable. Changing handles clears pending identities and policy review. Existing signed records are not rewritten.
- The new profile opened in external Chrome and showed the same name, WETH/USDC pair, registration time, historical signature status and synthetic inference receipt as the stored registration. The research API returned the three proposed handles, zero policies and zero sessions, with RYO mapping/X access false. Creator-lookup missing-access handling passed controlled tests; its full browser acceptance is still unverified because the native automation accessibility state and foreground rendering became inconsistent during the lookup. No successful X integration is claimed.
- A bounded CLI X preflight resolves identities and reads up to 20 returned posts per account. It records per-account failures. The actual local preflight stopped before network access with the precise missing `PUMPCOIN_X_BEARER_TOKEN` dependency. No live X success is claimed.
- After the operator unlocked the Mac, both local services were restarted. **Muse Sepolia was registered locally at 2026-10-23 14:52:15.875 UTC**, chain 11155111, manifest `0x92067204bc466d7b90f36a3882f00f4bfbdb055752e8408ef72191d19e3654b7`. The controller and dedicated execution-key signatures verify. A delayed attempt was correctly rejected by the unchanged two-minute worker freshness check; a fresh session then completed. The stored worker record covers three synthetic local inferences and eight deterministic guard challenges. [Public registration](muse-sepolia-registration.json), [committed code manifest](muse-sepolia-code-manifest.json) and [offline verifier](verify-enrollment.ts) are included. The verifier independently recomputes the stored guard results and compares all 66 source/lock hashes. The current checkout now differs because X was subsequently removed; it reports these changes separately without rewriting the signed historical manifest. Pass `--require-current-code` to reject that mismatch. This is local enrollment with **vault pending**, not a public-chain identity or live performance result.
- The default adapter budget is conservatively six MCP RPC requests per wall-clock minute, including discovery. The configured operator value is also six. This is per process, not an account-wide or rolling-window provider-quota guarantee.
- Controlled tests cover missing authorization, invalid handles, identity matching, raw-response preservation, HTTP 401/403/429, partial responses, and lookup success followed by timeline failure. These test responses are explicitly fabricated and are not live evidence.
- Verification: **190 TypeScript tests pass**; typecheck and production build pass. Lint has existing warnings and no errors. No contract logic was changed by these coverage repairs; the independently verified Sepolia infrastructure round trip remains separate from agent performance.

## Reproduction and remaining acceptance gates

```sh
npm test
npm run typecheck
npm run build
npm run lint
node --import tsx docs/testing/ryo-coverage-20261023/verify-enrollment.ts
shasum -a 256 docs/testing/ryo-coverage-20261023/ryo-probes.json
# After configuring authorized X access in the server-only .env:
npm run agent:research -- sources --check-voices VitalikButerin,ki_young_ju,lookonchain --output <new-x-probe.json>
# After RYO confirms restored coverage; preserve a new capture, do not overwrite this one:
npm run agent:research -- sources --check-symbol ETH --output <new-market-probe.json>
```

1. **RYO dependency:** a successful authentic priced response containing instrument identity, price, liquidity and their source timestamps; review and acceptance-test its exact mapping. Current failure traces are ready for provider support.
2. **X dependency:** an X developer application/token authorized for `GET /2/users/by` and `GET /2/users/{id}/tweets`, with quota for the selected accounts. [Official lookup documentation](https://docs.x.com/x-api/users/lookup/introduction) describes this separate authorization. The server-only token is now configured; X returns `credits-depleted`. The operator needs available X API credits for the app/account, then a fresh bounded access check. Never paste the token into chat or the browser form. Restart the operator server after credential changes.
3. **Agent acceptance:** fresh Sepolia local enrollment is complete and independently checked. The controller-signed research policy and both real research sessions remain pending authentic input coverage. Retain exact raw inputs, model exchanges, signatures and ledger events; verify UI/export/replay after restart. No genuine live strategy result or comparison winner is claimed.

The enrollment signatures bind the manifest/session, not an independently attested worker execution. Its stored worker receipt can be checked for consistency but can still be replaced by an operator controlling storage. A wallet signature establishes that its key authorized particular bytes; receipt chains and deterministic replay establish stored-history consistency under the pinned engine. They do not prove provider truth, exhaustive collection, independent authorship, actual model execution or profitable future behavior. A practice ledger does not prove a funded swap. The full-coverage demo remains pending these gates, as requested by the operator.
