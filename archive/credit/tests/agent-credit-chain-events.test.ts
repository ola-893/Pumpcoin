import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { createAgentCreditClient } from "../sdk/index.js";
import { runWorker } from "../agent-credit/worker.js";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  encodeEventTopics,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildReconcileEvents,
  reconcileTimeline,
  enrollmentInnerHash,
  type GroupedLogs,
  type ReconcileEvent,
} from "../agent-credit/reconcile.js";
import { lineAbi, mandateAbi } from "../agent-credit/abi.js";

// Live regression: real batched and mixed-action transactions on a disposable
// Anvil chain, fetched through the same per-event queries the worker uses.
// Synthetic GroupedLogs cannot drift from actual emission shapes here because
// every input log comes from a mined receipt.
execFileSync("forge", ["build", "--root", "contracts", "--skip", "script"], { stdio: "ignore" });

function artifact(name: string) {
  return JSON.parse(readFileSync(`contracts/out/${name}.sol/${name}.json`, "utf8")) as {
    abi: Abi;
    bytecode: { object: Hex };
  };
}

const probe = createServer();
await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
const port = (probe.address() as { port: number }).port;
await new Promise<void>((r) => probe.close(() => r()));
const rpcUrl = `http://127.0.0.1:${port}`;
const anvil: ChildProcess = spawn("anvil", ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "31337", "--silent"], {
  stdio: "ignore",
});
after(() => {
  anvil.kill("SIGTERM");
});

const chain = defineChain({
  id: 31337,
  name: "SYNTHETIC chain-events regression",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(rpcUrl), cacheTime: 0 });
const rootKey = generatePrivateKey();
const humanKey = generatePrivateKey();
const agentKey = generatePrivateKey();
const cliKeyExplicit = generatePrivateKey();
const cliKeyOmitted = generatePrivateKey();
const root = privateKeyToAccount(rootKey);
const human = privateKeyToAccount(humanKey);
const agent = privateKeyToAccount(agentKey);
const wallets = [root, human, agent].map((account) => createWalletClient({ account, chain, transport: http(rpcUrl) }));
const humanWallet = createWalletClient({ account: human, chain, transport: http(rpcUrl) });
const agentWallet = createWalletClient({ account: agent, chain, transport: http(rpcUrl) });

async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
  const a = artifact(name);
  const hash = await wallets[0].deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  assert.ok(receipt.contractAddress);
  return receipt.contractAddress;
}

