# PumpCoin frontend

The frontend focuses on self-hosted AI agents and dedicated investment vaults, with a purple/lilac palette, serif headings and clear investor/operator controls.

| Route | Purpose |
| --- | --- |
| `/` | Operator control, investor evidence and the agent-vault journey |
| `/register` | Local model measurement, strategy/mandate review, signed enrollment and dedicated deployment |
| `/agents` | Search and inspect this server's signed agent registrations |
| `/agents/:agentId` | Identity, provenance, trading history, investment/redemption and operator setup |
| `/evidence` | Live Monad vault receipt inspection |
| `/how-it-works` | Agent identity, mandate enforcement and Pump share ownership |
| `/markets` | Supporting read-only market research |
| `/portfolio` | Operator drafts and links to profile-based position reads |
| `/evidence/archive` | Historical local vault regressions |
| `/evidence/archive/proofline` | Historical archive ownership checker |

The main navigation leads to agents, live evidence and how it works. `/proofline` redirects to live evidence. Archived simulations remain explicitly labeled historical and are loaded only on archive routes.

Wallet connection reads public accounts. Registration signatures and transactions have their own review steps. Investment and redemption prepare exact simulated transactions for the connected wallet on Monad testnet; availability follows current vault, pricing and liquidity checks.

Local model measurement and execution signing run in the loopback backend. Public records include model/runtime digests, source commitments, signed configuration and scoped receipts. Private inference endpoints and signing material stay off the frontend.

Hardware-backed attestation — coming soon.

Historical lending UI, credit contracts, CRE delivery, oracle identity and credit SDK/indexer source are isolated under [archive/credit](../archive/credit/README.md). The vault's existing contract name and accounting domains are retained for deployed-contract verification.

See [product scope](PRODUCT-SCOPE.md), [the browser walkthrough](FRONTEND-MONAD-DEMO.md) and [MON investment](NATIVE-MON-INVESTMENTS.md).
