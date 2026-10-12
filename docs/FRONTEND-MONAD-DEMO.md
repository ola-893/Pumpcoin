# Live frontend demo · Monad testnet

All presentation actions take place in the browser. Vault setup and investor/controller transactions are prepared by the frontend and signed through its connected wallet. The agent signs trades in the backend under an expiring on-chain permission. No terminal demo or scripted trade sequence is part of this walkthrough.

## Current presentation scope

The requested demo has three browser journeys: register an agent with local inference; inspect its identity, provenance and complete trading record before investing MON for Pump shares; return and redeem those shares for MON at their current value after profits or losses. Losses affect investment performance, not the authenticity of identity or provenance. An agent with no funded history must show that history as unavailable.

On 12 October 2026, Klaris completed the local enrollment journey in external Chrome with MetaMask on Monad testnet: the running Qwen3.8-27B was locally detected, real inference answered the admission check, the controller signed the exact non-spending enrollment message, and the dedicated backend execution key signed its own enrollment. The frontend saved both authorizations. This establishes local registration only; no new public identity/vault transaction or autonomous trade was submitted in that run.

The current deployment still uses a six-decimal test-USDC quote asset. The existing ERC-20 gateway cannot accept or pay native MON. The MON entry/exit route and its valuation and liquidity checks must be implemented and verified before deploying the vault used for the presentation. Do not present the test-USDC walkthrough below as the requested MON investment/redemption journey.

## Before the presentation

Open the intended agent profile on the running PumpCoin frontend. Check its **Trading & deposits** readiness against chain 10143. A compatible deployed vault, reviewed oracle/venue infrastructure, test-token liquidity and fresh valuation are required. Propose its configuration through the controller setup controls today: the actual mined proposal sets a one-day notice. Applying or trading early must remain blocked.

The encrypted execution signer and reviewed deployment must be configured on the backend serving this frontend. The **Agent trader** section displays setup required until a matching Monad deployment is configured. Frontend controls never accept private keys, file paths, RPC endpoints or runtime pins. The server must stay running throughout unattended trading; a static frontend deployment alone cannot host a signing worker.

The existing Klaris vault predates the autonomy permission interface. It cannot be upgraded in place or presented as an autonomous compatible vault. Its existing record and history remain intact. A new compatible agent/vault needs controller authorization, deployment gas and the same complete configuration notice.

## Browser walkthrough

1. Open **Agents**, select the compatible agent, and inspect its signed controller, execution manager and mandate.
2. In **Trading & deposits**, refresh readiness. Use the controller setup controls to apply a matured configuration and enable the vault. Keep oracle and liquidity gates enforced.
3. Connect an investor wallet, review an exact test-USDC approval, then deposit. Inspect the mined transaction, Pump token balance and current vault NAV. The approval itself is not a deposit.
4. In **Autonomous trading**, review the duration and UTC turnover cap, then approve permission with the controller wallet. Refresh the on-chain permission after mining.
5. Select **Start agent trader**. Show its actual backend status and **Live vault & receipts**. When the model produces a permitted trade, open its Monad transaction link and inspect the manager sender and vault events. A HOLD decision or a blocked market is shown as such; neither is a trade.
6. Review and submit immediate controller revocation. Refresh the permission and demonstrate that future trading is blocked. **Stop agent trader** stops the process but does not revoke permission or cancel already submitted transactions.
7. Connect the investor, review a Pump token exit approval, then redeem within available cash. Verify the mined receipt and updated share balance in the frontend.

Live receipt history shows at most ten transactions emitting vault events in the last 1,000 blocks. It cross-checks RPC logs against mined receipts and canonical block hashes. It does not claim complete performance coverage; reverted calls normally produce no logs. Current NAV is unavailable when valuation fails and is never replaced with a simulated mark. Deposits are capital, not profits.

## Current acceptance boundary

This document is a frontend walkthrough, not proof it has succeeded on Monad. The initial public readiness check is blocked by the older vault runtime, missing/failing configured oracle feeds and insufficient DEX liquidity. Neither an autonomous public trade nor a public deposit/redemption rehearsal is established by local tests. External-browser local enrollment has been exercised separately, as recorded above.

Budgeted manual expense accounting exists in contracts; FlowPay timed streams and a production authenticated private-record/export service are not connected to this frontend. Do not include those as completed live demo capabilities. Archived Anvil evidence remains explicitly separate from this Monad view.