async function call(signer: number, address: Address, name: string, fn: string, args: readonly unknown[] = []): Promise<Hex> {
  const hash = await wallets[signer].writeContract({ address, abi: artifact(name).abi, functionName: fn, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  return receipt.transactionHash;
}

const setup = (async () => {
  for (let i = 0; i < 100; i++) {
    try {
      assert.equal(await client.getChainId(), 31337);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (i === 99) throw new Error("Anvil did not start");
  }
  for (const a of [root, human, agent]) {
    await client.request({ method: "anvil_setBalance" as never, params: [a.address, "0x56BC75E2D63100000"] as never });
  }
  const collateral = await deploy("DemoToken", ["Demo collateral", "pCOL"]);
  const loan = await deploy("DemoToken", ["Demo loan", "pUSD"]);
  const registry = await deploy("AttestationRegistry", [root.address, root.address]);
  const line = await deploy("CreditLine", [registry, collateral, loan]);
  const mandate = await deploy("AgentCreditMandate", [line, loan]);
  const batcher = await deploy("CreditBatcher", []);
  await call(0, line, "CreditLine", "pinAgentCreditMandate", [mandate]);
  await call(0, loan, "DemoToken", "mint", [root.address, 1000_000_000n]);
  await call(0, loan, "DemoToken", "approve", [line, 1000_000_000n]);
  await call(0, line, "CreditLine", "fundLiquidity", [1000_000_000n]);
  await call(0, collateral, "DemoToken", "mint", [human.address, 200_000_000n]);
  await call(1, collateral, "DemoToken", "approve", [line, 200_000_000n]);
  await call(1, line, "CreditLine", "deposit", [200_000_000n]);
  // Human-direct borrow: one human lot of 40.
  await call(1, line, "CreditLine", "borrow", [40_000_000n]);
  // Two-party enrollment + grant for the worker agent.
  const now = Number((await client.getBlock()).timestamp);
  const expiry = BigInt(now + 3600);
  const nonce = (await client.readContract({
    address: mandate,
    abi: artifact("AgentCreditMandate").abi,
    functionName: "enrollmentNonce",
    args: [agent.address],
  })) as bigint;
  const inner = enrollmentInnerHash({ chainId: 31337n, mandate, human: human.address, agentKey: agent.address, nonce, enrollmentExpiry: expiry });
  const signature = await agent.signMessage({ message: { raw: inner as Hex } });
  await call(1, mandate, "AgentCreditMandate", "grantMandate", [agent.address, 100_000_000n, expiry, nonce, expiry, signature]);
  // Agent draw: one agent lot of 10. Human debt is now 50.
  const agentBorrowTx = await agentWallet.writeContract({ address: mandate, abi: artifact("AgentCreditMandate").abi, functionName: "agentBorrow", args: [10_000_000n] });
  assert.equal((await client.waitForTransactionReceipt({ hash: agentBorrowTx })).status, "success");
  // EIP-7702 batch with the agent's own identity: direct borrow(10) against
  // A's own position, mandate agentBorrow(10) backed by H, then repay(5) —
  // one transaction, equal amounts, unrelated actions around the triple.
  const executor = await deploy("BatchExecutor", []);
  await call(0, collateral, "DemoToken", "mint", [agent.address, 200_000_000n]);
  await call(2, collateral, "DemoToken", "approve", [line, 200_000_000n]);
  await call(2, line, "CreditLine", "deposit", [200_000_000n]);
  await call(0, loan, "DemoToken", "mint", [agent.address, 100_000_000n]);
  await call(2, loan, "DemoToken", "approve", [line, 100_000_000n]);
  const lineArtifact = artifact("CreditLine").abi;
  // Self-executed 7702: the tx consumes the sender nonce first, so the
  // authorization must carry nonce+1 — viem does this via executor: "self".
  const batch7702Tx = await agentWallet.sendTransaction({
    to: agent.address,
    data: encodeFunctionData({
      abi: artifact("BatchExecutor").abi,
      functionName: "execute",
      args: [
        [line, mandate, line],
        [
          encodeFunctionData({ abi: lineArtifact, functionName: "borrow", args: [10_000_000n] }),
          encodeFunctionData({ abi: artifact("AgentCreditMandate").abi, functionName: "agentBorrow", args: [10_000_000n] }),
          encodeFunctionData({ abi: lineArtifact, functionName: "repay", args: [5_000_000n] }),
        ],
      ],
    }),
    authorizationList: [await agentWallet.signAuthorization({ contractAddress: executor, executor: "self" })],
  });
  assert.equal((await client.waitForTransactionReceipt({ hash: batch7702Tx })).status, "success");
  // Fund the batcher router with collateral and loan tokens.
  await call(0, collateral, "DemoToken", "mint", [batcher, 200_000_000n]);
  await call(0, loan, "DemoToken", "mint", [batcher, 100_000_000n]);
  await call(0, batcher, "CreditBatcher", "fund", [collateral, loan, line, 200_000_000n]);
  // Mixed batch: repayFor(H,15) then borrow(30) then repay(10) in ONE transaction.
  const batchTx = await call(0, batcher, "CreditBatcher", "repayForBorrowRepay", [line, human.address, 15_000_000n, 30_000_000n, 10_000_000n]);
  // Two repayFors for distinct borrowers in ONE transaction.
  const doubleTx = await call(0, batcher, "CreditBatcher", "repayForTwice", [line, human.address, 5_000_000n, batcher, 5_000_000n]);
  return { collateral, loan, line, mandate, batcher, expiry, agentBorrowTx, batch7702Tx, batchTx, doubleTx };
})();

async function fetchGrouped(line: Address, mandate: Address, fromBlock: bigint, blockNumber?: bigint): Promise<GroupedLogs> {
  const toBlock = blockNumber ?? await client.getBlockNumber({ cacheTime: 0 });
  const grouped: GroupedLogs = {
    mandateBorrows: [],
    mandateRepays: [],
    lineBorrowed: [],
    lineBorrowedFor: [],
    lineRepaid: [],
    lineRepaidFor: [],
    migrations: [],
  };
  // Identical per-event queries to agent-credit/worker.ts.
  const [mandateLogs, borrowedLogs, borrowedForLogs, repaidLogs, repaidForLogs, migratedLogs] = await Promise.all([
    client.getContractEvents({ address: mandate, abi: mandateAbi, fromBlock, toBlock, strict: true }),
    client.getContractEvents({ address: line, abi: lineAbi, eventName: "Borrowed", fromBlock, toBlock, strict: true }),
    client.getContractEvents({ address: line, abi: lineAbi, eventName: "BorrowedFor", fromBlock, toBlock, strict: true }),
    client.getContractEvents({ address: line, abi: lineAbi, eventName: "Repaid", fromBlock, toBlock, strict: true }),
    client.getContractEvents({ address: line, abi: lineAbi, eventName: "RepaidFor", fromBlock, toBlock, strict: true }),
    client.getContractEvents({ address: line, abi: lineAbi, eventName: "PositionMigrated", fromBlock, toBlock, strict: true }),
  ]);
  for (const event of mandateLogs) {
    if (event.eventName === "AgentBorrowed") {
      grouped.mandateBorrows.push({ tx: event.transactionHash!, block: event.blockNumber, logIndex: event.logIndex, agentKey: event.args.agentKey, amount: event.args.amount });
    } else if (event.eventName === "AgentRepaid") {
      grouped.mandateRepays.push({ tx: event.transactionHash!, block: event.blockNumber, logIndex: event.logIndex, agentKey: event.args.agentKey, amount: event.args.amount });
    }
  }
  for (const event of borrowedLogs) {
    grouped.lineBorrowed.push({ tx: event.transactionHash!, block: event.blockNumber, logIndex: event.logIndex, borrower: (event.args as { borrower: Address }).borrower, amount: (event.args as { amount: bigint }).amount });
  }
  for (const event of borrowedForLogs) {
    grouped.lineBorrowedFor.push({ tx: event.transactionHash!, block: event.blockNumber, logIndex: event.logIndex, human: (event.args as { human: Address }).human, caller: (event.args as { caller: Address }).caller, amount: (event.args as { amount: bigint }).amount });
  }
  for (const event of repaidLogs) {
    grouped.lineRepaid.push({ tx: event.transactionHash!, block: event.blockNumber, logIndex: event.logIndex, borrower: (event.args as { borrower: Address }).borrower, amount: (event.args as { amount: bigint }).amount });
  }
  for (const event of repaidForLogs) {
    grouped.lineRepaidFor.push({ tx: event.transactionHash!, block: event.blockNumber, logIndex: event.logIndex, borrower: (event.args as { borrower: Address }).borrower, payer: (event.args as { payer: Address }).payer, amount: (event.args as { amount: bigint }).amount });
  }
  for (const event of migratedLogs) {
    grouped.migrations.push({ tx: event.transactionHash!, block: event.blockNumber, logIndex: event.logIndex, previous: (event.args as { previous: Address }).previous, next: (event.args as { next: Address }).next, debt: (event.args as { debt: bigint }).debt });
  }
  return grouped;
}

function runCli(args: string[], agentPrivateKey: Hex, configPath: string): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["--import", "tsx", "agent-credit/sign-enrollment.ts", ...args],
      { cwd: process.cwd(), env: { ...process.env, PATH: process.env.PATH, AGENT_PRIVATE_KEY: agentPrivateKey, AGENT_CONFIG_FILE: configPath } },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`sign-enrollment failed: ${stderr || error.message}`));
        else {
          try {
            resolve(JSON.parse(stdout) as Record<string, string>);
          } catch {
            reject(new Error(`sign-enrollment printed non-JSON: ${stdout}`));
          }
        }
      },
    );
  });
}

