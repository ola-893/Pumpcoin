# @unora/agent-credit — experimental developer preview

A thin, browser-safe ESM TypeScript package for Unora's existing human-backed mandate contracts. This package is local and **not published to npm**. It handles neither Reclaim evidence delivery nor private-key storage. Only Monad testnet (10143) and disposable Anvil (31337) with valueless six-decimal demo loan tokens are supported.

## Build and install

From the repository root, with dependencies installed and Node 22.13+:

```sh
npm run sdk:build
cd sdk
npm pack
# In another project:
npm install /absolute/path/to/unora/sdk/unora-agent-credit-0.1.0.tgz viem@2.56.8
```

The tarball includes compiled JavaScript, declarations, this guide and a read-only example. It includes no worker, private keys or deployment manifest. `npm pack` rebuilds before packing. Do not publish until the deployment and acceptance gates in `docs/SUBMISSION-DEMO.md` are complete.

## Observe without a signing key

```ts
import { createAgentCreditReader } from "@unora/agent-credit";
import type { AgentCreditConfig } from "@unora/agent-credit";

// Supply actual addresses from your own validated deployment.
const config: AgentCreditConfig = {
  chainId: 10143, creditLine, mandate, loanToken, human, agent,
  fromBlock: creditLineDeploymentBlock,
};
const credit = createAgentCreditReader(config, rpcUrl);
const state = await credit.readState();
console.log(state.blockNumber, state.balance, state.humanDebt);
if (!state.historyConsistent) {
  console.error(state.issues); // agentOutstanding is null, not a guessed amount
}
```

These identifiers are inputs, not shipped addresses. All amounts, blocks and seconds are `bigint`. pUSD has six decimals: 1 pUSD = 1_000_000n units. `drawn` is gross cumulative borrowing for the current grant; it is **not** current principal.

A complete executable read-only example consumes the existing worker config and an agent address:

```sh
node sdk/examples/inspect.mjs agent-credit/config.local.json 0xYOUR_AGENT_ADDRESS
```

Run while the configured RPC and deployment still exist. The standalone demo's RPC stops at exit, so its saved artifact cannot be queried afterward.

## Agent consent and human authority

Create viem public and wallet clients on the same explicit supported chain. Keep the human wallet separate; never give its key to the agent. The SDK requires the wallet account to equal `config.agent`.

```ts
import { createAgentCreditClient, mandateAbi } from "@unora/agent-credit";
const agentCredit = createAgentCreditClient(publicClient, config, agentWallet);
const consent = await agentCredit.signEnrollment(enrollmentExpiry);

// A separate human signer grants a cap no later than the signed expiry.
const hash = await humanWallet.writeContract({
  address: config.mandate, abi: mandateAbi, functionName: "grantMandate",
  args: [config.agent, drawCap, mandateExpiry,
    consent.nonce, consent.enrollmentExpiry, consent.signature],
});
const grantReceipt = await publicClient.waitForTransactionReceipt({ hash });
if (grantReceipt.status !== "success") throw new Error("Grant reverted");

const drawReceipt = await agentCredit.borrow(3_000_000n);
const { approvals, receipt: repayReceipt } = await agentCredit.repay(3_000_000n);
```

Enrollment signs the contract/chain/human/agent/nonce/expiry domain. It grants no borrowing authority itself. The human must submit `grantMandate`; a renewal requires fresh consent and creates a new gross cap without erasing older debt. Only the human can call `revokeMandate(agent)`. Revocation stops future draws, not repayment, existing debt or downstream token spending.

## API and failure semantics

- `readState()` validates chain, line/mandate/token wiring, evidence mode, pinned registry controller and loan-token decimals. It reads state and full history through one block, then checks that block's hash again. It returns owner binding, gross cap, expiry/revocation, agent cash, human debt/headroom, attributed principal, paired events, block/hash/time and reconciliation issues. It never reports worker liveness.
- `borrow(amount)` requires the configured agent signer, owner binding, consistent history, no migrated-out position, active cap and sufficient headroom. It simulates and submits a mandate transaction, returning a successful receipt after checking sender, destination and calldata.
- `repay(amount)` permits inactive/revoked grants. It limits repayment to cash, human debt and attributed agent principal. If necessary, it first approves **the requested amount** to the mandate and confirms that transaction, then rereads history before repayment. It returns separate approval receipt(s) and the repayment receipt.
- `signEnrollment(expiry)` reads the next nonce and asks the agent wallet to sign an EIP-191 message. It returns consent; it does not submit the human grant.

There are no automatic transaction retries. A transport/receipt error after submission can still mean a transaction mined. Inspect the wallet/RPC before retrying. If approval succeeds but repayment fails, the allowance can remain; revoking a mandate does not revoke token allowances. Run only one transaction writer per agent key; concurrent human/agent actions can race preflight reads. Contracts remain the authority at execution time.

## Trust and scope

The SDK and worker share confirmed-event collection and reconciliation. Replay includes human-direct borrowing, all agents, external repayments and migrations. Off-chain principal allocation is FIFO, with an agent's repayments consuming its own lots first. This is an allocation convention, not a separate per-agent debt mapping on chain.

The RPC must return truthful complete history. `fromBlock` must cover **CreditLine deployment**, including debt before agent enrollment. Debt equality and paired-event checks catch many omissions; they cannot prove the RPC has omitted nothing, especially omitted round trips with zero net debt. On-chain address wiring does not prove audited bytecode. The SDK validates the loan side; the human UI additionally validates collateral and full deployment addresses. There is no price feed, liquidation, interest, default enforcement, autonomous revenue generation or deployed agent reputation registry.
