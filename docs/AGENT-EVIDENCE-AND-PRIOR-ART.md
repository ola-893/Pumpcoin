# Agent evidence and prior art

Reviewed 13 October 2026. Live trading is paused; no new trading grant or public-chain trade was submitted for this work.

## What is and is not a defensible contribution

Manager-controlled vaults, scoped permissions, identity registries, signed receipts and validation hooks have prior art. PumpCoin must not claim it invented these components or that their combination alone establishes a moat.

| Primary source | Existing capability | Implication for PumpCoin |
| --- | --- | --- |
| [Enzyme holdings/integrations](https://docs.enzyme.finance/enzyme-blue-protocol/topics/fund-holdings), [Onyx FAQ](https://docs.enzyme.finance/onyx-faq) | Managed vault holdings, integrations, share accounting and delegated management | Custody and manager separation are established patterns. Enzyme is not uniformly an ERC-4626 implementation; avoid that blanket description. |
| [dHEDGE contract deployments](https://docs.dhedge.org/developers/contract-details/deployments/arbitrum-one) | PoolManagerLogic, asset guards and contract guards | Manager restrictions and guarded external interactions are established. |
| [Zodiac Roles SDK](https://docs.roles.gnosisguild.org/sdk/api), [ERC-7715](https://eips.ethereum.org/EIPS/eip-7715) | Scoped targets/parameters and wallet permission requests | Expiring, scoped agent authority alone is not new. |
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | Identity, reputation and independent validation hooks | Registration identifies a declaration; it cannot prove advertised capabilities or model execution. |
| [ERC-8126](https://eips.ethereum.org/EIPS/eip-8126), [ERC-8273](https://eips.ethereum.org/EIPS/eip-8273) | Agent verification and transaction-scoped attestation authorization designs | Verification and evidence gating also have prior art. Standards describe interfaces, not an audit of PumpCoin. |
| [The Desk](https://github.com/Leonwenhao/the-desk) | Project describes hash-chained trading receipts, policy/quote gates and optional anchoring | A trading receipt chain alone is not a unique primitive. This is the project's own description, not independently verified deployment evidence. |
| [Tradallo reputation](https://github.com/tradallo/reputation) | Project describes signed trading records, version history and universal trade receipts | Configuration/version-aware records and receipt publication also have overlap. Claims are project-reported. |
| [Strike](https://github.com/Prashant-thakur77/Strike) | Project describes agent-managed options vaults, on-chain mandates and ERC-8004 | The agent + vault + identity combination has close contemporaneous overlap. Implementation/deployment claims require a separate audit. |

This is a targeted survey, not an exhaustive patent, novelty or competitive review. It establishes overlap; it does not establish that no one has implemented PumpCoin's exact design.

The narrower product proposition is **inspectable, configuration-scoped investment evidence for self-hosted agent vaults**: connect a signed declaration, measured artifacts, a canonical chain snapshot, an inference request/output, the deterministic guard, a bounded trade and the corresponding accounting period. The defensibility must come from reliable verification, independently reproduced evidence and operating history. Those are outcomes to demonstrate, not exclusivity claims.

## Current identity evidence

The historical Anvil vault in `/evidence/archive` used an ERC-721 mock. Current Monad registrations use `0x8004A818BFB912233c491871b3d84c89A494BD9e`, which the [ERC-8004 contract maintainers list for Monad testnet](https://github.com/erc-8004/erc-8004-contracts#monad-testnet).

The saved `docs/testing/agent-evidence-20261013/` reports verify each registration's historical controller/execution signatures, current owner and exact published manifest, vault identity ID, controller/manager, strategy/risk commitments and mandate caps at a canonical block. Runtime and proxy implementation pins are checked. This works while a vault is paused and does not equate ownership with trading authority.

The registry and configured RPC remain trust boundaries. Identity verification does not prove model execution, strategy quality or investment readiness.

## Public weights publication check

`agent-registration/model-publication.ts` accepts only an HTTPS Hugging Face URL with a fixed 40-hex commit and one filename. It fetches public file metadata with no credentials, rejects redirects and oversized responses, and requires the exact revision, filename, LFS SHA-256 and measured byte count. The CLI first measures the local model and verifies it against the signed declaration.

This upgrades the source comparison from a local download note to a publisher-metadata match. It still trusts the publisher/Hugging Face metadata and the local measurement. It does not establish upstream training provenance, the semantic truth of the model label, the integrity of the host, or the original execution of an inference. See [Hugging Face file metadata documentation](https://huggingface.co/docs/huggingface_hub/en/package_reference/hf_api).

## Expanded admission checks

New registrations use `PUMPCOIN-LOCAL-WORKER-CHECK-v2`:

1. Local inference with stale/unvalued zero-balance inputs.
2. Local inference with fresh valuation and synthetic cash equal to the signed trade cap.
3. Local inference with fresh valuation and a synthetic position equal to that cap.
4. Eight separately labeled injected guard challenges: permitted BUY and SELL, stale data, unavailable valuation, oversized input, exposure overflow, no cash and no position.

Model output is never forced to BUY/SELL. HOLD is valid on fresh inputs. The injected cases establish that valid actions can pass and unsafe ones are rejected; they are not model decisions or live market performance. Artifacts are measured before/after the suite. Existing v1 registration receipts remain historical; supplemental checks do not rewrite them or reset identities.

## Decision receipts and verification

Every new worker decision after a successful snapshot is stored as an immutable, execution-key-signed `PUMPCOIN-DECISION-v1` receipt. It includes the registration/manifest, model/runtime/strategy digests, chain/vault/configuration, anchored balances/price/permission/turnover, exact request/messages/schema/sampling, raw response content, parsed output, guard/trade-builder versions, guarded output and constructed calldata. Sequence and previous receipt hash expose edits, gaps and reordering within the supplied checkpoint.

The receipt and journal checkpoint are fsynced before transaction signing/broadcast. Receipt-storage failure stops the worker. Pending transactions are reconciled with their exact decision commitment; restart never substitutes a new nonce for ambiguous submissions. Injected test proposers receive an explicit test evidence label.

For a non-HOLD decision, a `PCD1` marker and its 32-byte commitment are appended to the static `managerTrade` calldata. This is part of the same signed/mined transaction. The local EVM regression verifies the existing deployed-vault ABI accepts it; no vault redeployment or separate anchor transaction is needed. **The contract does not interpret this marker or verify inference**. A compromised execution host can omit or fabricate evidence within its on-chain mandate. The independent verifier detects a linked trade whose calldata does not match the supplied receipt. This is tamper evidence, not cryptographic execution proof.

HOLD receipts have no chain anchor by default. An operator can withhold an entire suffix or fork the locally signed history. An exported checkpoint does not prove completeness, publication time, or that all manager transactions have receipts. Independently retain checkpoints and compare all canonical manager-trade events before making a completeness claim.

Offline verification checks registration/decision signatures, receipt chain, exact request and raw parsing, deterministic guards and calldata reconstruction. With an explicitly supplied RPC it also re-reads historical production checks, registry metadata, balances and prices, rejects canonical-block mismatch, and checks the signed trade's sender, destination, zero value and calldata commitment. Reverted trades can be anchored; an anchor does not imply success or profitability.

The worker's model currently receives balances and freshness/valuation flags, not a price history or a proven executable strategy module. A strategy digest remains a declaration; arbitrary strategy code is not executed merely because its hash is present. Exact inference replay is optional and can diverge across hardware/runtime builds. None of these checks replaces TEE/zkML or an independently trusted execution witness.

## Commands

Run from the repository root with Node 22.13+:

```sh
npm run agent:evidence -- identity <registration-id> /tmp/new-identity.json
npm run agent:evidence -- publication <registration-id> /tmp/new-publication.json
npm run agent:evidence -- worker-check <registration-id> /tmp/new-paper-check.json
npm run agent:evidence -- export <reviewed-worker-config.json> /tmp/new-decision-bundle.json
npm run agent:evidence -- verify /tmp/new-decision-bundle.json
npm run agent:evidence -- verify /tmp/new-decision-bundle.json https://testnet-rpc.monad.xyz
npm run agent:evidence -- replay /tmp/new-decision-bundle.json http://127.0.0.1:8080 <decision-hash>
```

These commands do not submit transactions. Output files are created exclusively to avoid overwriting evidence. Export excludes RPC endpoints, private inference URLs, keystore/unlock material and signed raw transactions. Prompt fields contain the public signed strategy description; private research is not added to this interface.

## Remaining proof gap

The headline must stay at **inspectable signed evidence**, not “verified model execution.” Closing the remaining gap requires an independent TEE/zkML/witness verifier bound to the same input, model, runtime and output commitments, plus published checkpoints and complete canonical trade/accounting coverage. A self-signed receipt, publisher file match or successful local replay cannot supply that trust root.
