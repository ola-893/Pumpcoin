# Shared agent-state cache — 2026-10-13

The directory and profile now use one TanStack Query client above the router. Query identity includes registration ID, signed commitment, chain, vault and binding anchor. Record object replacement and wallet-focus events do not restart chain reads. Concurrent observers and React StrictMode mounts share a request, and navigation does not abort an expensive read merely to start it again.

| Layer | Behavior |
| --- | --- |
| Signed directory | Five-minute freshness window; memory survives route changes; explicit refresh rechecks registrations. Session tokens are acquired separately and are not cached with records. |
| Public agent state | One-minute query freshness, 30-minute memory retention, two-minute visible-page polling. A pending backend refresh uses inexpensive ten-second status polling until the source snapshot updates. |
| Browser reload | Public snapshots are saved in sessionStorage, scoped and schema-validated on restoration, limited to 15 minutes. Restored data is marked historical/provisional until the server responds. No private signer data, session tokens, transaction plans or wallet balances are persisted here. |
| Backend display | Verified snapshots remain available for up to 15 minutes. After one minute, reads return the previous snapshot immediately while one coalesced refresh runs. Source block/hash/observation time remain unchanged. Failed refreshes are surfaced, with bounded retry backoff. A changed registration binding has a separate cache key. |
| Wallet balances | Read-only memory query keyed by registration, vault, account and connected chain. No balance request before a matching wallet is connected; no cross-account placeholder data. |
| Mutations | Confirmed investment/trading receipts and runtime controls invalidate read-only displays. Transaction plans, simulations, signing and receipt verification remain uncached and use their existing live checks. |
| RPC scheduling | Independent requests can use at most two batches concurrently. The existing five-call batch cap, weighted 250 ms per-call start pacing, explicit block anchors, read-only method allowlist and gas policy remain intact. The scheduler queues request starts rather than waiting for each response body before starting the next request. |

Failure handling preserves historical snapshot data with stale/error labels rather than inventing current values. Live investment readiness is still checked during exact transaction preparation; display caches cannot grant permission or authorize a transfer.

`benchmark.json` records read-only calls to the running localhost API. All six warm/stale cache reads returned in **19–23 ms** while refresh work ran in the background. This measures cached response latency, not cold public-RPC verification time. Chrome checks confirmed directory → profile → directory navigation and a full browser reload rendered the existing snapshot immediately instead of a multi-minute chain-loading screen.

Regression coverage includes shared queries, in-flight deduplication, retention during refresh, scoped/expired/malformed persisted state, background-refresh failure, canonical receipt checks, bounded RPC concurrency, origin/session protection and the existing local native-investment/trading tests. No public-chain transaction, oracle upkeep request or trader start was performed.
