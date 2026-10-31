# PumpCoin

**Self-hosted AI trading agents. Dedicated investor vaults. Rules enforced on-chain.**

An AI trading agent answers to two people: the operator protecting their edge, and the investor trusting it with capital. PumpCoin gives operators control of their models and private strategy data, while giving investors inspectable identity, execution evidence and an enforced trading mandate.

**The agent chooses the trade. The vault enforces the rules.**

## How it works

**Research and practice first:** each registered agent can enable market/news research using free public RSS feeds and its local model, with signed policies, source-linked decisions, a virtual portfolio and deterministic evidence replay. X/Multi-KOL collection has been removed; no X API purchase is required. These appear in the existing directory and agent profile. Funded execution targets Ethereum Sepolia through Uniswap v4; practice portfolios and real testnet balances remain explicitly separate. [RYO integration, setup and verification boundaries](docs/RYO-CHAN.md).

1. **Register your agent.** Run a self-hosted, open-weight model. Record model and runtime measurements, commit your strategy and trading limits, and authorize the agent's dedicated execution key. Complete registration by deploying its ERC-8004 identity and isolated vault on Ethereum Sepolia.
2. **Inspect before investing.** Review the agent's signed identity, model provenance, configuration and trading receipts. Each strategy and configuration has its own record.
3. **Invest under a mandate.** Deposit test ETH through the vault's conversion gateway and receive that vault's Pump tokens (`PUMP`). The agent submits trades using an expiring permission; the vault enforces turnover, trade-size, exposure and slippage limits.
4. **Follow the outcome and redeem.** Pump tokens represent ownership in one vault. Redeem at current value, subject to available liquidity. Gains and losses change that value; deposits and withdrawals are accounted for separately from performance.

## Key features

- **Operator control:** self-hosted, open-weight models and private strategy data stay under the operator's control.
- **Inspectable identity:** signed registration, model hashes, runtime measurements and source commitments make the deployment inspectable.
- **Isolated vaults:** each agent has its own capital, Pump shares and mandate.
- **On-chain guardrails:** expiring permissions, turnover caps, slippage limits and timelocked configuration changes constrain execution.
- **Configuration-specific records:** a strategy change starts a distinct accounting period instead of inheriting a previous strategy's results.
- **Replayable decision evidence:** signed inference requests/outputs, canonical chain snapshots and deterministic guard/trade replay; future worker trades carry the receipt commitment in their transaction calldata.

Model execution is not hardware-attested. Model/runtime measurements are local observations; the public weights check matches a pinned publisher digest. A signed receipt establishes an attributable assertion, not proof of which model ran. Public testnet identities use the maintainers-listed ERC-8004 registry; the archived Anvil example uses a mock. See [evidence boundaries and prior art](docs/AGENT-EVIDENCE-AND-PRIOR-ART.md).

## Live dashboard

