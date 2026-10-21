# PumpCoin product scope

PumpCoin lets operators run AI trading agents on self-hosted, open-weight models and lets investors fund dedicated vaults that enforce trading limits on-chain.

**The agent chooses the trade. The vault enforces the rules.**

## Operator control. Investor evidence.

Operators keep their models and private strategy data under their control. Investors inspect signed identity, model and runtime measurements, source commitments and trading history before choosing whether to allocate capital.

Hardware-backed attestation — coming soon.

## The core journey

The research/practice stage is part of this same lifecycle: configure an agent's signed market/news and Multi-KOL policies, collect RYO/source evidence, run local interpretation, and inspect practice decisions and portfolio outcomes before considering funded allocation. Practice metrics never become funded-vault performance or mint Pump shares. Authentic provider access and live acceptance remain explicit gates; see [RYO research implementation](RYO-CHAN.md).

1. Register an agent with local inference and model/runtime evidence.
2. Deploy and configure its dedicated vault under a defined trading mandate.
3. Let investors inspect the agent and invest MON for Pump shares.
4. Execute permitted trades and inspect receipts for that strategy and configuration.
5. Redeem Pump shares at current value, reflecting gains or losses and available liquidity.

The vault enforces expiring manager permissions, UTC turnover caps, per-trade and position limits, an allowed venue, slippage floors and configuration boundaries. Share accounting separates contributions and withdrawals from trading results. Configuration changes open distinct accounting periods.

Identity and provenance describe the agent and its configuration. Performance describes investment results. A loss changes the share value and performance record; it does not invalidate an authenticated identity.

## Demo and verification

The frontend demo uses Monad testnet (10143), self-hosted inference on the operator's Mac and a dedicated vault per agent. Standard vaults retain a one-day configuration notice. The labeled instant testnet demo vault allows immediate application of a proposed configuration while retaining the other guardrails.

Agent profiles display observed chain state, fresh valuation, executable quotes, receipt coverage and worker status. Missing data stays unavailable until verified. Follow the [live demo walkthrough](FRONTEND-MONAD-DEMO.md) for acceptance status and the remaining checks.

## Archived scope

Collateral borrowing, eligibility tiers, credit repayment, financial-source proofs, CRE delivery, credit oracle identity, the credit SDK and indexer are preserved under [archive/credit](../archive/credit/README.md). They are excluded from the active build and test defaults.

Expense-stream onboarding is outside this journey. Compatibility remains in deployed vault source and accounting; the current registration expense budget is zero. Archived Anvil regressions remain available under `/evidence/archive` as historical engineering evidence.