test("mixed batch transaction reconciles to three ordered actions from real logs", async () => {
  const { line, mandate, batcher, batchTx } = await setup;
  const { events, unmatched, issues } = buildReconcileEvents(await fetchGrouped(line, mandate, 0n), mandate);
  assert.equal(unmatched.length, 0);
  assert.equal(issues.length, 0);
  const batchEvents = events.filter((e) => e.tx === batchTx.toLowerCase());
  assert.equal(batchEvents.length, 3);
  assert.deepEqual(
    batchEvents.map((e) => e.kind),
    ["externalRepay", "humanBorrow", "externalRepay"],
  );
  const [repayFor, borrow, repay] = batchEvents;
  const eventHuman = (e: ReconcileEvent): string => (e as unknown as { human: string }).human;
  const eventAmount = (e: ReconcileEvent): bigint => (e as unknown as { amount: bigint }).amount;
  assert.equal(eventHuman(repayFor).toLowerCase(), human.address.toLowerCase());
  assert.equal(eventHuman(borrow).toLowerCase(), batcher.toLowerCase());
  assert.equal(eventHuman(repay).toLowerCase(), batcher.toLowerCase());
  assert.deepEqual(
    batchEvents.map(eventAmount),
    [15_000_000n, 30_000_000n, 10_000_000n],
  );
  // Log order is preserved: the repay precedes the later borrow.
  assert.ok(batchEvents[0].logIndex < batchEvents[1].logIndex && batchEvents[1].logIndex < batchEvents[2].logIndex);
});

