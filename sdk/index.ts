import {
  createPublicClient, http, encodeFunctionData, getAddress, isAddress, zeroAddress,
  type Address, type Hash, type Hex, type PublicClient, type WalletClient,
} from "viem";
import { lineAbi, mandateAbi, registryAbi, tokenAbi } from "../agent-credit/abi.js";
import { collectHistory } from "../agent-credit/history.js";
import { buildReconcileEvents, reconcileTimeline, enrollmentInnerHash, sortTimeline } from "../agent-credit/reconcile.js";
export { mandateAbi, enrollmentInnerHash };

export type AgentCreditConfig = {
  chainId: 10143 | 31337;
  creditLine: Address;
  mandate: Address;
  loanToken: Address;
  human: Address;
  agent: Address;
  /** Must cover CreditLine and mandate deployment, including pre-enrollment debt. */
  fromBlock: bigint;
};
export type AgentCreditState = Awaited<ReturnType<ReturnType<typeof createAgentCreditClient>["readState"]>>;
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Browser-safe client. No key storage, background process or automatic financial retries. */
export function createAgentCreditClient(publicClient: PublicClient, input: AgentCreditConfig, wallet?: WalletClient) {
  const config = { ...input };
  if (![10143, 31337].includes(config.chainId) || typeof config.fromBlock !== "bigint" || config.fromBlock < 0n)
    throw new Error("Use Monad testnet or disposable Anvil with a deployment-covering start block");
  for (const key of ["creditLine", "mandate", "loanToken", "human", "agent"] as const) {
    if (!isAddress(config[key]) || eq(config[key], zeroAddress)) throw new Error(`Invalid ${key}`);
    config[key] = getAddress(config[key]);
  }
  if (eq(config.human, config.agent)) throw new Error("Agent must differ from the human backer");
  if (new Set([config.creditLine, config.mandate, config.loanToken].map(x => x.toLowerCase())).size !== 3)
    throw new Error("Contract addresses must be distinct");

  async function readState() {
    if (await publicClient.getChainId() !== config.chainId) throw new Error("RPC chain mismatch");
    const block = await publicClient.getBlock({ blockNumber: await publicClient.getBlockNumber({ cacheTime: 0 }) });
    const at = { blockNumber: block.number };
    const [pinned, line, token, lineToken, registry] = await Promise.all([
      publicClient.readContract({ address: config.creditLine, abi: lineAbi, functionName: "agentCreditMandate", ...at }),
      publicClient.readContract({ address: config.mandate, abi: mandateAbi, functionName: "creditLine", ...at }),
      publicClient.readContract({ address: config.mandate, abi: mandateAbi, functionName: "loanToken", ...at }),
      publicClient.readContract({ address: config.creditLine, abi: lineAbi, functionName: "loanToken", ...at }),
      publicClient.readContract({ address: config.creditLine, abi: lineAbi, functionName: "registry", ...at }),
    ]);
    if (!eq(pinned, config.mandate) || !eq(line, config.creditLine) || !eq(token, config.loanToken) || !eq(lineToken, token))
      throw new Error("Mandate/credit-line/token wiring mismatch");
    const [mode, controller, decimals, owner, grant, balance, humanDebt, available] = await Promise.all([
      publicClient.readContract({ address: registry, abi: registryAbi, functionName: "evidenceMode", ...at }),
      publicClient.readContract({ address: registry, abi: registryAbi, functionName: "positionController", ...at }),
      publicClient.readContract({ address: token, abi: tokenAbi, functionName: "decimals", ...at }),
      publicClient.readContract({ address: config.mandate, abi: mandateAbi, functionName: "mandateOwner", args: [config.agent], ...at }),
      publicClient.readContract({ address: config.mandate, abi: mandateAbi, functionName: "mandates", args: [config.agent], ...at }),
      publicClient.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [config.agent], ...at }),
      publicClient.readContract({ address: config.creditLine, abi: lineAbi, functionName: "borrowedOf", args: [config.human], ...at }),
      publicClient.readContract({ address: config.creditLine, abi: lineAbi, functionName: "availableToBorrow", args: [config.human], ...at }),
    ]);
    if (!mode || !eq(controller, config.creditLine) || decimals !== 6)
      throw new Error("SDK requires the pinned evidence-mode stack and six-decimal demo loan token");
    const { grouped, lastDrawAt } = await collectHistory(publicClient, config.creditLine, config.mandate, config.agent, config.fromBlock, block.number);
    const built = buildReconcileEvents(grouped, config.mandate);
    const principal = reconcileTimeline(built.events, config.human, config.agent);
    const canonical = (await publicClient.getBlock({ blockNumber: block.number })).hash === block.hash;
    const historyConsistent = canonical && built.unmatched.length === 0 && built.issues.length === 0 && principal.holderDebt === humanDebt;
    const [cap, drawn, expiresAt, revoked] = grant;
    const boundToHuman = eq(owner, config.human);
    const issues = built.issues.map(issue => `${issue.reason} (${issue.tx}, log ${issue.logIndex})`);
    if (built.unmatched.length) issues.push(`${built.unmatched.length} unmatched mandate events`);
    if (principal.holderDebt !== humanDebt) issues.push("Replayed debt differs from contract debt");
    if (!canonical) issues.push("Observed block changed during read");
    return {
      blockNumber: block.number, blockHash: block.hash, timestamp: block.timestamp,
      owner, boundToHuman, cap, drawn, expiresAt, revoked, balance, humanDebt, available,
      agentOutstanding: historyConsistent ? principal.agentOutstanding : null,
      migratedOut: principal.migratedOut, migratedIn: principal.migratedIn,
      historyConsistent, issues, lastDrawAt,
      // Only validated pairs tied to this human and key are attributed here.
      events: sortTimeline(built.events).filter(e =>
        (e.kind === "agentBorrow" || e.kind === "agentRepay") && eq(e.agentKey, config.agent) && eq(e.human, config.human)),
    };
  }

  function signer() {
    if (!wallet?.account || !wallet.chain || wallet.chain.id !== config.chainId || !eq(wallet.account.address, config.agent))
      throw new Error("A wallet on the configured chain with the enrolled agent account is required");
    return wallet;
  }
  async function writable() {
    const w = signer();
    if (await w.getChainId() !== config.chainId) throw new Error("Signer RPC chain mismatch");
    const state = await readState();
    if (!state.boundToHuman || !state.historyConsistent || state.migratedOut)
      throw new Error("Actions blocked: owner, migration or confirmed history mismatch");
    return state;
  }
  async function confirmed(hash: Hash, destination: Address, expectedInput: Hex) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const tx = await publicClient.getTransaction({ hash: receipt.transactionHash });
    if (receipt.status !== "success" || !eq(tx.from, config.agent) || !tx.to || !eq(tx.to, destination) || tx.input.toLowerCase() !== expectedInput.toLowerCase())
      throw new Error(`Unconfirmed or unexpected transaction: ${receipt.transactionHash}`);
    return receipt;
  }
  async function borrow(amount: bigint) {
    if (typeof amount !== "bigint") throw new Error("Amount must be bigint token units");
    const state = await writable();
    if (amount <= 0n || state.revoked || state.expiresAt <= state.timestamp || amount > state.cap - state.drawn || amount > state.available)
      throw new Error("Borrow exceeds active mandate or human headroom");
    const w = signer();
    const { request } = await publicClient.simulateContract({ address: config.mandate, abi: mandateAbi,
      functionName: "agentBorrow", args: [amount], account: w.account!, chain: w.chain! });
    return confirmed(await w.writeContract(request), config.mandate, encodeFunctionData({ abi: mandateAbi, functionName: "agentBorrow", args: [amount] }));
  }
  async function repay(amount: bigint) {
    if (typeof amount !== "bigint") throw new Error("Amount must be bigint token units");
    const check = async () => {
      const state = await writable();
      if (amount <= 0n || amount > state.balance || amount > state.humanDebt || amount > state.agentOutstanding!)
        throw new Error("Repay exceeds agent cash or attributed principal");
    };
    await check();
    const w = signer();
    const allowance = await publicClient.readContract({ address: config.loanToken, abi: tokenAbi,
      functionName: "allowance", args: [config.agent, config.mandate] });
    const approvals = [];
    if (allowance < amount) {
      const { request } = await publicClient.simulateContract({ address: config.loanToken, abi: tokenAbi,
        functionName: "approve", args: [config.mandate, amount], account: w.account!, chain: w.chain! });
      approvals.push(await confirmed(await w.writeContract(request), config.loanToken, encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [config.mandate, amount] })));
      // Approval is a separate transaction. Refresh debt/history before repayment.
      await check();
    }
    const { request } = await publicClient.simulateContract({ address: config.mandate, abi: mandateAbi,
      functionName: "agentRepay", args: [amount], account: w.account!, chain: w.chain! });
    const receipt = await confirmed(await w.writeContract(request), config.mandate, encodeFunctionData({ abi: mandateAbi, functionName: "agentRepay", args: [amount] }));
    return { approvals, receipt };
  }
  async function signEnrollment(enrollmentExpiry: bigint) {
    const w = signer();
    if (await publicClient.getChainId() !== config.chainId || await w.getChainId() !== config.chainId)
      throw new Error("Enrollment chain mismatch");
    const now = (await publicClient.getBlock()).timestamp;
    if (typeof enrollmentExpiry !== "bigint" || enrollmentExpiry <= now || enrollmentExpiry > 2n ** 64n - 1n) throw new Error("Invalid enrollment expiry");
    const nonce = await publicClient.readContract({ address: config.mandate, abi: mandateAbi,
      functionName: "enrollmentNonce", args: [config.agent] });
    const inner = enrollmentInnerHash({ chainId: BigInt(config.chainId), mandate: config.mandate,
      human: config.human, agentKey: config.agent, nonce, enrollmentExpiry });
    const signature = await w.signMessage({ account: w.account!, message: { raw: inner } });
    return { human: config.human, agent: config.agent, nonce, enrollmentExpiry, signature };
  }
  return { readState, signEnrollment, borrow, repay };
}

/** Read-only convenience entry point, also usable when a host has its own viem version. */
export function createAgentCreditReader(config: AgentCreditConfig, rpcUrl: string) {
  const url = new URL(rpcUrl);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || (url.protocol === "http:" && !loopback) ||
      (config.chainId === 31337 && !loopback)) throw new Error("Use HTTPS or a loopback local-chain RPC");
  const client = createAgentCreditClient(createPublicClient({ transport: http(url.href) }), config);
  return { readState: client.readState };
}
