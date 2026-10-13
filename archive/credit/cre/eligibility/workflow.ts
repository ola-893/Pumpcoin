import {
  HTTPCapability, HTTPClient, EVMClient, handler, consensusIdenticalAggregation,
  getNetwork, hexToBase64, bytesToHex, type Runtime, type NodeRuntime, type HTTPPayload,
} from "@chainlink/cre-sdk";
import { isAddress, keccak256, encodeFunctionData, decodeAbiParameters, parseAbi, type Address, type Hex } from "viem";
import { deriveEligibility, encodeEligibilityReport, requireCondition, type PolicyConfig } from "../../eligibility/policy.js";

export type Config = PolicyConfig & {
  verifierUrl: string;
  receiver: Address;
  authorizedEVMAddress: string;
  writeReport: boolean;
};

// WriteReportReply enums (capabilities.blockchain.evm.v1alpha): TxStatus
// FATAL = 0, REVERTED = 1, SUCCESS = 2. ReceiverContractExecutionStatus is
// optional: SUCCESS = 0, REVERTED = 1, missing = undefined.
const TX_STATUS_SUCCESS = 2;
const RECEIVER_EXECUTION_SUCCESS = 0;
const RECEIVER_EXECUTION_REVERTED = 1;

const REGISTRY_READ_ABI = parseAbi([
  "function eligibility(address) view returns (address subject, bytes32 sourceId, bytes32 proofHash, bytes32 sessionId, bytes32 policyVersion, uint8 tier, uint64 observedAt, uint64 expiresAt, uint256 ceiling)",
]);
const ZERO_ADDRESS_B64 = hexToBase64(`0x${"00".repeat(20)}`);

function hasUsableTxHash(hash: Uint8Array | undefined): hash is Uint8Array {
  return !!hash && hash.length === 32 && hash.some((b) => b !== 0);
}

function fetchFacts(runtime: NodeRuntime<Config>, receiptId: string, token: string): string {
  const response = new HTTPClient().sendRequest(runtime, {
    url: `${runtime.config.verifierUrl}/facts/${receiptId}`,
    method: "GET", headers: { Authorization: `Bearer ${token}` },
  }).result();
  requireCondition(response.statusCode === 200, "Verifier rejected receipt");
  requireCondition(response.body.length < 16_384, "Verifier response too large");
  return new TextDecoder().decode(response.body);
}