test("double repayFor transaction keeps both borrowers from real logs", async () => {
  const { line, mandate, batcher, doubleTx } = await setup;
  const { events, unmatched, issues } = buildReconcileEvents(await fetchGrouped(line, mandate, 0n), mandate);
  assert.equal(unmatched.length, 0);
  assert.equal(issues.length, 0);
  const doubleEvents = events.filter((e) => e.tx === doubleTx.toLowerCase());
  assert.equal(doubleEvents.length, 2);
  assert.ok(doubleEvents.every((e) => e.kind === "externalRepay"));
  assert.deepEqual(
    doubleEvents.map((e) => (e as unknown as { human: string }).human.toLowerCase()),
    [human.address.toLowerCase(), batcher.toLowerCase()],
  );
});

test("agent triple still deduplicates to one lot from real logs", async () => {
  const { line, mandate, agentBorrowTx } = await setup;
  const { events, unmatched, issues } = buildReconcileEvents(await fetchGrouped(line, mandate, 0n), mandate);
  assert.equal(unmatched.length, 0);
  assert.equal(issues.length, 0);
  const agentEvents = events.filter((e) => e.tx === agentBorrowTx.toLowerCase());
  assert.equal(agentEvents.length, 1);
  assert.equal(agentEvents[0].kind, "agentBorrow");
});

test("7702 batch with equal amounts attributes the mandate triple correctly", async () => {
  const { line, mandate, batch7702Tx } = await setup;
  const { events, unmatched, issues } = buildReconcileEvents(await fetchGrouped(line, mandate, 0n), mandate);
  assert.equal(unmatched.length, 0);
  assert.equal(issues.length, 0);
  // One transaction: direct borrow(10) by A, mandate agentBorrow(10) for H,
  // then repay(5) by A. The equal-amount direct log must not steal the triple.
  const txEvents = events.filter((e) => e.tx === batch7702Tx.toLowerCase());
  assert.equal(txEvents.length, 3);
  assert.deepEqual(
    txEvents.map((e) => e.kind),
    ["humanBorrow", "agentBorrow", "externalRepay"],
  );
  const eventHuman = (e: ReconcileEvent): string => (e as unknown as { human: string }).human;
  const eventAmount = (e: ReconcileEvent): bigint => (e as unknown as { amount: bigint }).amount;
  assert.equal(eventHuman(txEvents[0]).toLowerCase(), agent.address.toLowerCase());
  assert.equal(eventHuman(txEvents[1]).toLowerCase(), human.address.toLowerCase());
  assert.equal(
    (txEvents[1] as unknown as { agentKey: string }).agentKey.toLowerCase(),
    agent.address.toLowerCase(),
  );
  assert.equal(eventHuman(txEvents[2]).toLowerCase(), agent.address.toLowerCase());
  assert.deepEqual(
    txEvents.map(eventAmount),
    [10_000_000n, 10_000_000n, 5_000_000n],
  );
  assert.ok(txEvents[0].logIndex < txEvents[1].logIndex && txEvents[1].logIndex < txEvents[2].logIndex);
});

