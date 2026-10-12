import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, defineChain, http, isAddress, parseAbi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DAY } from "../eligibility/policy.js";
import { readSavedReport } from "./local-report.js";

// Standalone operator-trusted delivery; NOT CRE CLI, DON consensus or proof validation.
// The saved report is never regenerated. Defaults to read-only preflight;
// --broadcast enables exactly one onReport transaction from the pinned forwarder.
function arg(name: string) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
const path = arg("--report-file");
assert.ok(path, "Provide --report-file from cre:report:local");
const saved = readSavedReport(path);
const receiver = arg("--receiver") as Address;
assert.ok(isAddress(receiver) && !/^0x0{40}$/i.test(receiver), "Provide simulation receiver");
const rpcUrl = arg("--rpc-url") ?? process.env.MONAD_TESTNET_RPC_URL;
assert.ok(rpcUrl, "Provide --rpc-url or MONAD_TESTNET_RPC_URL");
const url = new URL(rpcUrl);
assert.ok(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)), "Use HTTPS or loopback RPC");
const key = process.env.CRE_FORWARDER_PRIVATE_KEY as Hex;
assert.ok(key && /^0x[0-9a-fA-F]{64}$/.test(key), "Set CRE_FORWARDER_PRIVATE_KEY locally");
const account = privateKeyToAccount(key);
const chain = defineChain({ id: saved.chainId, name: "operator-local-test", nativeCurrency: { name: "Test gas", symbol: "TEST", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const client = createPublicClient({ chain, transport: http(rpcUrl) });
assert.equal(await client.getChainId(), saved.chainId, "RPC/report chain mismatch");
const receiverAbi = parseAbi([
  "function registry() view returns (address)", "function forwarder() view returns (address)",
  "function approvedReports(bytes32) view returns (bool)", "function onReport(bytes,bytes)",
]);
const registryAbi = parseAbi([
  "function oracle() view returns (address)", "function evidenceMode() view returns (bool)",
  "function positionController() view returns (address)",
  "function eligibility(address) view returns (address,bytes32,bytes32,bytes32,bytes32,uint8,uint64,uint64,uint256)",
]);
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
assert.ok((await client.getCode({ address: receiver })) !== undefined, "Receiver has no deployed code");
const [destination, forwarder, oracle, evidenceMode, controller, approved, block] = await Promise.all([
  client.readContract({ address: receiver, abi: receiverAbi, functionName: "registry" }),
  client.readContract({ address: receiver, abi: receiverAbi, functionName: "forwarder" }),
  client.readContract({ address: saved.registry, abi: registryAbi, functionName: "oracle" }),
  client.readContract({ address: saved.registry, abi: registryAbi, functionName: "evidenceMode" }),
  client.readContract({ address: saved.registry, abi: registryAbi, functionName: "positionController" }),
  client.readContract({ address: receiver, abi: receiverAbi, functionName: "approvedReports", args: [saved.digest] }),
  client.getBlock(),
]);
assert.ok(eq(destination, saved.registry) && eq(oracle, receiver) && evidenceMode, "Receiver/registry evidence wiring mismatch");
assert.ok((await client.getCode({ address: controller })) !== undefined, "Missing position controller contract");
const lineRegistry = await client.readContract({ address: controller, abi: parseAbi(["function registry() view returns (address)"]), functionName: "registry" });
assert.ok(eq(lineRegistry, saved.registry), "Position controller registry mismatch");
assert.ok(eq(forwarder, account.address), "Signer is not the pinned forwarder");
assert.ok(approved, "Exact report digest has not been approved");
assert.ok(saved.report.observedAt <= block.timestamp && block.timestamp - saved.report.observedAt <= BigInt(DAY)
  && saved.report.expiresAt > block.timestamp, "Stale, future or expired report");
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
const simulation = await client.simulateContract({ account, address: receiver, abi: receiverAbi, functionName: "onReport", args: ["0x", saved.encoded] });
if (!process.argv.includes("--broadcast")) {
  console.log(JSON.stringify({ mode: "LOCAL_PREFLIGHT_NOT_BROADCAST", reportDigest: saved.digest }));
} else {
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  assert.equal(receipt.status, "success", "Delivery transaction reverted");
  const tx = await client.getTransaction({ hash });
  assert.ok(eq(tx.from, account.address) && tx.to && eq(tx.to, receiver), "Transaction provenance mismatch");
  const state = await client.readContract({ address: saved.registry, abi: registryAbi, functionName: "eligibility", args: [saved.report.subject] });
  const r = saved.report;
  const expected = [r.subject, r.sourceId, r.proofHash, r.sessionId, r.policyVersion, r.tier, r.observedAt, r.expiresAt, r.ceiling];
  assert.deepEqual(state.map(x => typeof x === "string" ? x.toLowerCase() : x), expected.map(x => typeof x === "string" ? x.toLowerCase() : x), "Registry state does not match saved report");
  assert.equal(await client.readContract({ address: receiver, abi: receiverAbi, functionName: "approvedReports", args: [saved.digest] }), false, "Approval was not consumed");
  console.log(JSON.stringify({ mode: "LOCAL_OPERATOR_CONFIRMED_DELIVERY", chainId: saved.chainId, reportDigest: saved.digest, txHash: hash, registry: saved.registry }));
}
