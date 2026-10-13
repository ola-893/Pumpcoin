import { SDK, type SDKConfig } from "agent0-sdk";
import { createPublicClient, decodeEventLog, encodeFunctionData, getAddress, http, parseAbi, zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const registryAbi = parseAbi([
  "function oracle() view returns (address)", "function rootController() view returns (address)",
  "event OracleRotated(address indexed previousOracle,address indexed newOracle)",
]);
export const identityAbi = parseAbi([
  "function ownerOf(uint256) view returns (address)", "function tokenURI(uint256) view returns (string)",
  "function getAgentWallet(uint256) view returns (address)",
  "function register(string agentURI, (string metadataKey,bytes metadataValue)[] metadata) returns (uint256)",
  "function setAgentURI(uint256,string)",
  "event Registered(uint256 indexed agentId,string agentURI,address indexed owner)",
]);
export const reputationAbi = parseAbi(["function getIdentityRegistry() view returns (address)"]);
export interface IdentityConfig {
  chainId: number; rpcUrl: string; attestationRegistry: Address; identityRegistry: Address;
  reputationRegistry: Address; statusEndpoint: string;
  signer?: Pick<SDKConfig, "privateKey" | "walletProvider">;
  newWalletPrivateKey?: Hex;
  walletSignature?: Hex;
  walletSignatureDeadline?: number;
}
export interface IdentityState {
  chainId: number; attestationRegistry: Address; identityRegistry: Address;
  agentId?: string; pendingRegistration?: Hex;
}
export const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function clientFor(c: IdentityConfig) { return createPublicClient({ transport: http(c.rpcUrl, { timeout: 20_000 }), pollingInterval: 1000 }); }

export function makeCard(c: IdentityConfig, oracle: Address, root: Address, agentId?: string, walletVerified = false) {
  const endpoint = new URL(c.statusEndpoint);
  if (endpoint.protocol !== "https:" && !(c.chainId === 31337 && endpoint.hostname === "localhost")) throw new Error("Use an HTTPS oracle status endpoint.");
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "ProofLine Attestation Oracle",
    description: "ProofLine demo oracle for tiered off-chain payout attestations. Baseline processing sees plaintext financial data; the public chain receives only a tier. Registration is not a security audit.",
    services: [{ name: "web", endpoint: c.statusEndpoint }],
    active: oracle !== zeroAddress, x402Support: false, supportedTrust: ["reputation"],
    registrations: agentId ? [{ agentId: Number(agentId.split(":")[1]), agentRegistry: `eip155:${c.chainId}:${c.identityRegistry}` }] : [],
    walletAddress: oracle,
    metadata: { attestationRegistry: c.attestationRegistry, rootController: root, oracleWriter: oracle,
      walletAddressMeaning: "Current registry writer, which may be a CRE receiver contract; not necessarily a payment wallet.",
      paymentWalletVerified: walletVerified, privacyMode: "plaintext-at-verifier", schemaVersion: 1 },
  };
}
export function cardUri(card: ReturnType<typeof makeCard>) { return `data:application/json;base64,${Buffer.from(JSON.stringify(card)).toString("base64")}`; }

export async function preflight(c: IdentityConfig) {
  if (![10143, 31337].includes(c.chainId)) throw new Error("Only Monad testnet or explicit local tests are supported.");
  const client = clientFor(c);
  if (await client.getChainId() !== c.chainId) throw new Error("RPC chain ID mismatch.");
  for (const address of [c.attestationRegistry, c.identityRegistry, c.reputationRegistry]) {
    const code = await client.getBytecode({ address });
    if (!code || code === "0x") throw new Error(`No contract bytecode at ${address}.`);
  }
  const [oracle, root, reputationIdentity] = await Promise.all([
    client.readContract({ address: c.attestationRegistry, abi: registryAbi, functionName: "oracle" }),
    client.readContract({ address: c.attestationRegistry, abi: registryAbi, functionName: "rootController" }),
    client.readContract({ address: c.reputationRegistry, abi: reputationAbi, functionName: "getIdentityRegistry" }),
  ]);
  if (!same(reputationIdentity, c.identityRegistry)) throw new Error("Reputation registry points to another identity registry.");
  return { client, oracle, root };
}

