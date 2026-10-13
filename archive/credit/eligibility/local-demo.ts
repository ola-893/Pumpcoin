import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, createWalletClient, defineChain, encodePacked, http, keccak256, stringToHex, type Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DAY, deriveEligibility, encodeEligibilityReport, type PolicyConfig, type VerifiedFacts } from "./policy.js";

// Integration harness, not CRE simulation or Reclaim verification. Random throwaway keys
// and all transactions remain on a disposable loopback Anvil chain.
execFileSync("forge", ["build", "--root", "contracts"], { stdio: "ignore" });
const probe = createServer();
await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = (probe.address() as { port: number }).port;
await new Promise<void>(resolve => probe.close(() => resolve()));
const anvil = spawn("anvil", ["--port", String(port), "--chain-id", "31337", "--silent"], { stdio: "ignore" });
let spawnFailure: Error | undefined;
anvil.on("error", error => { spawnFailure = error; });
const chain = defineChain({ id: 31337, name: "ProofLine disposable demo", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [`http://127.0.0.1:${port}`] } } });
const transport = http(chain.rpcUrls.default.http[0]);
const publicClient = createPublicClient({ chain, transport });
const accounts = [0, 1, 2].map(() => privateKeyToAccount(generatePrivateKey()));
const [root, alice, bob] = accounts;
const wallets = accounts.map(account => createWalletClient({ chain, transport, account }));
function artifact(name: string) {
  return JSON.parse(readFileSync(`contracts/out/${name}.sol/${name}.json`, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
}
async function write(index: number, address: Address, name: string, fn: string, args: readonly unknown[] = []) {
  const hash = await wallets[index].writeContract({ address, abi: artifact(name).abi, functionName: fn, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return receipt;
}
async function read(address: Address, name: string, fn: string, args: readonly unknown[] = []) {
  return publicClient.readContract({ address, abi: artifact(name).abi, functionName: fn, args });
}
async function deploy(name: string, args: readonly unknown[]) {
  const a = artifact(name);
  const hash = await wallets[0].deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return receipt.contractAddress!;
}
async function mustRevert(index: number, address: Address, name: string, fn: string, args: readonly unknown[]) {
  await assert.rejects(publicClient.simulateContract({ account: accounts[index], address, abi: artifact(name).abi, functionName: fn, args }));
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (spawnFailure) throw spawnFailure;
    try { await publicClient.getChainId(); ready = true; break; } catch { await delay(100); }
  }
  assert.ok(ready, "Anvil did not start");
  for (const account of accounts) await publicClient.request({ method: "anvil_setBalance" as any, params: [account.address, "0x56BC75E2D63100000"] as any });
  const collateral = await deploy("DemoToken", ["Demo collateral", "pCOL"]);
  const loan = await deploy("DemoToken", ["Demo loan", "pUSD"]);
  const registry = await deploy("AttestationRegistry", [root.address, root.address]);
  const line = await deploy("CreditLine", [registry, collateral, loan]);
  const workflowId = keccak256(stringToHex("SYNTHETIC-local-workflow"));
  const receiver = await deploy("EligibilityReceiver", [registry, root.address, workflowId, root.address]);
  await write(0, registry, "AttestationRegistry", "enableEvidenceMode", [line]);
  await write(0, registry, "AttestationRegistry", "rotateOracle", [receiver]);
  await write(0, loan, "DemoToken", "mint", [root.address, 1000_000_000n]);
  await write(0, loan, "DemoToken", "approve", [line, 1000_000_000n]);
  await write(0, line, "CreditLine", "fundLiquidity", [1000_000_000n]);
  await write(0, collateral, "DemoToken", "mint", [alice.address, 100_000_000n]);
  await write(1, collateral, "DemoToken", "approve", [line, 100_000_000n]);
  await write(1, line, "CreditLine", "deposit", [100_000_000n]);
  assert.equal(await read(line, "CreditLine", "maxBorrow", [alice.address]), 0n);
  const now = Number((await publicClient.getBlock()).timestamp);
  const config: PolicyConfig = { chainId: 31337, registry, providerId: "SYNTHETIC", providerVersion: "1", allowFixtures: true, allowTestMode: true };
  const digest = (s: string) => keccak256(stringToHex(s));
  const facts: VerifiedFacts = { ...config, evidenceKind: "fixture", subject: alice.address,
    sourceId: digest("fixture-account"), proofHash: digest("fixture-proof"), sessionId: digest("fixture-session"),
    observedAt: now, windowStart: now - 90 * DAY, windowEnd: now,
    totalPayoutCents: "150000", currency: "USD", complete: true, testMode: true };
  const report = deriveEligibility(facts, config, now);
  const metadata = encodePacked(["bytes32", "bytes10", "address", "bytes2"], [workflowId, "0x70726f6f666c696e6500", root.address, "0x0001"]);
  const encoded = encodeEligibilityReport(report, config);
  await write(0, receiver, "EligibilityReceiver", "onReport", [metadata, encoded]);
  await write(1, line, "CreditLine", "borrow", [80_000_000n]);
  assert.equal(await read(loan, "DemoToken", "balanceOf", [alice.address]), 80_000_000n);
  console.log("PASS: synthetic eligibility → 100 pCOL collateral → 80 pUSD borrowed on local EVM");
  await mustRevert(0, receiver, "EligibilityReceiver", "onReport", [metadata, encoded]);
  const duplicate = { ...report, subject: bob.address, proofHash: digest("fresh-proof"), sessionId: digest("fresh-session") };
  await mustRevert(0, receiver, "EligibilityReceiver", "onReport", [metadata, encodeEligibilityReport(duplicate, config)]);
  console.log("PASS: proof replay and fresh proof for the same account on another wallet rejected");
  await write(1, line, "CreditLine", "requestMigration", [bob.address]);
  await write(2, line, "CreditLine", "acceptMigration", [alice.address]);
  assert.equal(await read(line, "CreditLine", "borrowedOf", [bob.address]), 80_000_000n);
  assert.equal(await read(line, "CreditLine", "borrowedOf", [alice.address]), 0n);
  assert.equal(await read(line, "CreditLine", "totalBorrowed"), 80_000_000n);
  console.log("PASS: both wallets consent; entire collateral/debt position moves with the source identity");
  await publicClient.request({ method: "evm_setNextBlockTimestamp" as any, params: [Number(report.expiresAt)] as any });
  await publicClient.request({ method: "evm_mine" as any, params: [] as any });
  assert.equal(await read(line, "CreditLine", "maxBorrow", [bob.address]), 0n);
  assert.equal(await read(line, "CreditLine", "borrowedOf", [bob.address]), 80_000_000n);
  await mustRevert(2, line, "CreditLine", "borrow", [1n]);
  await write(1, loan, "DemoToken", "transfer", [bob.address, 80_000_000n]);
  await write(2, loan, "DemoToken", "approve", [line, 80_000_000n]);
  await write(2, line, "CreditLine", "repay", [80_000_000n]);
  await write(2, line, "CreditLine", "withdraw", [100_000_000n]);
  assert.equal(await read(line, "CreditLine", "totalBorrowed"), 0n);
  console.log("PASS: expiry blocks borrowing, preserves debt, and still allows repayment and withdrawal");
  console.log("SYNTHETIC LOCAL DEMO ONLY: no Reclaim proof, no CRE DON, no public-chain transactions.");
} finally { anvil.kill("SIGTERM"); }
