# Live frontend demo · Monad testnet

PumpCoin's demo has three journeys, all in the frontend using contracts on **Monad testnet (10143)**.

## 1. Register a self-hosted agent

Open `/register` in the external browser with your Monad wallet. Detect the locally running model and inspect its weights, runtime and source commitments. Prepare its dedicated execution wallet, declare the public strategy and mandate, and complete controller enrollment.

Review and confirm the dedicated identity/vault deployment. The frontend verifies the mined transaction and displays the agent's ERC-8004 identity and vault addresses. Keep private prompts, strategy files and keys on the operator's machine.

Standard vaults use a one-day configuration notice. For an immediate testnet rehearsal, choose the clearly labeled **Instant Monad testnet demo** option. It deploys the separate zero-notice demo contract; mandate, valuation and accounting checks still apply. Klaris and Azula are separate agents and vaults.

Hardware-backed attestation — coming soon.

## 2. Inspect and invest

Open the agent's profile. Review its signed controller and execution key, model provenance, strategy, mandate and configuration. Use **Trading history** and **Live vault & receipts** to inspect recorded activity and transaction links.

Investment availability follows the current on-chain vault configuration, pause state, healthy prices and executable liquidity. The controller completes trading infrastructure, pool funding and MON gateway setup through **Operator setup**, applies the configuration and enables the vault.

Connect the investor wallet, choose **Invest MON**, enter the amount and review the simulated Pump output and fees. Confirm in the wallet, verify the mined receipt and inspect the updated Pump balance. An initial test-USDC bootstrap may be needed to meet the vault's minimum first-deposit requirement before a small MON investment.

Each Pump token represents ownership in this agent's vault. Capital contributions are accounted for separately from trading gains and losses. A profile with no verified funded performance displays unavailable returns and an unrated performance record.

## 3. Follow results and redeem

The controller grants a bounded, expiring trading permission. The backend worker needs a matching reviewed configuration and funded execution wallet. Start it through the frontend and inspect its real status. A permitted model decision can produce an agent-signed trade; a HOLD or blocked decision is displayed as such.

Return as the investor, choose **Redeem Pump for MON**, enter a share amount and review any required bounded Pump approval. Verify that approval, then review and confirm the redemption itself. Check the mined receipt, remaining shares and MON received. Exit value reflects current vault assets, losses or gains, conversion costs and available liquidity.

Controller revocation disables future trading authority. Stopping the worker ends its process; use the on-chain revocation control to revoke its permission.

## Observed acceptance status

The latest saved rehearsal established Azula's signed local enrollment, dedicated identity/vault deployment, trading infrastructure, funded demo pool, applied configuration and enabled vault. A 1 test-USDC bootstrap minted 1 Pump. A subsequent 0.1 MON investment minted 0.002489 Pump. These are capital contributions, not trading profit.

End-to-end MON redemption and an autonomous funded trade still need verified frontend receipts. Current readiness must be refreshed before a presentation: both price observations have a five-minute freshness policy and the narrow demo pool has limited capacity. Continuous operation requires an oracle keeper and a running configured worker.

The live receipt view covers up to ten vault-event transactions in the latest 1,000 blocks; it labels that coverage. Standard configuration changes retain their notice. Historical Anvil accounting tests are available separately under `/evidence/archive`.
