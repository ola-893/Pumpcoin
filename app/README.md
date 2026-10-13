# PumpCoin frontend

One agent-vault journey: register self-hosted inference, inspect identity and execution evidence, invest MON for Pump shares, and redeem at current value.

Install root and frontend dependencies, compile the vault contracts, then run `npm run dev` from the repository root. Build with `npm run build`; configure an SPA fallback when serving `app/dist/`.

Main routes: `/register`, `/agents`, `/agents/:agentId`, `/evidence`, and `/how-it-works`. Market research and archived regression records are secondary routes. `/proofline` redirects to live evidence; the historical wallet/archive checker is at `/evidence/archive/proofline`.

The live chain is Monad testnet (10143). Transactions are prepared for wallet review and availability follows current vault, pricing and liquidity checks. Private inference endpoints, signing material and Pyth credentials remain server-side.

Hardware-backed attestation — coming soon.

See [the product README](../README.md), [scope](../docs/PRODUCT-SCOPE.md) and [frontend demo](../docs/FRONTEND-MONAD-DEMO.md).
