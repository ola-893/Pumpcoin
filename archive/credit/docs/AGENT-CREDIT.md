# Agent-operated, human-backed credit

Implementation and verification: 3 October 2026, working tree based on `bc14033`. Canonical checkout: `/Users/deonorla/Documents/Github/Monad/UNORA`. Submission direction: Track 04. This is the current demo direction; [ARCHITECTURE-CHECKLIST.md](ARCHITECTURE-CHECKLIST.md) still governs **all original P0 eligibility requirements**.

## Verified on a disposable local chain

A **separate background process**, given only its own throwaway signing key, observed its pUSD cash balance below 10, drew 20 pUSD under the human's mandate, waited the configured interval, approved repayment and repaid 20. The harness independently read transaction senders/recipients, successful/reverted receipts, token balances and human debt. No human transaction occurred between the draw and repayment. The human's 100 pCOL collateral stayed deposited and final debt was zero.

The independent agent was `0x9d0E45c741240922234ae7bf2050b0df870224f0`; its human backer was `0xc60E69Bb12Bb12fAbb3B7b9972ffC8096B3D9cbB`.

| Agent-signed transaction | Local transaction hash | Receipt |
| --- | --- | --- |
| 20 pUSD draw | `0x973b4e4e502b7d6a5caddffa2a2c025ace021590c1d86381ac0cf1ddccc0167d` | success |
| 20 pUSD repayment | `0x555d649ee872b39c8ddad8431b77273d3961f52b19ce3e4bd98a14f1319d022e` | success |
| Additional draw after cap spent | `0xd5c046b7f4674a6ff2580b86c9992de1fd14f7fb7e9b1f1655d166935bda1bdb` | reverted |
| Draw after human revoked a renewed, unused cap | `0x2f3511c993cf8fc6fe45ce6cae0d1348d4584676aa986ebc19f513cb84df71b4` | reverted |

These are **local Anvil chain 31337** transactions, not Monad testnet explorer links. Evidence in this run was explicitly synthetic and delivered through a local test-only approved receiver. No authentic Reclaim proof, CRE CLI execution or Mera onboarding occurred in this run. The chain is stopped after the demonstration. Public receipts/readbacks and worker output are in [agent-credit-local.json](../deployments/agent-credit-local.json); private keys and proof bodies are absent.

Checks: **70 Solidity tests**, including 18 mandate tests, 512-case fuzz tests and 8,192 invariant calls; **30 Node tests**; **5 mocked CRE capability tests**. Root/CRE/app TypeScript checks, app lint and production build passed. Lint retains two pre-existing context fast-refresh warnings; the build reports large SDK chunks. This is testing evidence, not an audit. The app uses its Bun lockfile; its previously stale npm lockfile was synchronized using legacy peer resolution for the existing Privy/viem peer conflict. npm reported 25 dependency advisories (24 moderate, one high); no forced dependency downgrade was made.

## Implemented; complete external acceptance remains unverified