test("live FIFO matches onchain debt after batched actions", async () => {
  const { line, mandate, batcher } = await setup;
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const { events, unmatched, issues } = buildReconcileEvents(await fetchGrouped(line, mandate, 0n, blockNumber), mandate);
  assert.equal(unmatched.length, 0);
  assert.equal(issues.length, 0);
  // Human: borrow 40 + agent 10 + agent 10 (7702), minus FIFO repays 15 and 5
  // -> human lot 20, agent lots 10 + 10.
  const forHuman = reconcileTimeline(events, human.address, agent.address);
  assert.equal(forHuman.agentOutstanding, 20_000_000n);
  assert.equal(forHuman.holderDebt, 40_000_000n);
  // Agent's own position: borrow 10 minus repay 5 -> 5.
  const forAgent = reconcileTimeline(events, agent.address, human.address);
  assert.equal(forAgent.agentOutstanding, 0n);
  assert.equal(forAgent.holderDebt, 5_000_000n);
  // Batcher router: borrow 30, minus repays 10 and 5 -> 15.
  const forBatcher = reconcileTimeline(events, batcher, agent.address);
  assert.equal(forBatcher.agentOutstanding, 0n);
  assert.equal(forBatcher.holderDebt, 15_000_000n);
  assert.equal(await client.readContract({ address: line, abi: lineAbi, functionName: "borrowedOf", blockNumber, args: [human.address] }), 40_000_000n);
  assert.equal(await client.readContract({ address: line, abi: lineAbi, functionName: "borrowedOf", blockNumber, args: [agent.address] }), 5_000_000n);
  assert.equal(await client.readContract({ address: line, abi: lineAbi, functionName: "borrowedOf", blockNumber, args: [batcher] }), 15_000_000n);
});

test("sign-enrollment explicit-nonce form authorizes a grant", async () => {
  const { mandate, expiry } = await setup;
  const dir = mkdtempSync(join(tmpdir(), "enroll-"));
  const configPath = join(dir, "agent.json");
  writeFileSync(configPath, JSON.stringify({ rpcUrl, chainId: 31337 }));
  const agentAccount = privateKeyToAccount(cliKeyExplicit);
  const out = await runCli([mandate, human.address, "0", expiry.toString()], cliKeyExplicit, configPath);
  assert.equal(out.nonce, "0");
  assert.equal(out.agentKey.toLowerCase(), agentAccount.address.toLowerCase());
  assert.match(out.signature, /^0x[0-9a-fA-F]{130}$/);
  const hash = await humanWallet.writeContract({
    address: mandate,
    abi: artifact("AgentCreditMandate").abi,
    functionName: "grantMandate",
    args: [agentAccount.address, 50_000_000n, expiry, 0n, expiry, out.signature as Hex],
  });
  assert.equal((await client.waitForTransactionReceipt({ hash })).status, "success");
  assert.equal(
    ((await client.readContract({ address: mandate, abi: mandateAbi, functionName: "mandateOwner", args: [agentAccount.address] })) as string).toLowerCase(),
    human.address.toLowerCase(),
  );
});

test("sign-enrollment omitted-nonce form retrieves the nonce onchain", async () => {
  const { mandate, expiry } = await setup;
  const dir = mkdtempSync(join(tmpdir(), "enroll-"));
  const configPath = join(dir, "agent.json");
  writeFileSync(configPath, JSON.stringify({ rpcUrl, chainId: 31337 }));
  const agentAccount = privateKeyToAccount(cliKeyOmitted);
  const expected = (await client.readContract({ address: mandate, abi: mandateAbi, functionName: "enrollmentNonce", args: [agentAccount.address] })) as bigint;
  const out = await runCli([mandate, human.address, expiry.toString()], cliKeyOmitted, configPath);
  assert.equal(out.nonce, expected.toString());
  const hash = await humanWallet.writeContract({
    address: mandate,
    abi: artifact("AgentCreditMandate").abi,
    functionName: "grantMandate",
    args: [agentAccount.address, 50_000_000n, expiry, expected, expiry, out.signature as Hex],
  });
  assert.equal((await client.waitForTransactionReceipt({ hash })).status, "success");
  assert.equal(
    ((await client.readContract({ address: mandate, abi: mandateAbi, functionName: "mandateOwner", args: [agentAccount.address] })) as string).toLowerCase(),
    human.address.toLowerCase(),
  );
});


