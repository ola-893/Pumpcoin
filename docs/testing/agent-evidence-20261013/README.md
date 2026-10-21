# Agent evidence verification — 13 October 2026

Live traders remained stopped, with no trading grants recorded. These checks submitted no public-chain transactions.

| Check | Result |
| --- | --- |
| Azula public identity | Agent 2224, maintainers-listed Monad registry, owner/manifest/vault binding and runtime pins matched at block 70680544. |
| Klaris public identity | Agent 2222, same registry, owner/manifest/vault binding and runtime pins matched at the block recorded in `klaris-identity.json`. |
| Azula measured weights publication | SHA-256 and 14,252,845,984-byte size matched the public file metadata at the pinned Unsloth commit. |
| Actual local Qwen admission check | Three synthetic inferences all chose HOLD, including fresh cash and fresh position. |
| Injected guard challenges | Valid BUY and SELL passed; stale, unvalued, oversized, overexposed, cashless and positionless cases returned HOLD. |
| Full active test suite | 123 passed, zero failed. |
| Final affected regression | 26 passed, zero failed after final cleanup. |
| Root/frontend TypeScript | Passed. |
| Frontend production build | Passed. |
| Whitespace check | Passed. |
| Strict frontend lint | Eleven existing warnings in other UI flows, zero lint errors; `--deny-warnings` exits nonzero. |

The local EVM regression mined BUY and SELL fixture trades carrying a `PCD1` decision commitment in the same calldata; reconstructed historical snapshots, registration metadata, signatures and transaction links; recovered an ambiguous broadcast without another nonce; and rejected changed links, state, receipt order and missing receipts. Fixture trades and injected proposals are labeled tests. They are not live agent activity or investment performance.

The public reports are point-in-time observations. They do not establish host integrity, upstream training provenance, original model execution, complete trading coverage or profitability. The fresh scenarios give the model no price history; HOLD is a valid observed choice. Historical signed registration receipts were preserved.

See [design, prior art, commands and trust boundaries](../../AGENT-EVIDENCE-AND-PRIOR-ART.md).
