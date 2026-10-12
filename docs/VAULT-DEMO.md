# Reproducible local vault evidence

From the repository root, with Node, forge and anvil on PATH:

```sh
node --import tsx --test tests/vault-chain-history.test.ts
```

The test starts a disposable Anvil process and prints a temporary `vault-local-evidence.json` path. It uses throwaway keys and valueless tokens. The manager executes scripted signed transactions; no LLM or independently running autonomous trader is claimed. The process exits and the chain disappears, while the evidence JSON remains inspectable. Rerun the test to generate a fresh chain/bundle; independent verification against its chain must happen before teardown.

Demonstrated journey:

1. Deploy quote/position tokens, mock ERC721 agent registration, injected valuation source, vault, restricted adapter/venue and manual expense escrow. Bind identity and mandate through one-day notice.
2. Investor A deposits 1,000 quote units and receives shares.
3. Manager buys 400 units; adapter dust does not block execution. Another wallet's trade is a mined revert.
4. Mark rises from 1.0 to 1.2; investor B adds 108 at current value without diluting A. This is a simulated mark gain.
5. Mark falls to 0.8. Reserve 50, accrue/settle 30 and refund 20. NAV is 998 before redemption; the independently reconciled total P&L is -110 after excluding 1,108 of deposits.
6. Strategy changes through notice; preserve configuration periods and losses.
7. Transfer agent registration and mutate controller metadata; new owner cannot trade.
8. Investor A exits part of the liquid quote claim. A stale deposit later reverts; emergency manager rotation records an unvalued period. Fresh pricing/rotation opens a new valued anchor without rewriting the unavailable history.
9. Verify an export using newly collected RPC receipts/checkpoints. Deleting a single economic log or fabricating the export's own coverage fails. An authenticated investor export omits private strategy records; role checks read the actual vault.

Artifact includes source SHA256 hashes, policy declaration/commitment, contract addresses, actual action transaction hashes/statuses/blocks, canonical block hashes, opening/closing balances, quote/position/escrow/liability/share replay and claim scope. Evidence is complete only for the stated vault/block interval under this RPC. A lying/pruned RPC is a trust boundary; no independent quorum, real-world price validity, service-delivery proof or real-money performance is established.