- `AgentCreditMandate` is a new sibling of the unchanged `RepaymentVault`. A human grants/revokes for an independent key only with that key's offchain enrollment signature bound to human/contract/chain/nonce/expiry; each grant consumes one nonce so renewals need fresh agent consent. Gross draws consume a cumulative cap until the same human explicitly grants a new mandate; expiry/revocation stop draws. Another human cannot overwrite, revoke or acquire that key's mandate. Loan proceeds reach the agent, while all debt and collateral stay with its human.
- Additive `CreditLine.borrowFor` checks the same human eligibility/collateral/liquidity limits as `borrow`. Only its **one-time root-pinned mandate** can call it. Original `borrow`, `repay`, `maxBorrow` behavior remains. Deployment code checks mandate/line/token wiring and creates seven fresh contracts. Existing deployed bytecode is unchanged.
- The agent worker independently polls cash, mandate and human headroom; draws a fixed amount below threshold; repays outstanding draws after its interval when it has cash. It reconstructs its principal from ordered confirmed events after restart using FIFO allocation across human-direct, multi-agent and external-repayment lots (mandate actions match exact ordered line/companion/agent groups with pinned caller/payer provenance; incomplete groups or debt mismatches block all automatic financial writes until a complete replay; renewal never clears history; migration moves the queue and flags the retired holder), waits when funds/headroom are absent and never draws to refinance itself. Transaction logs distinguish submission, success and revert and include the actual signer/hash.
- `/agent-credit` uses Mera's PRF passkey/signing-session API directly, without a Privy gate or seed-phrase prompt. Only public credential metadata persists. PRF/seed buffers are wiped after derivation; unlocked signing keys remain in page memory until lock/unmount. A PRF-capable authenticator, HTTPS/localhost, test gas and a real device acceptance run are still required. Recovery at a different origin is not promised.
- The frontend validates a fresh Monad evidence-mode manifest and onchain controller/mandate/token pointers before writes. It signs a wallet/session/domain/destination/lifetime-bound evidence challenge, opens a real SDK request URL and submits returned proof JSON. Only receipt ID and public proof digest are persisted, scoped by human and registry; matching confirmed registry state establishes delivery. Raw proof JSON is discarded after acceptance. Same-origin `/evidence` proxies the loopback verifier in development; production needs a TLS reverse proxy and the service-operation protections already listed in P1.
- Human setup includes confirmed collateral approval/deposit, agent-signed enrollment (`agent-credit/sign-enrollment.ts <mandate> <human> [<nonce>] <expiry>`, nonce omitted = read onchain) plus one-transaction mandate grant/revoke and both-wallet migration transactions. Agent draws/repayments have no frontend action button. Agent event links are derived from real logs on the configured testnet deployment. Without the fresh manifest, financial/proof controls are disabled. Worker `fromBlock` must cover the mandate deployment plus every human/agent/migration event for FIFO reconciliation.

### Deliberate corrections to the example sketch

Unrestricted `borrowFor` would let any caller impose debt on a human without consent, so it is restricted to the pinned mandate. Decreasing `drawnWei` on repayment would create a revolving cap, contrary to the requested **cumulative** cap, so repayment never decreases it. Repayment using the agent's own tokens remains allowed after revoke/expiry; it grants no new borrowing authority. Exact-transfer checks and reentrancy protection make failed/token-fee transfers roll back debt and counters.

The root's one-time pin remains a trusted deployment decision: matching pointers do not prove that arbitrary contract bytecode enforces consent. Deploy/review the included mandate and validate its code and wiring. Revocation cannot recover already borrowed tokens, erase debt or restrict transfers from the agent's EOA. This implementation bounds **credit draws**, not downstream spending at the agent key; the operating rule uses working-capital float only. There is no leverage, margin, pricing or liquidation engine.

After wallet migration the old mandate cannot borrow with the retired human's eligibility. Old agent/vault grants, approvals and wallet tokens are **not migrated**. Settle outstanding agent funds, revoke old grants and grant a fresh agent key from the new human wallet. Both wallets must be accessible; this is not lost-key recovery.

## Remaining gates — not demonstrated / not started externally

1. Review/select a compatible real Reclaim provider with complete authenticated 90-day payout extraction and pin its version/content hashes. Configure rotated app secrets, stable source namespace and verifier token in ignored server configuration. No compatible provider configuration or authentic proof was supplied in this workspace.
2. **CRE authentication and fixture execution complete, 8 October 2026.** CLI v1.37.0 successfully ran the workflow locally with synthetic evidence and writes disabled. See [CRE review](CRE-REVIEW-2026-10-08.md). Genuine proof and CRE-originated public delivery remain separate gates.
3. Supply an authorized funded testnet signer and fresh receiver/registry/line/mandate deployment. Run genuine proof → CRE → Monad delivery and preserve hashes/readbacks. Public mandate deployment, source-reuse/replay/expiry/migration acceptance and unattended **public-chain** agent transactions remain unstarted here.
4. Complete actual human Mera device onboarding/recovery/signing and browser rejection/reload/expiry/failure acceptance against that stack. Browser rendering and type/build checks cannot prove authenticator support.