**[pump-ryo.netlify.app](https://pump-ryo.netlify.app)** — signed agent registrations, public chain observations and verified historical RYO practice evidence. Local registration, model execution and transactions run in the operator app. See [hosting and snapshot publication](docs/HOSTING.md).

## How Pump uses RYO-CHAN

RYO-CHAN is the external market-research source for Pump's **research and practice** stage. It connects through the authenticated MCP endpoint at `https://app-ryochan.com/api/mcp`. Pump discovers the server's tools, validates arguments against their advertised schemas, and retains raw responses, request IDs and observation times for provenance checks. The registered local model supplies interpretation; deterministic Pump rules decide whether a practice order is allowed.

The integration lives in the existing agent profile: **Operator setup → Check market, RYO & news sources**, followed by signed research policies, decisions, evidence and separate practice portfolios. The source check is read-only: it does not invoke the model, sign a policy or change balances.

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

- **Market/news:** combines the signed market source (public Coinbase spot books or a reviewed RYO mapping) with allowlisted news feeds. A BUY needs a cited, fresh catalyst, no classified opposing news, and passing market/risk checks.
- **Historical Multi-KOL records:** retained for inspection; new policies and live X collection are disabled. Free RSS news powers the current research flow.
- **Provenance and execution:** the conditional flow is captured evidence → registered local-model interpretation → deterministic guards → signed decision → delayed virtual order/fill → replayable portfolio. Fresh selected-source publications can still be interpreted for a HOLD when market data is unavailable. Missing trading inputs continue to block orders; absent or stale selected-source publications skip inference. Practice results remain separate from funded vault returns and never mint Pump shares.

**2026-10-23 price repair:** practice policies can explicitly select free Coinbase USD spot books, retaining raw responses, provider timestamps and conservative two-sided depth within 10 bps of midpoint. RYO pricing gaps stay visible but no longer block a Coinbase-authorized policy. Provider choice and exact instrument IDs require a new signature; historical authorizations are unchanged. ETH mapping and an independent calculation are verified in the [price evidence package](docs/testing/market-prices-20261023/REPORT.md). No genuine agent trade is claimed; the current RSS capture has no stories within the proposed one-hour window. These are virtual practice inputs, not Sepolia swap quotes.

**RYO acceptance boundary:** MCP authentication/discovery and news ingestion are verified; the source preflight retrieved 25 news items. Token probes returned unavailable market data, so a successful response mapping for instrument identity, price, liquidity and their timestamps remains unverified. X access is no longer required or used. There is no claimed genuine RYO-driven practice trade, completed live research session or profitability result.

The SOL re-probe also failed, and an `eth`-filtered scan returned unavailable data. `whoami` confirmed valid read-only access and remaining quota. Policy v2 replaces the unsupported safety boolean with a signed exact-asset allowlist, observed-liquidity limits and explicit risk coverage. Unavailable risk data stays unknown; reported flags block new entries. No RYO safety certificate is claimed. A new controller authorization is required; prior policies are not rewritten. The HOLD repair passes a controlled signed-replay test; it is not a completed live agent run. [Re-probe evidence, support draft and remaining dependencies](docs/testing/ryo-reprobe-20261021/README.md).

Configure the server-only `PUMPCOIN_RYO_API_KEY` with the **MCP Bearer credential**, `PUMPCOIN_RYO_MCP_URL` with the endpoint above, and `PUMPCOIN_NEWS_FEEDS` with allowlisted feed URLs. `PUMPCOIN_RYO_PROFILE` holds a reviewed response mapping when one is established; X credentials are not read or required. Never put these credentials in `VITE_` variables.

```sh
# Inspect the actual authenticated tool catalog.
npm run agent:research -- sources --discover
# Save an unsigned source probe to a new private file; no trading or model call.
npm run agent:research -- sources --check-symbol ETH --market-source coinbase-exchange --output .local/research/new-source-probe.json
```

See the [integration and setup guide](docs/RYO-CHAN.md), [live MCP verification](docs/testing/ryo-mcp-20261021/README.md), [authentic sanitized contract fixtures](tests/fixtures/ryo-mcp-20261021.json), and [provenance/accounting audit](docs/testing/ryo-audit-20261017/README.md).

## Verified Sepolia execution

A public controller-driven validation completed **21 Sepolia transactions**: vault/identity deployment, project-funded Uniswap v4 liquidity, test-USDC deposit, buy/sell of WETH, ETH investment for Pump shares, redemption back to ETH, capital exit and permission revocation. Final shares and token balances were zero. These are infrastructure tests, not AI performance. [Receipts, deployed addresses and read-only reproduction](docs/SEPOLIA-EXECUTION.md).

## Live frontend demo

New execution uses **Ethereum Sepolia, chain 11155111**, WETH/test-USDC and official Uniswap v4 contracts. Start at `/register` or `/agents`; new registrations target Sepolia. Existing Monad agents remain historical Monad records. Investment controls use the chain and native symbol of the signed registration. See [execution setup, evidence and reproduction](docs/SEPOLIA-EXECUTION.md).

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
