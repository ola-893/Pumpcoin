# CRE local execution review — 8 October 2026

Reviewed the existing uncommitted implementation in `Monad/UNORA` at base `bc14033` without reverting its frontend/contracts changes. This review and its fixes cover local execution and report transport; they are not a complete security audit.

## Actual CLI evidence

- CLI: `~/.cre/bin/cre version` → v1.37.0. User completed browser login; `whoami` succeeded. Deploy access is not enabled and no access request/deployment was made.
- `workflow supported-chains --output json` includes `monad-testnet`, selector `2183018362218727504`, mock forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192`.
- Real CLI build succeeded with WASM hash `442b4003aca170b971a3814b0d4d953ee87e2601dd3c9c43cde6293f574ebf54`.
- First real run failed: `no RPC URLs found for target "fixture"`. Second failed after RPC repair: `invalid JSON input: @./cre/eligibility/trigger.fixture.json`. Both errors were invisible to SDK mocks.
- After fixing target RPCs and passing a file path without `@`, actual simulation exited 0, logged policy success and returned the ABI report for chain 10143, fixture registry `0x1111111111111111111111111111111111111111`, tier 2, ceiling `80000000`.

```sh
# Run the separately labeled fixture server in another terminal first.
~/.cre/bin/cre workflow build ./cre/eligibility --target fixture --output .local/eligibility.wasm
~/.cre/bin/cre workflow simulate ./cre/eligibility --target fixture \
  --env ./cre/fixture.env --non-interactive --trigger-index 0 \
  --http-payload ./cre/eligibility/trigger.fixture.json --wasm .local/eligibility.wasm
```

This is genuine local CRE runtime execution with **synthetic facts**. `writeReport` is false and no `--broadcast` was supplied. No authenticated Stripe/Reclaim proof, testnet transaction or decentralized DON delivery is implied. Local simulation still contacts Chainlink for account/settings and the configured RPC; it is not fully offline.

## Fixes and checks

- Register Monad RPCs for fixture, local report and broadcast targets; document a funded `CRE_ETH_PRIVATE_KEY` only for CRE writes.
- Correct every CLI payload-file argument to v1.37.0 syntax.
- Local Node report generation now defaults to the ignored configured JSON, respects its `verifierUrl`, validates configuration, limits HTTP response size/time and refuses redirects. `--out` saves an immutable report artifact without overwriting an existing one.
- Shared saved-report parsing rejects a mismatched digest, mainnet destination, noncanonical/trailing bytes, unknown policy, invalid evidence identifiers, inflated ceilings and unexpected lifetime. This is report validation, not proof verification.
- Approval accepts the report-tool JSON or exact hex and checks actual RPC chain, receiver destination and operator signer.
- New delivery tool reads precisely the same artifact, checks wiring/forwarder/approval/freshness, defaults to no broadcast, then verifies receipt, transaction provenance, all registry fields and consumed approval after an explicit broadcast.
- CLI audit returns exit 2 when authentication blocks execution, rather than a misleading successful process status.
- Root/CRE/app TypeScript checks passed. Existing 70 Solidity tests passed, including 8,192 invariant calls. New report-tool and saved-report regressions supplement the existing Node and mocked CRE checks.
- Actual Anvil integration used the shipped approval/delivery tools: outsider approval rejected, unapproved digest rejected, wrong forwarder rejected, default preflight made no write, then broadcast succeeded with matching registry state; replay rejected. Synthetic local transaction: `0x3dbb5593fd7a0767ba9964ea7d906c1376c2c1a2cc3e276651bdb191ac232a37`. The disposable chain was stopped, so this is not an explorer link or a persistent deployment.

## Agent findings — resolved and verified locally (working tree, October 2026)

The two findings below were fixed after the 8 October review. Verification is
local-only (Foundry unit/invariant tests plus disposable-Anvil Node
regressions with synthetic facts); it does not replace the authentic
integration gates listed at the end of this document.

1. **Agent key squatting — fixed.** `AgentCreditMandate.grantMandate` now
   requires the agent key's offchain EIP-191 enrollment signature bound to
   human/contract/chain/nonce/expiry. Each grant consumes one single-use
   nonce, so renewals need fresh agent consent; the owner mapping is still
   never released to another human, and a renewal still resets only the new
   mandate's gross draw counter (repayment never replenishes a prior cap).
   `contracts/test/AgentCreditMandate.t.sol` (23 tests) covers squatting
   without consent, front-running, cross-human/contract/chain/nonce/expiry
   replay, and renewal with fresh authorization under preserved cumulative caps.
2. **Agent principal reconstruction — reviewed local cases fixed.**
   The worker rebuilds FIFO lots across direct human borrowing, multiple agent
   keys, external repayments and migrations. Renewals do not clear old lots.
   The first fixes handled whole-transaction netting and equal-amount direct
   borrows, but a later review reproduced two additional defects: an earlier
   equal-amount third-party `repayFor` stole an agent repayment's attribution,
   and logging unmatched history still allowed another automatic draw.

   The current implementation walks exact ordered source events per transaction.
   It binds each CreditLine event to its immediately following companion log,
   retains `BorrowedFor.caller` / `RepaidFor.payer`, and binds a mandate action
   only to the next matching agent event. Selected logs are consumed once;
   there is no first-fit amount search or fallback to later groups. Orphan,
   duplicate, inconsistent and unmatched groups are reported as unsafe.
   This parser follows the emission order of the current pinned, nonReentrant
   CreditLine and mandate contracts; changed contracts require another review.

   Every polling cycle pins contract reads and historical logs to one block,
   compares reconstructed holder debt with that block's `borrowedOf`, and
   checks that the snapshot's block hash remains canonical. Unsafe history
   selects `wait` before any automatic approval, borrowing or repayment.
   Subsequent polls rebuild the full configured history before resuming.
   Correct `fromBlock` coverage and a trustworthy RPC are still required;
   equal totals alone cannot establish complete per-agent provenance.

Verification run against the staged canonical-source copy, with synthetic
local facts only:

- Node regression suite: **68 passed**, including 21 reconciliation tests and
  11 disposable-Anvil chain/worker tests. The latter prove correct equal-amount
  third-party/agent repayment attribution, zero financial transactions under
  missing companion/agent/direct-debt logs, and successful approval/repayment
  after a complete replay. State comparisons use the same block as fetched logs;
  the test helper requests an uncached block height.
- Root and CRE TypeScript checks passed.
- The unchanged contracts passed **78 Solidity tests** in the preceding review,
  including 23 mandate tests and 8,192 invariant calls.
- No files under `cre/`, `eligibility/`, `app/` or the Solidity contracts were
  changed by this reconciliation fix. Existing enrollment consent and gross
  cumulative caps are preserved.

These checks validate the specified local cases, not a complete security audit
or the authentic integration gates below.

## Remaining authentic integration gates

Reviewed provider ID/version/content hashes and a real Stripe test-mode proof; verifier credentials/configuration; funded testnet signer; fresh evidence-mode stack; exact report approval and CRE broadcast with matching receipt/readbacks. Real Mera device acceptance and unattended public-chain agent execution also remain unverified. None can be replaced by synthetic test success.
