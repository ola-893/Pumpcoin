# Practice price dependency repair — 2026-10-23

New policies can explicitly authorize free Coinbase Exchange USD spot books as their practice pricing source. RYO responses remain separately attributed and unavailable RYO pricing no longer vetoes these policies. Existing policies without a source retain RYO semantics. Historical registrations, authorizations and decisions were not rewritten.

## Verified behavior

- Authentic ETH level-two capture at **15:39:24.298 UTC**: midpoint **$2,399.50**, smaller two-sided displayed USD depth within 10 bps **$1,083,603.089131**. Provider book time **15:39:19.373760304 UTC**. Independent Python Decimal calculations match the normalized midpoint and depth exactly.
- External Chrome source check at **15:46:41.655 UTC** displayed the same instrument, midpoint, formatted depth and book time as the cached local helper response. Independent calculations over that second raw capture match too. See `browser-ui-excerpt.txt`, `browser-helper-preflight.json` and `browser-independent-calculation.json`.
- RYO priced coverage remained false. The real `analyze_token` tool response is retained; Coinbase is never relabeled as RYO or Sepolia data.
- New eight-test source suite covers raw replay, provider time, two-sided depth/rounding, aggregation counts, far-order exclusion, ordering, failed HTTP, auctions, empty/crossed books, invalid decimals, future/missing times, exact signed source/identity, stale quotes, spread/slippage bounds, 1% participation, delayed fills, fees/cash conservation, caching/coalescing, malformed RYO isolation and a complete controlled signed-checkpoint replay.
- Full regression run passed **195/195** after the implementation changes; the subsequently added complete-checkpoint test passed in the **16/16 targeted run** (eight new source tests plus existing MCP/provenance tests). TypeScript checks, production build, lint and `git diff --check` passed. Lint retains pre-existing hook/purity warnings; the build retains its large-chunk warning. Test fixtures and test signatures are explicitly controlled and are not live agent evidence.

## Data semantics and boundaries

The exact request is `GET https://api.exchange.coinbase.com/products/ETH-USD/book?level=2`, with no Coinbase credential. The raw body, URL, HTTP status, request start, receipt time and provider book time are preserved. Redirects are refused; responses and combined captures remain bounded to 2 MB. Invalid/error bodies stay inspectable but cannot claim market coverage. Unmapped RYO discovery/tool reads have a 20-second aggregate abort budget per symbol and do not erase a valid separately authorized quote when their tool response is malformed.

Normalization validates non-auction, positive, sorted, non-crossed two-sided books. Midpoint rounds down to micro-USD. Depth sums price × aggregated size on each side inside ±10 bps of midpoint, then takes the smaller side and rounds down. Order count never multiplies size. This is observed venue depth, not total token liquidity, reserves or an execution guarantee. Signed adverse slippage must cover that band and the observed spread. Existing signed minimum depth, at-most-1% participation and fill-time risk checks remain enforced.

`marketRules.source: "coinbase-exchange"` and the exact instrument (`coinbase:ETH-USD`, symbol `ETH`, venue/network label `coinbase-exchange`) are part of the reviewed signed policy and current engine digest. The venue label is not a chain ID. A new signature is required; no source is silently substituted under an old authorization. The operator setup exposes source selection and authentic observations before signing.

Signatures establish the signing keys' consent/assertions and integrity of the committed policy, captures, interpretations and ledger. They do **not** establish source truth, complete collection, independent provider attestation, actual model execution or live fill quality. These read-only preflights are unsigned and are not an agent decision, practice return or funded transaction.

## Remaining acceptance checks

- **No live practice trade is claimed.** The current CoinDesk feed yielded 25 items but **zero within the proposed one-hour window**. A valid news-driven entry still needs genuinely fresh relevant news and a supported, cited local-model proposal. The repair does not relax news freshness or force BUY.
- Muse needs a new controller/execution-signed market/news policy selecting Coinbase and the current engine, followed by actual observation sessions. Local registration remains historical consent; its original enrollment manifest is retained.
- Funded Sepolia swaps use the separate on-chain venue/valuation path. Coinbase observations do not supply executable Sepolia quotes or authorize funded trading.
- Broad symbol/watchlist coverage is unverified. ETH was observed successfully; unsupported products and oversized captures fail closed. Future service availability, depth, price accuracy, and independent source authenticity are not guaranteed.

## Reproduce

```sh
# Offline arithmetic over the authentic captured response:
python3 docs/testing/market-prices-20261023/verify-live.py
python3 docs/testing/market-prices-20261023/verify-live.py browser-helper-preflight.json
# Controlled regression and provenance/replay checks, not live provider/model claims:
node --import tsx --test tests/research-coinbase.test.ts tests/ryo-mcp-contract.test.ts tests/research-provenance.test.ts
npm test
npm run typecheck
npm run build
npm run lint
# New live unsigned capture; existing RYO server credential/news allowlist are read locally:
npm run agent:research -- sources --check-symbol ETH --market-source coinbase-exchange --output <new-price-preflight.json>
```

In external Chrome, open Muse Sepolia → Research & practice → Operator setup. Select Coinbase public USD spot book, enter ETH and run **Check market, RYO & news sources**. Compare displayed values and exact identity against the raw probe. A source response is not itself a signed session or a trade.

Files `live-eth-preflight.json` (sandbox DNS failure) and `live-eth-network-preflight.json` (earlier level-one check) document preliminary checks only. The current level-two implementation is verified by `live-eth-depth-preflight.json` and `browser-helper-preflight.json`; no earlier capture is rewritten to match it.

Official response semantics: [Coinbase product book](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-book), including aggregated sizes, provider timestamp and auction mode. RYO-only mapping remains unverified as documented in the preceding coverage reports.
