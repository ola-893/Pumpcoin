# RYO MCP compatibility — 2026-10-21

This implements the verified transport and source-access boundary inside Pump's existing research workflow. It is not a claim that both strategies have completed live practice trading.

## Verified live

- Endpoint `https://app-ryochan.com/api/mcp`; Bearer authentication using the server-only `.env` key. No secret or authentication header is included in the committed fixtures.
- Initialization identifies `ryo-chan`, negotiates protocol `2024-11-05`, and lists six read-only tools. Pump now supports that negotiated version and validates the actual discovered schemas.
- `market_overview` returns a structured partial response, with multiple null/unavailable lanes. `scan_market` returns `status: unavailable`, `data_mode: unknown` and no candidates.
- ETH/BTC `analyze_token` and ETH `deep_analysis` return MCP tool errors, including unavailable current USD market data. These responses are retained; they do not become prices or passing safety checks.
- CoinDesk's published RSS path redirects to its canonical URL without the trailing slash. Pump requests that canonical HTTPS URL directly, retaining its no-redirect policy. The actual preflight parsed 25 items.
- `api-preflight.json` records the local authenticated API boundary, counts and source statuses. The full unsigned captures stay ignored under `.local/research/ryo-contract-20261021/`; article bodies are not republished in this package.

## Implemented in Pump

- Advertised-tool validation: required fields, object/array types, enum/bounds and rejection of unsupported schema constraints; read-only tool allowlist remains enforced.
- Negotiated MCP protocol support and lower configurable request ceilings within the existing 30/minute cap.
- A read-only **Check RYO & news sources** panel within **Operator setup**, plus `agent:research sources --check-symbol <symbol> --output <new-file>`.
- The local probe route requires the existing session token and same-origin protections, exact fields and an existing registration. It does not expose credentials, call the model, sign policy, create a session, change balances or send a transaction. Identical browser probes coalesce/cache for 30 seconds; the browser probe has a 45-second request deadline.
- Missing reviewed mappings capture the actual `analyze_token` exchange as `ryo-observation`. Normalization reproduces its request binding but yields no market records. The coverage verifier rejects any attempt to call that raw-only capture complete tradable market coverage.
- Source responses and provider errors are available for inspection; configured credentials remain distinct from usable source evidence.

External Chrome rendered the updated configured/missing-source badges and the integrated Operator setup controls. The final response walkthrough was interrupted by a user window change; API-to-source verification was completed separately. A wallet-extension initialization error was observed in the normal Chrome profile; a clean Incognito window rendered the profile without that extension. No wallet settings were changed.

Validation: **179 tests passed**, typecheck and production build passed, lint passed with existing warnings. The production build still warns about the main chunk size and Node reports experimental SQLite support.

## Actual provider catalog

`market_overview`, `scan_market`, `analyze_token`, `deep_analysis`, `compare_tokens`, `monitor_market_sentiment_shift`.

Neither `check_safety` nor `supported_tokens` was advertised. The sentiment tool describes market-wide Fear & Greed and BTC derivatives; it does not provide posts from user-selected X creators. Pump therefore retains the existing authorized-X gate instead of claiming Multi-KOL coverage.

## Evidence and regression

`tests/fixtures/ryo-mcp-20261021.json` contains authentic sanitized initialization, catalog and unavailable/partial response bodies. It is not a successful live trading fixture. `tests/ryo-mcp-contract.test.ts` replays that contract through a test transport and a separately labelled synthetic news item. It verifies negotiated headers, six advertised tools, missing-tool/invalid-enum rejection, error retention, caching and false-coverage rejection.

Reproduce local verification:

```sh
node --import tsx --test tests/ryo-mcp-contract.test.ts tests/research-*.test.ts tests/practice-ledger.test.ts
npm test
npm run typecheck
npm --prefix app run build
npm run lint
```

For a fresh live check (uses the configured read-only provider quota; creates a new private output file):

```sh
npm run agent:research -- sources --discover
npm run agent:research -- sources --check-symbol ETH --output .local/research/new-source-probe.json
```

## Remaining acceptance boundary

A complete successful token response is needed before its actual instrument, USD price, liquidity, safety semantics and observation times can be mapped and verified. Guessing response paths or replacing missing safety with `true` would violate Pump's provenance requirements. The adapter still rejects missing or unknown mapped fields; no fabricated mapping was configured.

Authorized X reads and selected numeric account IDs are needed for Multi-KOL. Both strategies then need reviewed signed policies, the registered running local model, genuine observation cycles and delayed practice fills/exits. No provider workaround, market-price fallback, fake profit, signed policy, funded transaction or public deployment was introduced by this task.

Public news reference: [CoinDesk's RSS documentation](https://www.coindesk.com/coindesk-news/2021/09/17/coindesk-rss). Availability of the public feed does not by itself establish redistribution rights for full captured bodies.
