import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  isHex,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseSavedReport, readSavedReport } from "./local-report.js";

// Operator-authorized approval of ONE exact SimulationEligibilityReceiver report.
// The operator approves keccak256(encodedReport) — the same digest the receiver
// computes in onReport — so no other report can use the approval. Only the
// receiver's configured operator key can approve; this script verifies that
// onchain before sending anything.
//
// This is LOCAL execution of an operator transaction, not DON consensus and not
// proof that the approved bytes came from authentic financial evidence.
//
// Usage:
//   CRE_OPERATOR_PRIVATE_KEY=0x... npx tsx cre/approve-report.ts \
//     --report 0x... --receiver 0x... --rpc-url https://...
//   (use --report-file <path> instead of --report to avoid shell history)
const SIMULATION_RECEIVER_ABI = [
  {
    type: "function",
    name: "operator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "approvedReports",
    stateMutability: "view",
    inputs: [{ name: "digest", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "approveReport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "digest", type: "bytes32" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const saved = arg("--report-file") ? readSavedReport(arg("--report-file")!) : parseSavedReport(arg("--report") ?? "");
const reportInput = saved.encoded;
const receiver = arg("--receiver") as Address | undefined;
const rpcUrl = arg("--rpc-url") ?? process.env.MONAD_TESTNET_RPC_URL;
const key = process.env.CRE_OPERATOR_PRIVATE_KEY as Hex | undefined;
assert.ok(reportInput && isHex(reportInput) && reportInput.length > 66, "Provide --report 0x... (or --report-file) with the exact encoded report bytes");
assert.ok(receiver && isAddress(receiver), "Provide --receiver with the SimulationEligibilityReceiver address");
assert.ok(rpcUrl, "Provide --rpc-url");
const rpc = new URL(rpcUrl);
assert.ok(rpc.protocol === "https:" || (rpc.protocol === "http:" && ["127.0.0.1", "localhost"].includes(rpc.hostname)), "Use HTTPS or loopback RPC");
assert.ok(key && isHex(key), "Set CRE_OPERATOR_PRIVATE_KEY to the operator signing key (never commit it)");

const report = reportInput as Hex;
const digest = keccak256(report);
assert.notEqual(digest, `0x${"00".repeat(32)}`, "Zero digest is rejected by the receiver");
const chainId = Number(process.env.CHAIN_ID ?? process.env.MONAD_TESTNET_CHAIN_ID ?? saved.chainId);
assert.equal(chainId, saved.chainId, "Configured chain/report mismatch");
const chain = defineChain({ id: chainId, name: "operator-target",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const account = privateKeyToAccount(key);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
assert.equal(await publicClient.getChainId(), chainId, "RPC/report chain mismatch");
const destination = await publicClient.readContract({ address: receiver,
  abi: [{ type: "function", name: "registry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], functionName: "registry" });
assert.equal(destination.toLowerCase(), saved.registry.toLowerCase(), "Receiver/report registry mismatch");

const onchainOperator = (await publicClient.readContract({
  address: receiver, abi: SIMULATION_RECEIVER_ABI, functionName: "operator",
})) as Address;
assert.equal(onchainOperator.toLowerCase(), account.address.toLowerCase(),
  "OPERATOR AUTHORIZATION: signer is not the receiver operator; refusing to approve");
const before = (await publicClient.readContract({
  address: receiver, abi: SIMULATION_RECEIVER_ABI, functionName: "approvedReports", args: [digest],
})) as boolean;
console.log(`reportDigest=${digest} operator=${account.address} previouslyApproved=${before}`);
const hash = await wallet.writeContract({
  address: receiver, abi: SIMULATION_RECEIVER_ABI, functionName: "approveReport", args: [digest, true],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
assert.equal(receipt.status, "success", "Approval transaction failed");
const after = (await publicClient.readContract({
  address: receiver, abi: SIMULATION_RECEIVER_ABI, functionName: "approvedReports", args: [digest],
})) as boolean;
assert.equal(after, true, "Approval readback failed");
console.log(`APPROVED reportDigest=${digest} tx=${hash} (local operator transaction; NOT DON delivery)`);
