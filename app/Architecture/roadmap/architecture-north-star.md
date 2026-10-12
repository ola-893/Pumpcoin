# Unora — original north star (historical vision)

Preserved on 3 October 2026 from `ola-893/UNORA` commit `9e16c6ec2043e82648010060db53d0052bd1451c`, before the architecture rewrite. The original document below is retained verbatim. Its formulas, integrations, bounty amounts, Track 01 heading and present-tense claims are historical proposals, not current product facts or a hackathon build list.

**Authority:** [ARCHITECTURE-CHECKLIST.md](../../../docs/ARCHITECTURE-CHECKLIST.md) governs what may be wired into the live hackathon app. [The current architecture](../architecture-design.md) distinguishes code, recorded deployments and future scope. The confirmed submission direction is **Track 04 — Trust, Identity & AI Infrastructure**.

**How to read this vision:** Unora is the umbrella product. ProofLine is its financial eligibility oracle and existing evidence/credit-control foundation; it does not replace the ambition below. Its authentic-proof/public-delivery integration gates remain open. Verified source evidence is structurally different from farmable wallet behavior, but authentic historical facts alone do not establish creditworthiness, unique personhood or future repayment.

Section 3.1's `ScoreRegistry` names the credential-registry role now served by `AttestationRegistry` as an address-indexed mapping. It does not authorize building another registry or SBT. ERC-8004 oracle identity is a separate accountability layer; borrower identity remains a deferred stretch goal with transfer and reputation-sale risks. See [identity boundaries](../../../docs/ORACLE-IDENTITY.md#borrower-identity-stretch-goal).

Preserving the vision does not promote LendingPool tranches, SponsorGraph, StreamManager or ReservePool into the current build scope. They remain P2 design work under the checklist, with risk/economic specifications required before implementation.

---

# Unora — Architecture Design
### Undercollateralized Lending Protocol · Monad Metropolis Hackathon — Track 01 (Onchain Finance & Trading), Hint 3

---

## 0. Product

**Name:** Unora
**Tagline direction:** credit-scored, undercollateralized lending on Monad — trust that's earned, not assumed.

The name and mark carry through the product as the umbrella brand for the pieces already designed in this document: the `ScoreRegistry` soulbound NFT, the `SponsorGraph`, and the `LendingPool`/`StreamManager` are all Unora-branded components of one protocol, not separate products.

---

## 1. System Overview

The product has five functional layers. Each layer maps to a stage in the original pipeline (scan → score → loan → repay → rescoring), with the sponsor/vouching and velocity-cap logic woven into layers 2 and 3 to solve the Sybil/rug-attack gap.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (dApp)                             │
│  Wallet connect → Dashboard → Borrow flow → Lend flow → Sponsor UI   │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  (wagmi/viem + REST/GraphQL)
┌───────────────────────────────▼───────────────────────────────────────┐
│                        BACKEND / OFFCHAIN SERVICES                   │
│  Indexer → Scoring Engine → Oracle Relay → API Layer → Job Scheduler │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  (Chainlink CRE / signed attestations)
┌───────────────────────────────▼───────────────────────────────────────┐
│                       ONCHAIN CONTRACTS (Monad EVM)                  │
│  ScoreRegistry (SBT) → LendingPool → StreamManager → SponsorGraph    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Backend Architecture

### 2.1 Indexer Layer — "Cross-chain scan"
- **Tool:** Envio (HyperIndex) — indexes the borrower's transaction history across supported chains (Monad + a couple of EVM chains for cross-chain liability detection).
- **What it pulls per wallet:** supply/borrow events, liquidation events, repayment timeliness, wallet age, existing open debt positions on other protocols.
- **Output:** a normalized "wallet activity record" written to a Postgres/ClickHouse store, refreshed on a schedule (cron) and on-demand when a borrower initiates a new loan request.
- **Sponsor bounty fit:** Envio ($1,000 "Best Use of Envio").

### 2.2 Scoring Engine — "Credit score" (with the fix applied)
A service (Node/Python) that computes, per wallet:
1. **Raw behavior score** — repayment history, collateral stability, liquidation count, wallet age. (Standard part, same as Cred Protocol/Spectral style scoring.)
2. **Sponsor graph weight** — pulls the wallet's position in the on-chain SponsorGraph (see 3.4) to see if it has an active sponsor and how much of the sponsor's capacity has been delegated.
3. **Velocity cap** — computes the maximum new loan size this wallet is allowed to request this cycle: `max(prior_proven_loan_size * cap_multiplier, sponsor_delegated_capacity)`. This is the actual fix for the "farm small loans, then default big" attack.
4. **Collateral ratio output** — a number between (e.g.) 20%–80% required collateral, derived from the above three inputs. New/unsponsored wallets land near the top of that range; long-tenured or sponsored wallets land near the bottom. Nobody gets 0%.
- **Nansen AI integration:** used to enrich wallet labels (is this address linked to a known entity, exchange, mixer, etc.) as an extra fraud-risk signal feeding into the raw behavior score.
- **Sponsor bounty fit:** Nansen AI ($5,000), Perpl ("Best Analytics / Risk Tool," $5,000/$3,000).
- **Output:** a signed attestation (score, collateral ratio, loan ceiling, timestamp) ready to be relayed onchain.

### 2.3 Oracle Relay — getting the score onchain
- **Tool:** Chainlink CRE (Compute/Runtime Environment) — runs the scoring computation (or at least verifies/relays it) so the result arriving onchain isn't just "trust our backend blindly." This is the credibility layer judges will care about.
- **Flow:** Scoring Engine computes → CRE workflow validates/signs → result written to `ScoreRegistry` contract via a Chainlink-triggered transaction.
- **Sponsor bounty fit:** Chainlink ($3,000, "Best workflow with CRE").

