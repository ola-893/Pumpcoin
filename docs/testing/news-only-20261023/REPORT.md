# News-only research acceptance — 2026-10-23

The operator removed X/Multi-KOL collection because there is no cash budget for API purchases. This change uses the existing market/news strategy, configured free public RSS feed and installed local model. No replacement paid service or automatic purchase was added.

## Verified changes

- Removed the live X timeline/user adapter, token loading, handle-resolution HTTP route, X CLI probe and creator fields from new policy setup. Leaving a token in `.env` cannot cause this adapter to call X.
- New policy challenges accept `market-news` only, with no selected X voices and at least one news feed. Historic Multi-KOL evidence types, normalization and replay remain for inspection. Old authorizations are not edited or re-signed.
- Configured RSS URLs are proposed by the helper and remain editable before review/signing. No agent source state is hardcoded in the frontend.
- The running helper reports X disabled, the exact configured CoinDesk RSS URL, zero policies and zero sessions for Muse Sepolia.
- All **188 TypeScript tests pass**, including no-X network/credential tests and a controller/execution-authorized single-session policy with replayable HOLD/blocked behavior. Typecheck and production build pass; lint completes with existing warnings and no errors.

## Actual free-source probe

At **2026-10-23 15:22:36.224 UTC**, one request to the already-configured `https://www.coindesk.com/arc/outboundfeeds/rss` returned **25** normalized news items. **Zero** were within one hour of capture. All source timestamps were retained; freshness was not relaxed. The request wrapper allowed only this exact feed URL, so this probe made zero X and zero RYO calls. Captures and normalization were checked; the private raw response remains local. Its hash and source statuses appear in [the preflight summary](free-feed-preflight.json).

This is successful RSS access, not proof of news truth, live model execution, a signed policy, a trading decision or profitability. No paid X access is needed.

## Remaining acceptance checks

- RYO has not yet supplied a usable authenticated price/liquidity/instrument mapping. Entries remain blocked; headlines cannot substitute for quotes or create invented fills.
- The latest feed had no posts fresh enough for the default one-hour policy. A fresh publication is needed for a genuine model interpretation under that limit. Do not relabel stale stories as new observations.
- Muse Sepolia's signed enrollment remains historical and valid. Its manifest mentions the previous scope; it has not been rewritten. The current code differs from its code manifest, which the offline verifier now reports explicitly. A subsequent research policy must bind the current engine; no new policy or session has been signed as part of removing X.
- The new frontend builds successfully, but full browser acceptance remains unverified: native Chrome automation repeatedly returned stale accessibility state/window-change errors during the refresh. API and source checks alone do not establish a complete UI demonstration.

## Reproduction

```sh
npm test
npm run typecheck
npm run build
npm run lint
node --import tsx docs/testing/ryo-coverage-20261023/verify-enrollment.ts
# Optional strict match to historical enrollment source; fails after source changes:
node --import tsx docs/testing/ryo-coverage-20261023/verify-enrollment.ts --require-current-code
```

The free path has no new provider purchase requirement. It still depends on available public feeds, the already-configured RYO builder quota and the operator's local compute. No live trading or complete demo readiness is claimed.