Do not expose secrets in chat. The needed handoff is the ignored configuration **path**, reviewed provider identifiers/hashes, existing CRE login/API-key configuration and funded signer/keystore alias. No mainnet deployment, paid DON, public service hosting or real-user passkey creation has been performed.

The mandate is a scoped **consumer** of eligibility, not another eligibility oracle. Its own ERC-8004 oracle registration is unnecessary. Existing oracle service identity tooling remains; optional operator/worker identity and borrower ERC-8004 reputation are deferred and not claimed. Credit stays human-backed; there is no agent-native Sybil-resistant reputation.

## Reproduce local autonomous execution

From the canonical repository root, use Node 22.13+ (including SQLite support), Bun and Foundry:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run cre:test
forge test --root contracts
npm run agent:demo
cd app
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run dev
```

`agent:demo` launches its own random-port Anvil and child worker, generates throwaway identities, deploys seven local contracts and saves a new local receipt record. It does not reuse the human's real signing key or broadcast to a public network. New runs produce new hashes. The developer machine's system Node is broken by a Homebrew library mismatch; a working bundled Node was used for verification.

## Run the independent worker against a fresh testnet stack

1. Deploy `DeployEligibility.s.sol` as specified in [ELIGIBILITY.md](ELIGIBILITY.md), including the mandate pin and receiver mode. Validate bytecode, addresses, `evidenceMode`, controller and token wiring; provide valueless test liquidity. Do not point this worker at the old manual deployment.
2. Fill `agent-credit/config.example.json` into an **ignored** `.local/agent-credit.json`: fresh line/mandate/pUSD, human wallet, deployment start block and RPC. Threshold and draw values use six-decimal integer token units; the default rule is cash below 10 pUSD → draw 20 pUSD, repayment after 60 seconds. The public deployment manifest shape is in `app/.env.example`.
3. Fund the independent agent's testnet gas. Put **only its own dedicated key** and config path in ignored `.env.agent`; the worker never needs the human/root key. Human completes genuine eligibility, collateral setup and mandate grant via Mera.
4. Start it separately before the judge-visible unattended moment:

```sh
node --env-file=.env.agent --import tsx agent-credit/worker.ts
```

Capture `confirmed` worker output, actual transaction receipt/sender and human debt/token readbacks. Restart uses chain history from `fromBlock`, which must cover **all** events for that agent. Each polling cycle pins contract reads and logs to the same block, checks reconstructed holder debt against that snapshot, and waits on incomplete/inconsistent history before any approval, draw or repayment. Retry replays the full configured range; `fromBlock` must still cover all relevant history. Run only one worker per key. Received test loan tokens remain at the agent until repayment/spending; real business spending is not simulated as a successful payment.

Normal operation waits at the cap or after revoke. For the explicitly requested **mined revert** demonstration, deliberately broadcast a test-only diagnostic draw from the same independent key:

```sh
AGENT_REVERT_PROBE_WEI=1 node --env-file=.env.agent --import tsx agent-credit/worker.ts --once
```

Only use this after checking that the cap is exhausted or the human's revocation is confirmed; a probe can succeed if its precondition is wrong. It uses fixed gas to bypass preflight rejection and spend valueless test gas. Show the resulting reverted receipt signed by the agent. Renewal followed by revocation of an unused cap demonstrates revocation separately from cap exhaustion.

For public acceptance, follow the requested Mera → authentic evidence/CRE → grant → autonomous draw/repay → agent-signed cap revert → human revoke → agent-signed revoke revert sequence. Preserve every P0 negative test and label simulation receiver transport as centralized integration evidence, not DON consensus.