### 2.4 API Layer
- REST/GraphQL API serving the frontend: wallet score lookup, loan offers, sponsor graph queries, active loan/repayment stream status.
- Auth via wallet signature (SIWE-style), no separate login system needed.

### 2.5 Job Scheduler
- Cron jobs: rescoring after each repayment stream tick, sponsor-capacity recalculation after a default, reserve-pool health checks.

---

## 3. Onchain Contract Architecture (Monad)

### 3.1 `ScoreRegistry` (Soulbound NFT)
- One non-transferable NFT per wallet.
- Stores: current score, current collateral-ratio tier, loan ceiling, sponsor address (if any), list of wallets this address has sponsored.
- Updated only by the Chainlink CRE relay (access-controlled).

### 3.2 `LendingPool` (tranche pool)
- Lenders deposit into tranches (e.g., senior/junior) — standard pooled-liquidity pattern, same shape as Aave/Goldfinch.
- On a borrow request: reads `ScoreRegistry` for the wallet's collateral ratio + loan ceiling, requires the borrower to lock that percentage in collateral, then releases the loan.
- Interest rate is tiered by score (worse score → higher rate, feeds the tranche yield).

### 3.3 `StreamManager` (repayment stream)
- Handles the continuous micro-payment repayment (Sablier-style token streaming, or a simplified custom stream contract).
- On each successful stream tick, emits an event the backend picks up to update the score positively.
- If a stream stalls/stops (missed payment), emits a default-flag event immediately — this is what makes early-detection real, rather than waiting for a lump-sum due date.

### 3.4 `SponsorGraph`
- Tracks vouching relationships: sponsor address → delegated capacity → sponsored wallet.
- On sponsored-wallet default: automatically slashes the sponsor's own available capacity (and optionally a staked bond) proportional to the loss. This is the contract-level enforcement of "your friend's trust is now on the line."
- Exposes a `getEffectiveCeiling(wallet)` view function the scoring engine and LendingPool both call.

### 3.5 `ReservePool`
- A cut of each repayment stream flows here as a default buffer.
- Pays out to the tranche pool's senior lenders first in the event of a shortfall, protecting the most risk-averse capital.

---

## 4. Frontend Architecture

### 4.1 Stack
- React + wagmi/viem for wallet connection and contract reads/writes.
- Dynamic or Privy for wallet onboarding/embedded wallets (both are sponsor bounties: Dynamic $5,000, Privy $5,000) — lets non-crypto-native users onboard without needing a seed phrase already in their pocket.

### 4.2 Key Screens
1. **Dashboard** — shows the user's current score, soulbound NFT, current collateral tier, loan ceiling, and sponsor relationships (who they've sponsored / who sponsors them).
2. **Borrow flow** — request a loan → see calculated collateral requirement live (driven by the scoring engine's output) → lock collateral → receive funds → see the live repayment-stream progress bar.
3. **Lend flow** — deposit into a tranche, see projected yield by tranche risk tier, see pool utilization and reserve health.
4. **Sponsor flow** — a distinctive feature screen: a user with proven history can browse/invite a new wallet to sponsor, see exactly how much of their own capacity they're delegating, and see real-time exposure if the sponsored wallet is underperforming.
5. **Transparency/graph view** — a visual (force-directed graph) of the sponsor network, good for a hackathon demo — literally shows judges "here's how Sybil resistance works" without words.

### 4.3 Data flow example — a new user requesting a loan
1. Frontend requests wallet's current score/ceiling from the API (backed by the last CRE-relayed onchain value).
2. If no sponsor and thin history → API returns a low ceiling + high collateral ratio.
3. User either (a) accepts the smaller loan, or (b) taps "find a sponsor" → routes to Sponsor flow.
4. Once sponsored, frontend re-queries `SponsorGraph.getEffectiveCeiling()` → shows updated, larger available loan.
5. Loan executes on `LendingPool`, stream begins on `StreamManager`, dashboard updates live via event subscriptions (Envio-indexed events, polled or via websocket).

---

## 5. Why this architecture directly answers the judges' likely objections
- **"How do you stop Sybil wallets?"** → Velocity cap + sponsor-capacity-slashing, enforced onchain in `SponsorGraph`, not just a backend heuristic.
- **"Isn't this just a scoring API with extra steps?"** → The score is relayed via Chainlink CRE, not blindly trusted from a backend — verifiable computation, not a black box.
- **"What actually happens on default?"** → Concrete: stream stalls → default flag → reserve pool absorbs shortfall → sponsor capacity slashed → score updated. Every step has a contract and an event.
- **"Is this really undercollateralized, or just marketing?"** → Yes, genuinely: collateral ratio is always < 100%, scaled from a wide range (near-full for new wallets) down to a low range (proven/sponsored wallets), never fixed at zero and never fixed at a single number for everyone.

---

## 6. Sponsor SDK / Bounty Map (for reference)
| Layer | Sponsor tool | Bounty |
|---|---|---|
| Indexing | Envio | $1,000 |
| Wallet analytics | Nansen AI | $5,000 |
| Oracle/compute | Chainlink CRE | $3,000 |
| Risk/analytics tool | Perpl | $5,000 / $3,000 |
| Wallet onboarding | Dynamic or Privy | $5,000 each |

This is not exhaustive — worth checking the full sponsor list on the platform once you're inside the hackathon portal, since a couple of others (Alchemy, Zerion) could slot into the indexing/API layer too.