export function onEligibilityRequest(runtime: Runtime<Config>, payload: HTTPPayload): string {
  requireCondition(payload.input.length < 1024, "Trigger must contain only a receipt ID");
  const input = JSON.parse(new TextDecoder().decode(payload.input));
  requireCondition(typeof input.receiptId === "string" && /^[A-Za-z0-9-]{1,80}$/.test(input.receiptId), "Invalid receipt ID");
  // The trigger supplies an opaque ID, never a caller-selected URL or unverified facts.
  const token = runtime.getSecret({ id: "VERIFIER_API_TOKEN" }).result().value;
  const raw = runtime.runInNodeMode(fetchFacts, consensusIdenticalAggregation<string>())(input.receiptId, token).result();
  const report = deriveEligibility(JSON.parse(raw), runtime.config, Math.floor(runtime.now().getTime() / 1000));
  const encoded = encodeEligibilityReport(report, runtime.config);
  runtime.log("Eligibility policy passed; no raw payout amounts logged.");
  if (!runtime.config.writeReport) return encoded;
  requireCondition(runtime.config.chainId === 10143, "CRE write target must be Monad testnet");
  requireCondition(isAddress(runtime.config.receiver) && !/^0x0+$/.test(runtime.config.receiver), "Configure receiver");
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "monad-testnet", isTestnet: true });
  requireCondition(network, "Monad testnet unavailable");
  const signed = runtime.report({ encodedPayload: hexToBase64(encoded), encoderName: "evm",
    signingAlgo: "ecdsa", hashingAlgo: "keccak256" }).result();
  const evm = new EVMClient(network.chainSelector.selector);
  const result = evm.writeReport(runtime, {
    receiver: runtime.config.receiver, report: signed, gasConfig: { gasLimit: "1000000" },
  }).result();
  const reportDigest = keccak256(encoded);
  requireCondition(result.txStatus === TX_STATUS_SUCCESS, "Onchain report delivery failed: transaction not successful");
  if (result.receiverContractExecutionStatus === RECEIVER_EXECUTION_REVERTED)
    throw new Error("Onchain report delivery failed: receiver execution reverted");
  if (!hasUsableTxHash(result.txHash)) {
    // Dry run (no --broadcast): the capability simulates without sending a transaction.
    // A dry run must never be reported as delivery.
    runtime.log("DRY RUN: no transaction broadcast; delivery not confirmed.");
    return JSON.stringify({ mode: "DRY_RUN_NOT_BROADCAST", reportDigest });
  }
  // A transaction hash exists, so broadcast was attempted: an explicit successful
  // receiver execution status is required. A missing status must not establish success.
  requireCondition(
    result.receiverContractExecutionStatus === RECEIVER_EXECUTION_SUCCESS,
    "Onchain report delivery failed: missing receiver execution status",
  );
  const txHash = bytesToHex(result.txHash);
  // Broadcast acceptance requires a real transaction receipt ...
  const receipt = evm.getTransactionReceipt(runtime, { hash: hexToBase64(txHash) }).result().receipt;
  requireCondition(receipt && receipt.status === 1n, "Onchain report delivery failed: transaction receipt missing or unsuccessful");
  requireCondition(receipt.txHash && bytesToHex(receipt.txHash).toLowerCase() === txHash.toLowerCase(),
    "Onchain report delivery failed: receipt hash mismatch");
  // ... and matching registry state.
  const callData = encodeFunctionData({ abi: REGISTRY_READ_ABI, functionName: "eligibility", args: [report.subject] });
  const state = evm.callContract(runtime, {
    call: { from: ZERO_ADDRESS_B64, to: hexToBase64(runtime.config.registry), data: hexToBase64(callData) },
  }).result();
  const [subject, sourceId, proofHash, sessionId, policyVersion, tier, observedAt, expiresAt, ceiling] =
    decodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" },
       { type: "uint8" }, { type: "uint64" }, { type: "uint64" }, { type: "uint256" }],
      state.data,
    );
  requireCondition(
    subject.toLowerCase() === report.subject.toLowerCase()
      && sourceId.toLowerCase() === report.sourceId.toLowerCase()
      && proofHash.toLowerCase() === report.proofHash.toLowerCase()
      && sessionId.toLowerCase() === report.sessionId.toLowerCase()
      && policyVersion.toLowerCase() === report.policyVersion.toLowerCase()
      && tier === report.tier && observedAt === report.observedAt
      && expiresAt === report.expiresAt && ceiling === report.ceiling,
    "Onchain report delivery failed: registry state does not match report",
  );
  runtime.log("Confirmed onchain delivery with matching registry state.");
  return JSON.stringify({ mode: "CONFIRMED_DELIVERY", reportDigest, txHash, registry: runtime.config.registry });
}

export function initWorkflow(config: Config) {
  requireCondition(typeof config.writeReport === "boolean" && typeof config.allowFixtures === "boolean"
    && typeof config.allowTestMode === "boolean", "Invalid workflow flags");
  requireCondition(config.verifierUrl.startsWith("https://") || /^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/.test(config.verifierUrl), "HTTPS verifier required except loopback");
  requireCondition(config.providerId && config.providerVersion && isAddress(config.registry), "Incomplete configuration");
  const authorizedKeys = config.authorizedEVMAddress
    ? [{ type: "KEY_TYPE_ECDSA_EVM" as const, publicKey: config.authorizedEVMAddress }]
    : [];
  requireCondition(!config.authorizedEVMAddress || isAddress(config.authorizedEVMAddress), "Invalid trigger signer");
  requireCondition(config.allowFixtures || authorizedKeys.length === 1, "Configure HTTP trigger signer");
  return [handler(new HTTPCapability().trigger({ authorizedKeys }), onEligibilityRequest)];
}