/** Same agent ID across rotations. save() journals mint hashes before waiting, so retries do not mint duplicates. */
export async function synchronize(c: IdentityConfig, state: IdentityState, save: (s: IdentityState) => Promise<void>, broadcast = false) {
  if (state.chainId !== c.chainId || !same(state.attestationRegistry, c.attestationRegistry) || !same(state.identityRegistry, c.identityRegistry)) throw new Error("State belongs to a different deployment.");
  const { client, oracle, root } = await preflight(c);
  if (state.pendingRegistration && !state.agentId) {
    const receipt = await client.waitForTransactionReceipt({ hash: state.pendingRegistration });
    if (receipt.status !== "success") throw new Error("Prior registration reverted; inspect it before clearing the pending mint.");
    for (const log of receipt.logs) {
      if (!same(log.address, c.identityRegistry)) continue;
      try {
        const decoded = decodeEventLog({ abi: identityAbi, data: log.data, topics: log.topics, eventName: "Registered" });
        if (!same(decoded.args.owner, root)) throw new Error("Mint owner does not match root.");
        state.agentId = `${c.chainId}:${decoded.args.agentId}`;
        break;
      } catch { /* Other events are not the registration receipt. */ }
    }
    if (!state.agentId) throw new Error("No matching registration event; refusing to mint a second identity.");
    delete state.pendingRegistration;
    await save(state);
  }
  if (state.agentId && !new RegExp(`^${c.chainId}:\\d+$`).test(state.agentId)) throw new Error("Agent ID belongs to another chain or is invalid.");
  const tokenId = state.agentId ? BigInt(state.agentId.split(":")[1]) : undefined;
  if (tokenId !== undefined && tokenId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Agent ID exceeds SDK safe integer range.");
  let wallet: Address = zeroAddress;
  let currentUri = "";
  if (tokenId !== undefined) {
    const [owner, verifiedWallet, uri] = await Promise.all([
      client.readContract({ address: c.identityRegistry, abi: identityAbi, functionName: "ownerOf", args: [tokenId] }),
      client.readContract({ address: c.identityRegistry, abi: identityAbi, functionName: "getAgentWallet", args: [tokenId] }),
      client.readContract({ address: c.identityRegistry, abi: identityAbi, functionName: "tokenURI", args: [tokenId] }),
    ]);
    if (!same(owner, root)) throw new Error("Oracle identity is no longer owned by the configured root; refusing to publish.");
    wallet = verifiedWallet; currentUri = uri;
  }
  const expectedUri = cardUri(makeCard(c, oracle, root, state.agentId, oracle !== zeroAddress && same(wallet, oracle)));
  if (!broadcast) return {
    mode: "read-only", agentId: state.agentId ?? null, oracle, root,
    synchronized: currentUri === expectedUri,
    verifiedPaymentWallet: wallet,
    transaction: { to: c.identityRegistry, data: tokenId === undefined
      ? encodeFunctionData({ abi: identityAbi, functionName: "register", args: [expectedUri, []] })
      : encodeFunctionData({ abi: identityAbi, functionName: "setAgentURI", args: [tokenId, expectedUri] }) },
  };
  const sdk = new SDK({ chainId: c.chainId, rpcUrl: c.rpcUrl, ...c.signer,
    registryOverrides: { [c.chainId]: { IDENTITY: c.identityRegistry, REPUTATION: c.reputationRegistry } } });
  if (sdk.isReadOnly || !same(await sdk.chainClient.getAddress() ?? zeroAddress, root)) throw new Error("A root-controller signer is required; oracle-key ownership is insufficient.");
  let agent;
  if (!state.agentId) {
    agent = sdk.createAgent("ProofLine Attestation Oracle", "Tiered payout attestations; plaintext baseline.");
    const tx = await agent.registerHTTP(expectedUri);
    state.pendingRegistration = tx.hash;
    await save(state);
    const result = await tx.waitConfirmed({ timeoutMs: 120_000 });
    state.agentId = result.result.agentId;
    if (!state.agentId) throw new Error("Registration did not return an agent ID.");
    delete state.pendingRegistration;
    await save(state);
    wallet = await client.readContract({ address: c.identityRegistry, abi: identityAbi, functionName: "getAgentWallet", args: [BigInt(state.agentId.split(":")[1])] });
  } else agent = await sdk.loadAgent(state.agentId);
  // Force SDK's wallet checks to read chain state, avoiding cached card fields.
  agent.getRegistrationFile().walletAddress = undefined;
  if (!same(wallet, oracle)) {
    const writerCode = oracle === zeroAddress ? undefined : await client.getBytecode({ address: oracle });
    const keyMatches = c.newWalletPrivateKey && same(privateKeyToAccount(c.newWalletPrivateKey).address, oracle);
    const canBind = oracle !== zeroAddress && (!writerCode || writerCode === "0x")
      && (same(root, oracle) || keyMatches || (c.walletSignature && c.walletSignatureDeadline));
    if (canBind) {
      const tx = await agent.setWallet(oracle, { newWalletPrivateKey: keyMatches ? c.newWalletPrivateKey : undefined,
        signature: c.walletSignature, deadline: c.walletSignatureDeadline });
      if (tx) await tx.waitConfirmed({ timeoutMs: 120_000 });
    } else if (wallet !== zeroAddress) {
      const tx = await agent.unsetWallet();
      if (tx) await tx.waitConfirmed({ timeoutMs: 120_000 });
    }
  }
  wallet = await client.readContract({ address: c.identityRegistry, abi: identityAbi, functionName: "getAgentWallet", args: [BigInt(state.agentId!.split(":")[1])] });
  const uri = cardUri(makeCard(c, oracle, root, state.agentId, oracle !== zeroAddress && same(wallet, oracle)));
  const before = await client.readContract({ address: c.identityRegistry, abi: identityAbi, functionName: "tokenURI", args: [BigInt(state.agentId!.split(":")[1])] });
  if (before !== uri) await (await agent.setAgentURI(uri)).waitConfirmed({ timeoutMs: 120_000 });
  const [latestOracle, storedUri] = await Promise.all([
    client.readContract({ address: c.attestationRegistry, abi: registryAbi, functionName: "oracle" }),
    client.readContract({ address: c.identityRegistry, abi: identityAbi, functionName: "tokenURI", args: [BigInt(state.agentId!.split(":")[1])] }),
  ]);
  if (!same(latestOracle, oracle) || storedUri !== uri) throw new Error("Writer changed during synchronization or card verification failed; retry the same agent ID.");
  return { mode: "broadcast", agentId: state.agentId, oracle, root, synchronized: true,
    verifiedPaymentWallet: wallet, walletProofPending: oracle !== zeroAddress && !same(wallet, oracle) };
}
