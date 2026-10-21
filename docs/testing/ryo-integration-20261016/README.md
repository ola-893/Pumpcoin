# Integrated RYO research verification — 2026-10-16

## Verified locally

- `npm test`: **163 passed, 0 failed, 0 skipped**. The suite includes research policies/signatures, both strategy guards, copied/reposted evidence deduplication, delayed practice execution, accounting, persistence, writer/runtime leases, checkpoint replay/tampering/fork detection, missing-source behavior, and local/hosted API protection. Inputs in these tests belong to test fixtures; they are not agent performance records.
- `npm run typecheck`: passed.
- `npm --prefix app run build`: passed. Vite reports an existing main-chunk size warning (approximately 533 kB); Node reports experimental SQLite support.
- `npm run lint`: passed with existing application warnings.
- External Chrome: opened Gemma's registered Pump profile, confirmed research/practice is the default view, inspected the operator policy form and missing-source/setup states. No chain-state wait blocked this view. No policy was signed or live practice observation executed during this browser check.
- The unconfigured source adapter makes no external requests, invents no market records and prevents model invocation. A test-owned signed session produces a verifiable **blocked** receipt rather than a fictional trade.
- Read-only hosted API behavior and rejection paths were exercised through a local HTTP server. This is not a cloud deployment or Blob publication test.

## Still unverified

The operator does not have RYO builder credentials or authorized X access. The official authenticated endpoint, tool argument/response mapping and live/safety semantics must be confirmed from actual provider responses. There has been no authentic RYO research cycle, genuine local-model market interpretation, practice position lifecycle with real observations, or meaningful comparison of the two strategies.

Checkpoint upload/read against hosted Blob storage has not been executed. No public checkpoint was published, no provider subscription was purchased, and no funded-vault transaction was sent for this implementation.

See [operator setup and remaining acceptance gates](../../RYO-CHAN.md).