// Each destructive regression restores this shared disposable chain so the
// other tests retain their initial history and accounting.
async function isolated<T>(f: () => Promise<T>): Promise<T> {
  const snapshot = await client.request({method:"evm_snapshot" as never}) as unknown as string;
  try { return await f(); }
  finally { await client.request({method:"evm_revert" as never,params:[snapshot] as never}); }
}

test("real equal repayFor then agentRepay preserve holder and agent attribution", async () => isolated(async () => {
  const {line, mandate, loan, batcher} = await setup;
  await call(2,loan,"DemoToken","approve",[mandate,100_000_000n]);
  const tx=await agentWallet.sendTransaction({to:agent.address,
    data:encodeFunctionData({abi:artifact("BatchExecutor").abi,functionName:"execute",args:[
      [line,mandate],
      [encodeFunctionData({abi:artifact("CreditLine").abi,functionName:"repayFor",args:[batcher,10_000_000n]}),
       encodeFunctionData({abi:artifact("AgentCreditMandate").abi,functionName:"agentRepay",args:[10_000_000n]})],
    ]})});
  const receipt=await client.waitForTransactionReceipt({hash:tx});
  assert.equal(receipt.status,"success");
  const built=buildReconcileEvents(await fetchGrouped(line,mandate,0n,receipt.blockNumber),mandate);
  assert.equal(built.unmatched.length,0);
  assert.equal(built.issues.length,0);
  const actions=built.events.filter(e=>e.tx===tx.toLowerCase());
  assert.deepEqual(actions.map(e=>[e.kind,(e as {human:string}).human.toLowerCase()]),
    [["externalRepay",batcher.toLowerCase()],["agentRepay",human.address.toLowerCase()]]);
  const view=reconcileTimeline(built.events,human.address,agent.address);
  assert.equal(view.agentOutstanding,10_000_000n);
  assert.equal(view.holderDebt,30_000_000n);
  for(const holder of [human.address,batcher,agent.address]) {
    assert.equal(reconcileTimeline(built.events,holder,agent.address).holderDebt,
      await client.readContract({address:line,abi:lineAbi,functionName:"borrowedOf",args:[holder],blockNumber:receipt.blockNumber}));
  }
}));

type RpcRequest = {id: number|string; method:string; params?:unknown[]};
type RpcLog = {topics:Hex[]; data:Hex; address:Address};
type RpcResponse = {id:number|string; result?:unknown; error?:unknown};

