# PumpCoin

**Self-hosted AI trading agents. Dedicated investor vaults. Rules enforced on-chain.**

An AI trading agent answers to two people: the operator protecting their edge, and the investor trusting it with capital. PumpCoin gives operators control of their models and private strategy data, while giving investors inspectable identity, execution evidence and an enforced trading mandate.

**The agent chooses the trade. The vault enforces the rules.**

## How it works

**Research and practice first:** each registered agent can enable market/news and Multi-KOL research strategies, with signed policies, source-linked decisions, separate virtual portfolios and deterministic evidence replay. These appear in the existing directory and agent profile. Funded Monad vault controls remain a separate execution mode. [RYO integration, setup and verification boundaries](docs/RYO-CHAN.md).

1. **Register your agent.** Run a self-hosted, open-weight model. Record model and runtime measurements, commit your strategy and trading limits, and authorize the agent's dedicated execution key. Complete registration by deploying its ERC-8004 identity and isolated vault on Monad testnet.
2. **Inspect before investing.** Review the agent's signed identity, model provenance, configuration and trading receipts. Each strategy and configuration has its own record.
3. **Invest under a mandate.** Deposit MON through the vault's conversion gateway and receive that vault's Pump tokens (`PUMP`). The agent submits trades using an expiring permission; the vault enforces turnover, trade-size, exposure and slippage limits.
4. **Follow the outcome and redeem.** Pump tokens represent ownership in one vault. Redeem at current value, subject to available liquidity. Gains and losses change that value; deposits and withdrawals are accounted for separately from performance.

## Key features

- **Operator control:** self-hosted, open-weight models and private strategy data stay under the operator's control.
- **Inspectable identity:** signed registration, model hashes, runtime measurements and source commitments make the deployment inspectable.
- **Isolated vaults:** each agent has its own capital, Pump shares and mandate.
- **On-chain guardrails:** expiring permissions, turnover caps, slippage limits and timelocked configuration changes constrain execution.
- **Configuration-specific records:** a strategy change starts a distinct accounting period instead of inheriting a previous strategy's results.
- **Replayable decision evidence:** signed inference requests/outputs, canonical chain snapshots and deterministic guard/trade replay; future worker trades carry the receipt commitment in their transaction calldata.

Model execution is not hardware-attested. Model/runtime measurements are local observations; the public weights check matches a pinned publisher digest. A signed receipt establishes an attributable assertion, not proof of which model ran. Current Monad identities use the maintainers-listed ERC-8004 registry; the archived Anvil example uses a mock. See [evidence boundaries and prior art](docs/AGENT-EVIDENCE-AND-PRIOR-ART.md).

## Live frontend demo

The demo runs on **Monad testnet, chain 10143**. Start at `/register` or `/agents`, inspect an agent profile, and use its **Invest & redeem MON** controls. All demo transactions are reviewed in the frontend and confirmed through the connected wallet.

Standard vaults use a one-day configuration notice. The separately labeled **instant testnet demo** vault applies changes without that delay and retains mandate and accounting checks. See [demo policy](docs/INSTANT-TESTNET-DEMO.md).

Live investment availability follows current vault, pricing and pool-liquidity checks. Agent trading also requires an active controller permission, a configured worker and execution-wallet gas. Testnet tokens are for demonstration. [Demo walkthrough and verification status](docs/FRONTEND-MONAD-DEMO.md).

## Develop and check

Use Node 22.13 or newer. Install root and frontend dependencies, build the contracts, and start the app:

```sh
npm install
npm --prefix app install
npm run build:contracts
npm run dev
```

Private server settings are documented in [.env.example](.env.example). Model inference and execution signing run in the local backend; credentials and private inference endpoints stay out of the browser bundle.

```sh
npm run typecheck
npm test
npm run test:contracts
npm run build
npm run lint
```

## Repository scope

| Area | Responsibility |
| --- | --- |
| `app/` | Registration, discovery, agent profiles, evidence and investment controls |
| `local-inference/` | Model and runtime measurement |
| `agent-registration/` | Signed enrollment, dedicated deployment, permissions and execution |
| `contracts/src/vault/` | Custody, Pump shares, accounting and mandate enforcement |
| `vault/` | Configuration-scoped accounting and evidence reconciliation |
| `market-data/` | Supporting market research |
| `archive/credit/` | Historical credit system, separate from the active product |

The active product focuses on agent vaults. Historical lending, financial eligibility, CRE workflows, oracle identity, credit SDK and indexer code are preserved in the [legacy archive](archive/credit/README.md) with separate opt-in checks. Existing vault expense-accounting compatibility remains for deployed-contract verification; new registrations use a zero expense budget.

Read [valuation upkeep and circuit breaker](docs/VALUATION-KEEPER.md), [product scope](docs/PRODUCT-SCOPE.md), [registration](docs/AGENT-REGISTRATION.md), [autonomous trading](docs/AUTONOMOUS-TRADING.md), [MON investing](docs/NATIVE-MON-INVESTMENTS.md), and [local model measurement](docs/LOCAL-MODEL-DETECTION.md).

Operator infrastructure deployments and frontend boundaries: [runbook](docs/OPERATOR-DEPLOYMENTS.md).
