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

## How Pump uses RYO-CHAN

RYO-CHAN is the external market-research source for Pump's **research and practice** stage. It connects through the authenticated MCP endpoint at `https://app-ryochan.com/api/mcp`. Pump discovers the server's tools, validates arguments against their advertised schemas, and retains raw responses, request IDs and observation times for provenance checks. The registered local model supplies interpretation; deterministic Pump rules decide whether a practice order is allowed.

The integration lives in the existing agent profile: **Operator setup → Check RYO & news sources**, followed by signed research policies, decisions, evidence and separate practice portfolios. The source check is read-only: it does not invoke the model, sign a policy or change balances.

### Tool usage and verified status

The authenticated server advertised these six tools during verification on **October 21, 2026**. Discovery or a research probe does not mean a tool is automatically used in trading decisions.

| RYO-CHAN tool | Research purpose | Current use in Pump |
| --- | --- | --- |
| `analyze_token` | Structured research for one token | Called for each selected symbol when no reviewed mapping is configured, including the source-check panel. Actual ETH/BTC error responses are retained as unmapped evidence; they cannot authorize a practice entry. |
| `deep_analysis` | Deeper token research, technicals, catalysts and risks | Probed with ETH to inspect the real contract. It reported unavailable USD market data. Not automatically included in the decision prompt. |
| `market_overview` | Broad market regime and coverage | Verified with a live research probe. Its partial response and missing fields are preserved in the contract fixtures. Not automatically included in the decision prompt. |
| `scan_market` | Ranked candidate research | Probed with a one-candidate limit. The response reported unavailable data and zero candidates; Pump does not invent a shortlist. |
| `compare_tokens` | Side-by-side token research | Discovered and supported by the read-only transport. No live comparison call or automatic strategy use is claimed. |
| `monitor_market_sentiment_shift` | Seven-day market-wide sentiment context | Discovered and supported by the read-only transport. No live call or automatic strategy use is claimed; it does not supply individual KOL posts. |

`check_safety` and `supported_tokens` were **not advertised** by this server/account. Pump refuses unadvertised tools. The verified server negotiates MCP protocol `2024-11-05`, which the adapter supports.

### From research to a practice decision

- **Market/news:** combines mapped RYO market evidence with allowlisted news feeds. A BUY needs a cited, fresh catalyst, no classified opposing news, and passing market/risk checks.
- **Multi-KOL:** combines the same market evidence with authorized X observations from up to 20 selected accounts. Pump checks convergence, groups copied/reposted evidence and blocks entries with opposing selected-source classifications. RYO's market-wide sentiment tool does not replace X access.
- **Provenance and execution:** the conditional flow is captured evidence → registered local-model interpretation → deterministic guards → signed decision → delayed virtual order/fill → replayable portfolio. Missing required source coverage prevents inference and entry. Practice results remain separate from MON vault returns and never mint Pump shares.

**Current acceptance boundary:** MCP authentication/discovery and news ingestion are verified; the source preflight retrieved 25 news items. Token probes returned unavailable market data, so a successful response mapping for instrument identity, price, liquidity, safety and their timestamps remains unverified. Authorized X access is also outstanding. There is no claimed genuine RYO-driven practice trade, completed live strategy comparison or profitability result.

Configure the server-only `PUMPCOIN_RYO_API_KEY` with the **MCP Bearer credential**, `PUMPCOIN_RYO_MCP_URL` with the endpoint above, and `PUMPCOIN_NEWS_FEEDS` with allowlisted feed URLs. `PUMPCOIN_RYO_PROFILE` holds a reviewed response mapping when one is established; `PUMPCOIN_X_BEARER_TOKEN` enables authorized X reads. Never put these credentials in `VITE_` variables.

```sh
# Inspect the actual authenticated tool catalog.
npm run agent:research -- sources --discover
# Save an unsigned source probe to a new private file; no trading or model call.
npm run agent:research -- sources --check-symbol ETH --output .local/research/new-source-probe.json
```

See the [integration and setup guide](docs/RYO-CHAN.md), [live MCP verification](docs/testing/ryo-mcp-20261021/README.md), [authentic sanitized contract fixtures](tests/fixtures/ryo-mcp-20261021.json), and [provenance/accounting audit](docs/testing/ryo-audit-20261017/README.md).

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
| `research/` | RYO MCP/source adapters, signed research policies, local interpretation and evidence replay |
| `practice/` | Virtual orders, fills, positions and portfolio accounting |
| `archive/credit/` | Historical credit system, separate from the active product |

The active product focuses on agent vaults. Historical lending, financial eligibility, CRE workflows, oracle identity, credit SDK and indexer code are preserved in the [legacy archive](archive/credit/README.md) with separate opt-in checks. Existing vault expense-accounting compatibility remains for deployed-contract verification; new registrations use a zero expense budget.

Read [valuation upkeep and circuit breaker](docs/VALUATION-KEEPER.md), [product scope](docs/PRODUCT-SCOPE.md), [registration](docs/AGENT-REGISTRATION.md), [autonomous trading](docs/AUTONOMOUS-TRADING.md), [MON investing](docs/NATIVE-MON-INVESTMENTS.md), and [local model measurement](docs/LOCAL-MODEL-DETECTION.md).

Operator infrastructure deployments and frontend boundaries: [runbook](docs/OPERATOR-DEPLOYMENTS.md).