async function workerWithHistoryFault(fault: "companion"|"agent"|"direct", cash: "empty"|"funded") {
  const {line,mandate,loan} = await setup;
  const registry=await client.readContract({address:line,abi:artifact("CreditLine").abi,functionName:"registry"}) as Address;
  await call(0,registry,"AttestationRegistry","enableEvidenceMode",[line]);
  const now=(await client.getBlock()).timestamp;
  const policy=await client.readContract({address:registry,abi:artifact("AttestationRegistry").abi,functionName:"POLICY_VERSION"});
  await call(0,registry,"AttestationRegistry","submitEligibility",[[human.address,
    "0x"+"11".repeat(32),"0x"+"22".repeat(32),"0x"+"33".repeat(32),policy,2,now,now+3600n,80_000_000n]]);
  if(cash==="empty") {
    const balance=await client.readContract({address:loan,abi:artifact("DemoToken").abi,functionName:"balanceOf",args:[agent.address]}) as bigint;
    await call(2,loan,"DemoToken","transfer",[root.address,balance]);
  }
  await call(2,loan,"DemoToken","approve",[mandate,0n]);
  await client.request({method:"evm_increaseTime" as never,params:[120] as never});
  await client.request({method:"evm_mine" as never});
  const bfTopic=encodeEventTopics({abi:lineAbi,eventName:"BorrowedFor"})[0];
  const agentTopic=encodeEventTopics({abi:mandateAbi,eventName:"AgentBorrowed"})[0];
  const borrowedTopic=encodeEventTopics({abi:lineAbi,eventName:"Borrowed"})[0];
  let removed=0;
  const writes:RpcRequest[]=[];
  const proxy=createHttpServer(async(req,res)=>{
    try {
      const chunks:Buffer[]=[];
      for await(const chunk of req) chunks.push(Buffer.from(chunk));
      const input=JSON.parse(Buffer.concat(chunks).toString()) as RpcRequest|RpcRequest[];
      const response=await fetch(rpcUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)});
      const output=await response.json() as RpcResponse|RpcResponse[];
      const scrub=(q:RpcRequest,r:RpcResponse)=>{
        if(q.method==="eth_sendRawTransaction" || q.method==="eth_sendTransaction") writes.push(q);
        if(q.method!=="eth_getLogs" || !Array.isArray(r.result)) return;
        r.result=(r.result as RpcLog[]).filter(l=>{
          const drop = (fault==="companion" && l.topics[0]===bfTopic) ||
            (fault==="agent" && l.topics[0]===agentTopic) ||
            (fault==="direct" && l.topics[0]===borrowedTopic && BigInt(l.data)===40_000_000n);
          if(drop) removed++;
          return !drop;
        });
      };
      if(Array.isArray(input)) input.forEach((q,i)=>scrub(q,(output as RpcResponse[])[i]));
      else scrub(input,output as RpcResponse);
      res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(output));
    } catch {res.writeHead(500);res.end("Proxy failed");}
  });
  await new Promise<void>(r=>proxy.listen(0,"127.0.0.1",r));
  const port=(proxy.address() as {port:number}).port;
  const logs:Record<string,unknown>[]=[];
  const original=console.log;
  const debtBefore=await client.readContract({address:line,abi:lineAbi,functionName:"borrowedOf",args:[human.address]});
  const agentNonce=await client.getTransactionCount({address:agent.address});
  try {
    console.log=(message:unknown)=>logs.push(JSON.parse(String(message)) as Record<string,unknown>);
    await runWorker({chainId:31337,rpcUrl:`http://127.0.0.1:${port}`,human:human.address,
      creditLine:line,loanToken:loan,mandate,fromBlock:0n,pollMs:250,
      rule:{lowBalance:10_000_000n,drawAmount:20_000_000n,repayAfterSeconds:60n}},agentKey,{once:true});
  } finally {
    console.log=original;
    proxy.closeAllConnections();
    await new Promise<void>(r=>proxy.close(()=>r()));
  }
  assert.ok(removed>0,"Fault must actually withhold mined logs");
  assert.ok(logs.some(l=>l.event==="reconciliation-blocked"));
  assert.ok(logs.some(l=>l.event==="decision" && l.action==="wait"));
  assert.equal(writes.length,0,"No draw, repayment, or approval may be sent on incomplete history");
  assert.equal(await client.getTransactionCount({address:agent.address}),agentNonce);
  assert.equal(await client.readContract({address:line,abi:lineAbi,functionName:"borrowedOf",args:[human.address]}),debtBefore);
}

test("worker with unmatched borrow history sends no financial transaction",async()=>isolated(()=>workerWithHistoryFault("companion","empty")));
test("worker blocks incomplete repayment history and resumes after full replay",async()=>isolated(async()=>{
  await workerWithHistoryFault("agent","funded");
  const {line,mandate,loan}=await setup;
  const debtBefore=await client.readContract({address:line,abi:lineAbi,functionName:"borrowedOf",args:[human.address]});
  const nonceBefore=await client.getTransactionCount({address:agent.address});
  const logs:Record<string,unknown>[]=[];
  const original=console.log;
  try {
    console.log=(message:unknown)=>logs.push(JSON.parse(String(message)) as Record<string,unknown>);
    await runWorker({chainId:31337,rpcUrl,human:human.address,creditLine:line,
      loanToken:loan,mandate,fromBlock:0n,pollMs:250,
      rule:{lowBalance:10_000_000n,drawAmount:20_000_000n,repayAfterSeconds:60n}},agentKey,{once:true});
  } finally {console.log=original;}
  assert.ok(logs.some(l=>l.event==="confirmed" && l.action==="agentRepay" && l.amount==="20000000"));
  assert.equal(await client.getTransactionCount({address:agent.address}),nonceBefore+2); // Approval + repayment.
  assert.equal(await client.readContract({address:line,abi:lineAbi,functionName:"borrowedOf",args:[human.address]}),debtBefore-20_000_000n);
}));
test("worker with missing direct debt waits on snapshot accounting mismatch",async()=>isolated(()=>workerWithHistoryFault("direct","funded")));

