import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { createAgentCreditClient } from "../sdk/index.js";
import { enrollmentInnerHash } from "./reconcile.js";
import {
  DAY,
  deriveEligibility,
  encodeEligibilityReport,
} from "../eligibility/policy.js";

// This harness controls only a disposable LOCAL chain. Synthetic eligibility is explicitly
// distinct from a genuine Reclaim proof or CRE CLI delivery. Agent writes occur in a child
// worker holding only its own random key, with no human submissions during draw/repay.
execFileSync("forge", ["build", "--root", "contracts"], { stdio: "ignore" });
mkdirSync(".local", { recursive: true, mode: 0o700 });
const probe = createServer();
await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
const port = (probe.address() as { port: number }).port;
await new Promise<void>((r) => probe.close(() => r()));
const rpcUrl = `http://127.0.0.1:${port}`;
const anvil = spawn(
  "anvil",
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    "31337",
    "--mixed-mining",
    "--block-time",
    "1",
    "--silent",
  ],
  { stdio: "ignore" },
);
const chain = defineChain({
  id: 31337,
  name: "SYNTHETIC local mandate demo",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(rpcUrl), cacheTime: 0, pollingInterval: 100 });
const keys = [generatePrivateKey(), generatePrivateKey(), generatePrivateKey()];
const [root, human, agent] = keys.map((key) => privateKeyToAccount(key));
const wallets = [root, human, agent].map((account) =>
  createWalletClient({ account, chain, transport: http(rpcUrl) }),
);
const receipts: Record<string, unknown>[] = [];
const workerEvents: Record<string, unknown>[] = [];
const children = new Set<ChildProcess>();
function artifact(name: string) {
  return JSON.parse(
    readFileSync(`contracts/out/${name}.sol/${name}.json`, "utf8"),
  ) as { abi: Abi; bytecode: { object: Hex } };
}
async function write(
  index: number,
  address: Address,
  name: string,
  fn: string,
  args: readonly unknown[] = [],
) {
  const hash = await wallets[index].writeContract({
    address,
    abi: artifact(name).abi,
    functionName: fn,
    args,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  receipts.push({
    hash: receipt.transactionHash,
    signer: wallets[index].account.address,
    action: fn,
    block: receipt.blockNumber.toString(),
    status: receipt.status,
  });
  return receipt;
}
async function deploy(name: string, args: readonly unknown[]) {
  const a = artifact(name);
  const hash = await wallets[0].deployContract({
    abi: a.abi,
    bytecode: a.bytecode.object,
    args,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  assert.ok(receipt.contractAddress);
  receipts.push({
    hash,
    action: `deploy:${name}`,
    signer: root.address,
    status: receipt.status,
    block: receipt.blockNumber.toString(),
  });
  return receipt.contractAddress;
}
async function read<T>(
  address: Address,
  name: string,
  fn: string,
  args: readonly unknown[] = [],
) {
  return client.readContract({
    address,
    abi: artifact(name).abi,
    functionName: fn,
    args,
  }) as Promise<T>;
}
function startWorker(probeAmount?: string) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "agent-credit/worker.ts",
      ...(probeAmount ? ["--once"] : []),
    ],
    {
      env: {
        PATH: process.env.PATH,
        AGENT_CONFIG_FILE: ".local/agent-credit-demo-config.json",
        AGENT_PRIVATE_KEY: keys[2],
        ...(probeAmount ? { AGENT_REVERT_PROBE_WEI: probeAmount } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.add(child);
  let buffer = "";
  child.stdout!.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines)
      if (line) {
        const event = JSON.parse(line);
        workerEvents.push(event);
        if (
          ["confirmed", "reverted", "approval-confirmed"].includes(event.event)
        )
          console.log(line);
      }
  });
  child.stderr!.on("data", (chunk) => console.error(chunk.toString().trim()));
  return child;
}
async function waitForEvent(
  predicate: (e: Record<string, unknown>) => boolean,
  child: ChildProcess,
) {
  for (let i = 0; i < 300; i++) {
    const event = workerEvents.find(predicate);
    if (event) return event;
    if (child.exitCode !== null)
      throw new Error("Worker exited before expected mined event");
    await delay(100);
  }
  throw new Error("Agent transaction timed out");
}
async function stopWorker(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  }
  children.delete(child);
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      assert.equal(await client.getChainId(), 31337);
      break;
    } catch {
      await delay(100);
    }
    if (i === 99) throw new Error("Anvil did not start");
  }
  for (const account of [root, human, agent])
    await client.request({
      method: "anvil_setBalance" as any,
      params: [account.address, "0x56BC75E2D63100000"] as any,
    });
  const collateral = await deploy("DemoToken", ["Demo collateral", "pCOL"]);
  const loan = await deploy("DemoToken", ["Demo loan", "pUSD"]);
  const registry = await deploy("AttestationRegistry", [
    root.address,
    root.address,
  ]);
  const line = await deploy("CreditLine", [registry, collateral, loan]);
  const vault = await deploy("RepaymentVault", [loan, line]);
  const mandate = await deploy("AgentCreditMandate", [line, loan]);
  const receiver = await deploy("SimulationEligibilityReceiver", [
    registry,
    root.address,
    root.address,
  ]);
  await write(0, line, "CreditLine", "pinAgentCreditMandate", [mandate]);
  await write(0, registry, "AttestationRegistry", "enableEvidenceMode", [line]);
  await write(0, registry, "AttestationRegistry", "rotateOracle", [receiver]);
  await write(0, loan, "DemoToken", "mint", [root.address, 1000_000_000n]);
  await write(0, loan, "DemoToken", "approve", [line, 1000_000_000n]);
  await write(0, line, "CreditLine", "fundLiquidity", [1000_000_000n]);
  await write(0, collateral, "DemoToken", "mint", [
    human.address,
    100_000_000n,
  ]);
  await write(1, collateral, "DemoToken", "approve", [line, 100_000_000n]);
  await write(1, line, "CreditLine", "deposit", [100_000_000n]);
  const now = Number((await client.getBlock()).timestamp);
  const config = {
    chainId: 31337,
    registry,
    providerId: "SYNTHETIC",
    providerVersion: "1",
    allowFixtures: true,
    allowTestMode: true,
  };
  const digest = (s: string) => keccak256(stringToHex(s));
  const report = deriveEligibility(
    {
      ...config,
      evidenceKind: "fixture",
      subject: human.address,
      sourceId: digest("fixture-account"),
      proofHash: digest("fixture-proof"),
      sessionId: digest("fixture-session"),
      observedAt: now,
      windowStart: now - 90 * DAY,
      windowEnd: now,
      totalPayoutCents: "150000",
      currency: "USD",
      complete: true,
      testMode: true,
    },
    config,
    now,
  );
  const encoded = encodeEligibilityReport(report, config);
  await write(0, receiver, "SimulationEligibilityReceiver", "approveReport", [
    keccak256(encoded),
    true,
  ]);
  await write(0, receiver, "SimulationEligibilityReceiver", "onReport", [
    "0x",
    encoded,
  ]);
  async function grantWithEnrollment(cap: bigint, expiresAt: bigint) {
    // Two-party enrollment: the independent agent offchain authorizes this
    // human/contract/chain/nonce/expiry; the human submits the signature.
    const nonce = await read<bigint>(mandate, "AgentCreditMandate", "enrollmentNonce", [agent.address]);
    const inner = enrollmentInnerHash({
      chainId: 31337n,
      mandate,
      human: human.address,
      agentKey: agent.address,
      nonce,
      enrollmentExpiry: expiresAt,
    });
    const signature = await agent.signMessage({ message: { raw: inner as Hex } });
    await write(1, mandate, "AgentCreditMandate", "grantMandate", [
      agent.address,
      cap,
      expiresAt,
      nonce,
      expiresAt,
      signature,
    ]);
  }
  await grantWithEnrollment(20_000_000n, BigInt(now + 3600));
  const fromBlock = 0n;
  writeFileSync(
    ".local/agent-credit-demo-config.json",
    JSON.stringify(
      {
        chainId: 31337,
        rpcUrl,
        human: human.address,
        creditLine: line,
        loanToken: loan,
        mandate,
        fromBlock: fromBlock.toString(),
        pollMs: 250,
        rule: {
          lowBalance: "10000000",
          drawAmount: "20000000",
          repayAfterSeconds: "2",
        },
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  const humanSubmissionCount = receipts.filter(
    (r) => r.signer === human.address,
  ).length;
  const worker = startWorker();
  const borrowed = await waitForEvent(
    (e) => e.event === "confirmed" && e.action === "agentBorrow",
    worker,
  );
  const borrowedTx = await client.getTransaction({
    hash: borrowed.hash as Hex,
  });
  assert.equal(borrowedTx.from.toLowerCase(), agent.address.toLowerCase());
  assert.equal(
    await read<bigint>(line, "CreditLine", "borrowedOf", [human.address]),
    20_000_000n,
  );
  assert.equal(
    await read<bigint>(loan, "DemoToken", "balanceOf", [agent.address]),
    20_000_000n,
  );
  const repaid = await waitForEvent(
    (e) => e.event === "confirmed" && e.action === "agentRepay",
    worker,
  );
  assert.equal(
    (
      await client.getTransaction({ hash: repaid.hash as Hex })
    ).from.toLowerCase(),
    agent.address.toLowerCase(),
  );
  assert.equal(
    await read<bigint>(line, "CreditLine", "borrowedOf", [human.address]),
    0n,
  );
  assert.equal(await read<bigint>(line, "CreditLine", "totalBorrowed"), 0n);
  assert.equal(
    await read<bigint>(line, "CreditLine", "collateralOf", [human.address]),
    100_000_000n,
  );
  assert.equal(
    receipts.filter((r) => r.signer === human.address).length,
    humanSubmissionCount,
  );
  await stopWorker(worker);
  const sdk = createAgentCreditClient(client, {
    chainId: 31337, creditLine: line, mandate, loanToken: loan,
    human: human.address, agent: agent.address, fromBlock: 0n,
  });
  const sdkAfterRepayment = await sdk.readState();
  assert.equal(sdkAfterRepayment.historyConsistent, true);
  assert.equal(sdkAfterRepayment.agentOutstanding, 0n);
  assert.equal(sdkAfterRepayment.humanDebt, 0n);
  assert.equal(sdkAfterRepayment.drawn, 20_000_000n);
  const capProbe = startWorker("1");
  await waitForEvent(
    (e) => e.event === "reverted" && e.diagnostic === true,
    capProbe,
  );
  await stopWorker(capProbe);
  // Fresh consent with unused cap proves revocation, rather than another cap exhaustion.
  await grantWithEnrollment(50_000_000n, BigInt(now + 3600));
  await write(1, mandate, "AgentCreditMandate", "revokeMandate", [
    agent.address,
  ]);
  const beforeRevoked = workerEvents.length;
  const revokeProbe = startWorker("1");
  await waitForEvent(
    (e) =>
      workerEvents.indexOf(e) >= beforeRevoked &&
      e.event === "reverted" &&
      e.diagnostic === true,
    revokeProbe,
  );
  await stopWorker(revokeProbe);
  for (const event of workerEvents.filter((e) =>
    ["confirmed", "reverted"].includes(String(e.event)),
  )) {
    const tx = await client.getTransaction({ hash: event.hash as Hex });
    const receipt = await client.getTransactionReceipt({
      hash: event.hash as Hex,
    });
    assert.equal(tx.from.toLowerCase(), agent.address.toLowerCase());
    assert.equal(tx.to?.toLowerCase(), mandate.toLowerCase());
    assert.equal(
      receipt.status,
      event.event === "confirmed" ? "success" : "reverted",
    );
  }
  const sdkState = await sdk.readState();
  assert.equal(sdkState.historyConsistent, true);
  assert.equal(sdkState.agentOutstanding, 0n);
  assert.equal(sdkState.humanDebt, 0n);
  assert.equal(sdkState.revoked, true);
  assert.equal(sdkState.drawn, 0n); // Explicit renewal reset the new grant, not repayment.
  assert.equal(sdkState.cap, 50_000_000n);
  const exampleState = JSON.parse(execFileSync(process.execPath,
    ["sdk/examples/inspect.mjs", ".local/agent-credit-demo-config.json", agent.address],
    { encoding: "utf8", env: { PATH: process.env.PATH } }));
  assert.equal(exampleState.historyConsistent, true);
  assert.equal(exampleState.humanDebt, "0");
  assert.equal(exampleState.agentOutstanding, "0");
  const manifest = {
    network: "DISPOSABLE LOCAL ANVIL — NOT MONAD TESTNET",
    chainId: 31337,
    authenticReclaim: false,
    creCliDelivery: false,
    meraOnboarding: false,
    rpcRunningAfterScript: false,
    blockClock: "Immediate transaction mining plus periodic empty blocks; worker timers use chain time",
    human: human.address,
    agent: agent.address,
    contracts: {
      collateralToken: collateral,
      loanToken: loan,
      attestationRegistry: registry,
      creditLine: line,
      repaymentVault: vault,
      agentCreditMandate: mandate,
      eligibilityReceiver: receiver,
    },
    receipts,
    workerEvents,
    sdkObservationAfterRepayment: JSON.parse(JSON.stringify(sdkAfterRepayment, (_, v) => typeof v === "bigint" ? v.toString() : v)),
    sdkObservation: JSON.parse(JSON.stringify(sdkState, (_, v) => typeof v === "bigint" ? v.toString() : v)),
    verified: {
      sdkReadbackReconciled: true,
      compiledSdkExampleVerified: true,
      repaymentPreservedGrossCap: true,
      autonomousSeparateProcess: true,
      agentSignedDrawAndRepayment: true,
      noHumanSubmissionBetweenDrawAndRepayment: true,
      capRevertMined: true,
      revokeRevertMined: true,
      finalHumanDebt: "0",
      collateralPreserved: "100000000",
    },
  };
  writeFileSync(
    "deployments/agent-credit-local.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    "PASS: independent agent signed mined draw/repay and cap/revocation reverts. Saved deployments/agent-credit-local.json.",
  );
  console.log(
    "SYNTHETIC LOCAL ONLY: authentic Reclaim, CRE CLI, Mera and public-testnet acceptance remain unverified.",
  );
} finally {
  for (const child of children) child.kill("SIGTERM");
  anvil.kill("SIGTERM");
}
