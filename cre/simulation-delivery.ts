import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  DAY,
  deriveEligibility,
  encodeEligibilityReport,
} from "../eligibility/policy.js";

// LOCAL EXECUTION of the simulation-receiver delivery sequence on a disposable
// Anvil chain with real transactions and receipts. Synthetic fixture facts only
// (SYNTHETIC, NOT Reclaim). Operator-authorized: only the receiver's operator
// can approve a digest; only the pinned forwarder can deliver.
//
// Sequence: (1) generate the report WITHOUT writes, (2) operator approves the
// exact report digest, (3) the forwarder broadcasts that report. This is NOT
// CRE CLI execution, NOT DON consensus, and NOT public-testnet delivery.
const contractsOut = resolve(process.env.FOUNDRY_OUT ?? "contracts/out");
execFileSync("forge", ["build", "--root", "contracts", "--out", contractsOut], { stdio: "ignore" });
mkdirSync(".local", { recursive: true, mode: 0o700 });
const probe = createServer();
await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
const port = (probe.address() as { port: number }).port;
await new Promise<void>((r) => probe.close(() => r()));
const rpcUrl = `http://127.0.0.1:${port}`;
const anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "31337", "--silent"], { stdio: "ignore" });
const chain = defineChain({ id: 31337, name: "local delivery demo", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
const client = createPublicClient({ chain, transport: http(rpcUrl) });
const keys = [generatePrivateKey(), generatePrivateKey(), generatePrivateKey(), generatePrivateKey()];
const [operator, forwarder, human, outsider] = keys.map((key) => privateKeyToAccount(key));
const wallets = [operator, forwarder, human, outsider].map((account) => createWalletClient({ account, chain, transport: http(rpcUrl) }));
const scratch = mkdtempSync(join(tmpdir(), "proofline-delivery-"));
function artifact(name: string) {
  return JSON.parse(readFileSync(join(contractsOut, `${name}.sol`, `${name}.json`), "utf8")) as { abi: Abi; bytecode: { object: Hex } };
}
async function deploy(index: number, name: string, args: readonly unknown[]) {
  const a = artifact(name);
  const hash = await wallets[index].deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  assert.ok(receipt.contractAddress);
  return receipt.contractAddress;
}
async function write(index: number, address: Address, name: string, fn: string, args: readonly unknown[] = []) {
  const hash = await wallets[index].writeContract({ address, abi: artifact(name).abi, functionName: fn, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return receipt;
}
async function read<T>(address: Address, name: string, fn: string, args: readonly unknown[] = []) {
  return client.readContract({ address, abi: artifact(name).abi, functionName: fn, args }) as Promise<T>;
}
try {
  for (let i = 0; i < 100; i++) {
    try { assert.equal(await client.getChainId(), 31337); break; }
    catch { await delay(100); }
    if (i === 99) throw new Error("Anvil did not start");
  }
  for (const account of [operator, forwarder, human, outsider])
    await client.request({ method: "anvil_setBalance" as any, params: [account.address, "0x56BC75E2D63100000"] as any });
  const collateral = await deploy(0, "DemoToken", ["Demo collateral", "pCOL"]);
  const loan = await deploy(0, "DemoToken", ["Demo loan", "pUSD"]);
  const registry = await deploy(0, "AttestationRegistry", [operator.address, operator.address]);
  const line = await deploy(0, "CreditLine", [registry, collateral, loan]);
  const receiver = await deploy(0, "SimulationEligibilityReceiver", [registry, forwarder.address, operator.address]);
  await write(0, registry, "AttestationRegistry", "enableEvidenceMode", [line]);
  await write(0, registry, "AttestationRegistry", "rotateOracle", [receiver]);

  // STEP 1: generate the report WITHOUT writes. Nothing onchain changes here.
  const now = Number((await client.getBlock()).timestamp);
  const digestOf = (s: string) => keccak256(stringToHex(s));
  const config = { chainId: 31337, registry, providerId: "SYNTHETIC", providerVersion: "1", allowFixtures: true, allowTestMode: true };
  const report = deriveEligibility({
    ...config, evidenceKind: "fixture", subject: human.address,
    sourceId: digestOf("sim-account"), proofHash: digestOf("sim-proof"), sessionId: digestOf("sim-session"),
    observedAt: now, windowStart: now - 90 * DAY, windowEnd: now,
    totalPayoutCents: "150000", currency: "USD", complete: true, testMode: true,
  }, config, now);
  const encoded = encodeEligibilityReport(report, config);
  const digest = keccak256(encoded);
  const reportFile = join(scratch, "report.json");
  writeFileSync(reportFile, JSON.stringify({ mode: "SYNTHETIC_TEST_REPORT", report: encoded, reportDigest: digest }), { mode: 0o600 });
  console.log(`STEP 1 report generated without writes: digest=${digest} tier=${report.tier} ceiling=${report.ceiling}`);
  assert.equal(await read<boolean>(receiver, "SimulationEligibilityReceiver", "approvedReports", [digest]), false);
  assert.equal(await read<bigint>(registry, "AttestationRegistry", "eligibilityCeiling", [human.address]), 0n);

  // STEP 2: operator approves the EXACT digest via the shipped approve-report
  // tool (real local transaction, operator key only). Outsider approval first.
  await assert.rejects(write(3, receiver, "SimulationEligibilityReceiver", "approveReport", [digest, true]));
  console.log("STEP 2 outsider approval rejected: operator authorization preserved");
  const approval = spawnSync(process.execPath, ["--import", "tsx", "cre/approve-report.ts",
    "--report-file", reportFile, "--receiver", receiver, "--rpc-url", rpcUrl],
    { encoding: "utf8", timeout: 60_000,
      env: { ...process.env, CRE_OPERATOR_PRIVATE_KEY: keys[0], CHAIN_ID: "31337" } });
  assert.equal(approval.status, 0, `approve-report tool failed: ${(approval.stdout ?? "") + (approval.stderr ?? "")}`);
  assert.ok(approval.stdout.includes(`APPROVED reportDigest=${digest}`), "approve-report must print the approved digest");
  assert.equal(await read<boolean>(receiver, "SimulationEligibilityReceiver", "approvedReports", [digest]), true);
  console.log(`STEP 2 operator approved exact digest: digest=${digest}`);

  // Delivery without approval is rejected: a different exact report (never approved)
  // cannot be delivered even though another digest is approved.
  const unapproved = encodeEligibilityReport(
    deriveEligibility({ ...config, evidenceKind: "fixture", subject: human.address,
      sourceId: digestOf("sim-account"), proofHash: digestOf("sim-proof"), sessionId: digestOf("sim-session-2"),
      observedAt: now, windowStart: now - 90 * DAY, windowEnd: now,
      totalPayoutCents: "150000", currency: "USD", complete: true, testMode: true }, config, now),
    config,
  );
  assert.notEqual(keccak256(unapproved), digest);
  await assert.rejects(write(1, receiver, "SimulationEligibilityReceiver", "onReport", ["0x", unapproved]));
  console.log("STEP 2b unapproved-digest delivery rejected: approval binds the exact report");

  // STEP 3: exercise the actual shipped CLI, including default read-only behavior
  // and rejection of the wrong forwarder. Synthetic data remains clearly labeled.
  function deliver(key: Hex, broadcast = false) {
    return spawnSync(process.execPath, ["--import", "tsx", "cre/deliver-report.ts",
      "--report-file", reportFile, "--receiver", receiver, "--rpc-url", rpcUrl,
      ...(broadcast ? ["--broadcast"] : [])], { encoding: "utf8", timeout: 60_000,
      env: { ...process.env, CRE_FORWARDER_PRIVATE_KEY: key } });
  }
  const wrongForwarder = deliver(keys[3], true);
  assert.notEqual(wrongForwarder.status, 0);
  assert.ok(wrongForwarder.stderr.includes("not the pinned forwarder"));
  const preflight = deliver(keys[1]);
  assert.equal(preflight.status, 0, preflight.stderr);
  assert.equal(JSON.parse(preflight.stdout).mode, "LOCAL_PREFLIGHT_NOT_BROADCAST");
  assert.equal(await read<bigint>(registry, "AttestationRegistry", "eligibilityCeiling", [human.address]), 0n);
  assert.equal(await read<boolean>(receiver, "SimulationEligibilityReceiver", "approvedReports", [digest]), true);
  const sent = deliver(keys[1], true);
  assert.equal(sent.status, 0, sent.stderr);
  const delivery = JSON.parse(sent.stdout);
  assert.equal(delivery.mode, "LOCAL_OPERATOR_CONFIRMED_DELIVERY");
  assert.equal(delivery.reportDigest, digest);
  assert.equal((await client.getTransactionReceipt({ hash: delivery.txHash })).status, "success");
  const onchain = await read<readonly [Address, Hex, Hex, Hex, Hex, number, bigint, bigint, bigint]>(
    registry, "AttestationRegistry", "eligibility", [human.address]);
  assert.equal(onchain[0].toLowerCase(), report.subject.toLowerCase());
  assert.equal(onchain[1].toLowerCase(), report.sourceId.toLowerCase());
  assert.equal(onchain[2].toLowerCase(), report.proofHash.toLowerCase());
  assert.equal(onchain[3].toLowerCase(), report.sessionId.toLowerCase());
  assert.equal(onchain[4].toLowerCase(), report.policyVersion.toLowerCase());
  assert.equal(onchain[5], report.tier);
  assert.equal(onchain[6], report.observedAt);
  assert.equal(onchain[7], report.expiresAt);
  assert.equal(onchain[8], report.ceiling);
  assert.equal(await read<bigint>(registry, "AttestationRegistry", "eligibilityCeiling", [human.address]), 80_000_000n);
  console.log(`STEP 3 broadcast confirmed: tx=${delivery.txHash} ceiling=80000000 (shipped delivery CLI, real local receipt + matching registry state)`);
  assert.equal(await read<boolean>(receiver, "SimulationEligibilityReceiver", "approvedReports", [digest]), false);
  await assert.rejects(write(1, receiver, "SimulationEligibilityReceiver", "onReport", ["0x", encoded]));
  console.log("STEP 3b approval consumed: replay of the same report rejected");
  console.log("LOCAL EXECUTION COMPLETE: operator-authorized simulation-receiver delivery on Anvil. NOT CRE CLI, NOT DON, NOT testnet broadcast.");
} finally {
  anvil.kill("SIGTERM");
  rmSync(scratch, { recursive: true, force: true });
}