// The package APIs exercise actual contracts and receipts, not mocked success summaries.
async function sdkFixture() {
  const {line, mandate, loan} = await setup;
  const registry = await client.readContract({address:line,abi:artifact("CreditLine").abi,functionName:"registry"}) as Address;
  await call(0,registry,"AttestationRegistry","enableEvidenceMode",[line]);
  const now = (await client.getBlock()).timestamp;
  const policy = await client.readContract({address:registry,abi:artifact("AttestationRegistry").abi,functionName:"POLICY_VERSION"});
  await call(0,registry,"AttestationRegistry","submitEligibility",[[human.address,
    "0x"+"41".repeat(32),"0x"+"42".repeat(32),"0x"+"43".repeat(32),policy,2,now,now+3600n,80_000_000n]]);
  const config = {chainId:31337 as const,creditLine:line,mandate,loanToken:loan,human:human.address,agent:agent.address,fromBlock:0n};
  return {config, sdk:createAgentCreditClient(client,config,agentWallet),now};
}
test("SDK signs enrollment and confirms bounded draw/repay without replenishing gross cap",async()=>isolated(async()=>{
  const {config,sdk,now}=await sdkFixture();
  const enrollment=await sdk.signEnrollment(now+3600n);
  await call(1,config.mandate,"AgentCreditMandate","grantMandate",[agent.address,10_000_000n,now+3600n,
    enrollment.nonce,enrollment.enrollmentExpiry,enrollment.signature]);
  const before=await sdk.readState();
  const draw=await sdk.borrow(3_000_000n);
  assert.equal(draw.status,"success");
  const borrowed=await sdk.readState();
  assert.equal(borrowed.agentOutstanding,before.agentOutstanding!+3_000_000n);
  await call(2,config.loanToken,"DemoToken","approve",[config.mandate,0n]);
  const paid=await sdk.repay(3_000_000n);
  assert.equal(paid.approvals.length,1);
  assert.equal(paid.receipt.status,"success");
  const after=await sdk.readState();
  assert.equal(after.historyConsistent,true);
  assert.equal(after.agentOutstanding,before.agentOutstanding);
  assert.equal(after.drawn,3_000_000n);
  assert.equal(after.humanDebt,before.humanDebt);
  await assert.rejects(sdk.borrow(8_000_000n),/Borrow exceeds/);
}));
test("SDK rejects a human signer and incomplete history before token approval or draws",async()=>isolated(async()=>{
  const {config,sdk}=await sdkFixture();
  const wrong=createAgentCreditClient(client,config,humanWallet);
  await assert.rejects(wrong.borrow(1n),/enrolled agent/);
  const nonce=await client.getTransactionCount({address:agent.address});
  const shortened=createAgentCreditClient(client,{...config,fromBlock:await client.getBlockNumber({cacheTime:0})},agentWallet);
  const bad=await shortened.readState();
  assert.equal(bad.historyConsistent,false);
  assert.equal(bad.agentOutstanding,null);
  await assert.rejects(shortened.repay(1n),/history mismatch/);
  await assert.rejects(shortened.borrow(1n),/history mismatch/);
  assert.equal(await client.getTransactionCount({address:agent.address}),nonce);
  assert.equal((await sdk.readState()).historyConsistent,true);
}));
test("SDK allows repayment after revocation but blocks further draws",async()=>isolated(async()=>{
  const {config,sdk}=await sdkFixture();
  const before=await sdk.readState();
  await call(1,config.mandate,"AgentCreditMandate","revokeMandate",[agent.address]);
  await assert.rejects(sdk.borrow(1n),/Borrow exceeds/);
  await sdk.repay(1_000_000n);
  const after=await sdk.readState();
  assert.equal(after.agentOutstanding,before.agentOutstanding!-1_000_000n);
  assert.equal(after.drawn,before.drawn);
}));
