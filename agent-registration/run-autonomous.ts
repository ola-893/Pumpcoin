import { requestOracleRefresh } from './oracle-demand.js';
import { canonical, signDecision, verifyDecision, type DecisionReceipt } from './decision-receipt.js';
import { inferenceRequest, LIVE_PURPOSE, type Proposal } from './worker.js';
import { economyPolicy, gasDay, requireActivityBudget, BudgetLimitError, type EconomyPolicy, type GasDay } from './gas-budget.js';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { decodeFunctionData, keccak256, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from 'viem';
import { configuredSigner } from './signer.js';
import { registrationService } from './service.js';
import { autonomousAbi, autonomousClient, autonomousDeployment, tradingSnapshot, proposeTrade, proposeDecision, submitTrade, type AutonomousDeployment } from './autonomous.js';

type Pending = { decisionHash?: Hex; hash: Hex; serialized: Hex; blockNumber: string };
type Journal = { decisionCount?: number; lastDecisionHash?: Hex; gasBudget?: GasDay; lastTradeTimestamp?: string; receipts?: { hash: Hex; status: string; blockNumber: string; gasCostWei: string; decisionHash?: Hex }[]; scope: string; lastBlock: string; pending?: Pending; lastReceipt?: { hash: Hex; status: string; blockNumber: string; blockHash: Hex } };
export type WorkerConfig = { registrationId: Hex; deployment: AutonomousDeployment; pollIntervalMs?: number; maxFeePerGasWei?: string; confirmations?: number; economy?: EconomyPolicy };
import type { WorkerObservation } from "./types.js";
export type { WorkerObservation } from "./types.js";

export async function runAutonomous(config: WorkerConfig, options: { once?: boolean; directory?: string; registrations?: string; signal?: AbortSignal; propose?: typeof proposeTrade; decide?: typeof proposeDecision; client?: ReturnType<typeof autonomousClient>; observe?: (event: WorkerObservation) => void } = {}) {
  // Observability must never interrupt signing or durable receipt reconciliation.
  const observe = (event: WorkerObservation) => { console.log(JSON.stringify(event)); try { options.observe?.(event); } catch { /* No effect on trading. */ } };
  if (options.signal?.aborted) return;
  const c = autonomousDeployment(config.deployment), economy = economyPolicy(config.economy);
  const signer = await configuredSigner();
  if (!signer) throw new Error('Configure the encrypted execution signer before starting the worker.');
  try {
    const directory = options.directory ?? fileURLToPath(new URL('../.local/autonomous-workers/', import.meta.url));
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const service = registrationService({ directory: options.registrations ?? fileURLToPath(new URL('../.local/agent-registrations/', import.meta.url)) });
    const { record, prepared } = await service.workerRegistration(config.registrationId);
    if (record.authorization.challenge.chainId !== c.chainId || record.binding?.vault.toLowerCase() !== c.vault.toLowerCase()) throw new Error('Worker deployment must match the confirmed signed registration.');
    const account = await signer.account(prepared.manifest.controller, prepared.manifest.name);
    const lockPath = join(directory, `${account.address.toLowerCase()}.lock`);
    // Never steal stale locks automatically: operator must first confirm no old worker is alive.
    const lock = await open(lockPath, 'wx', 0o600);
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, chainId: c.chainId, vault: c.vault }));
      const file = join(directory, `${c.chainId}-${c.vault.toLowerCase()}.json`), scope = JSON.stringify([c.chainId, c.vault, config.registrationId, account.address]);
      let state: Journal;
      try { state = JSON.parse(await readFile(file, 'utf8')); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; state = { scope, lastBlock: '-1' }; }
      if (state.scope !== scope || !/^-?\d+$/.test(state.lastBlock)) throw new Error('Worker journal belongs to a different registration.');
      const decisionsDirectory = join(directory, 'decisions', `${c.chainId}-${c.vault.toLowerCase()}`);
      await mkdir(decisionsDirectory, { recursive: true, mode: 0o700 });
      if ((state.decisionCount === undefined) !== (state.lastDecisionHash === undefined) || (state.decisionCount !== undefined && (!Number.isSafeInteger(state.decisionCount) || state.decisionCount < 1))) throw new Error('Invalid decision journal checkpoint.');
      if (state.lastDecisionHash) {
        if (!/^0x[0-9a-f]{64}$/.test(state.lastDecisionHash)) throw new Error('Invalid decision journal checkpoint.');
        const receipt: DecisionReceipt = JSON.parse(await readFile(join(decisionsDirectory, `${state.lastDecisionHash.slice(2)}.json`), 'utf8'));
        await verifyDecision(receipt, prepared, c, record.id);
        if (receipt.body.sequence !== state.decisionCount) throw new Error('Decision journal checkpoint differs from the stored receipt.');
      }
      let storageHealthy = true;
      const persist = async () => {
        try {
        const temp = file + '.tmp', handle = await open(temp, 'w', 0o600);
        try { await handle.writeFile(JSON.stringify(state, null, 2)); await handle.sync(); } finally { await handle.close(); }
        await rename(temp, file);
        const parent = await open(directory, 'r'); try { await parent.sync(); } finally { await parent.close(); }
        } catch (error) { storageHealthy = false; throw error; }
      };
      const client = options.client ?? autonomousClient(c), poll = config.pollIntervalMs ?? 15000;
      if (!Number.isSafeInteger(poll) || poll < 1000 || poll > 60000) throw new Error('Worker poll interval must be 1–60 seconds.');
      const maxFee = BigInt(config.maxFeePerGasWei ?? '100000000000');
      if (maxFee <= 0n) throw new Error('Operator gas price budget must be positive.');
      const confirmations = config.confirmations ?? 2;
      if (!Number.isSafeInteger(confirmations) || confirmations < 2 || confirmations > 64) throw new Error('Use 2–64 receipt confirmations.');
      do {
        try {
          if (state.lastReceipt) {
            const receipt = await client.getTransactionReceipt({ hash: state.lastReceipt.hash });
            if (receipt.blockHash !== state.lastReceipt.blockHash || receipt.status !== state.lastReceipt.status || receipt.blockNumber.toString() !== state.lastReceipt.blockNumber || (await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) throw new Error('Previous trade receipt changed; inspect the journal before continuing.');
          }
          if (state.pending) {
            const pending = state.pending, tx = parseTransaction(pending.serialized);
            if (keccak256(pending.serialized) !== pending.hash || tx.chainId !== c.chainId || tx.to?.toLowerCase() !== c.vault.toLowerCase() || (tx.value ?? 0n) !== 0n
                || (await recoverTransactionAddress({ serializedTransaction: pending.serialized as TransactionSerialized })).toLowerCase() !== account.address.toLowerCase()) throw new Error('Worker pending transaction is invalid.');
            if (!tx.data || decodeFunctionData({ abi: autonomousAbi, data: tx.data }).functionName !== 'managerTrade') throw new Error('Pending transaction is not a restricted trade.');
            if (pending.decisionHash) {
              if (pending.decisionHash !== state.lastDecisionHash) throw new Error('Pending decision differs from the journal checkpoint.');
              const decision: DecisionReceipt = JSON.parse(await readFile(join(decisionsDirectory, `${pending.decisionHash.slice(2)}.json`), 'utf8'));
              await verifyDecision(decision, prepared, c, record.id);
              if (!decision.body.tradeData || tx.data !== `${decision.body.tradeData}50434431${decision.hash.slice(2)}`) throw new Error('Pending trade differs from its decision commitment.');
            }
            let receipt;
            try { receipt = await client.getTransactionReceipt({ hash: pending.hash }); }
            catch (e) { if ((e as Error).name !== 'TransactionReceiptNotFoundError') throw e; }
            if (!receipt) {
              // Rebroadcast identical signed bytes only. An ambiguous send never causes a new nonce/trade.
              try { await client.sendRawTransaction({ serializedTransaction: pending.serialized }); } catch { /* Keep pending; reconcile on the next cycle. */ }
              observe({ state: 'pending', hash: pending.hash });
            } else if ((await client.getBlockNumber()) < receipt.blockNumber + BigInt(confirmations - 1)) {
              observe({ state: 'confirming', hash: pending.hash });
            } else {
              if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) throw new Error('Pending receipt is not canonical.');
              state.lastReceipt = { hash: pending.hash, status: receipt.status, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash };
              // Skip the receipt block as well, avoiding a second action on unchanged market observations.
              const receiptBlock = await client.getBlock({ blockNumber: receipt.blockNumber });
              const budget = gasDay(state.gasBudget, receiptBlock.timestamp);
              const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
              if (gasCost < 0n) throw new Error('Invalid receipt gas cost.');
              state.gasBudget = { ...budget, spentWei: (BigInt(budget.spentWei) + gasCost).toString(), trades: budget.trades + 1 };
              state.lastTradeTimestamp = receiptBlock.timestamp.toString();
              state.receipts = [...(state.receipts ?? []), { hash: pending.hash, status: receipt.status, blockNumber: receipt.blockNumber.toString(), gasCostWei: gasCost.toString(), ...(pending.decisionHash ? { decisionHash: pending.decisionHash } : {}) }];
              state.lastBlock = receipt.blockNumber.toString(); delete state.pending; await persist();
              observe({ state: receipt.status, hash: receipt.transactionHash });
            }
          } else {
            const head = await client.getBlock();
            const budget = gasDay(state.gasBudget, head.timestamp);
            if (economy) requireActivityBudget(economy, budget, head.timestamp, state.lastTradeTimestamp);
            const snapshot = await tradingSnapshot(prepared, c, client);
            if (snapshot.blockNumber > BigInt(state.lastBlock)) {
              const inference = options.propose
                ? await (async () => { const rawProposal = await options.propose!(prepared, snapshot) as Proposal; return { request: inferenceRequest(prepared, snapshot.input, LIVE_PURPOSE), rawContent: JSON.stringify(rawProposal), rawProposal }; })()
                : await (options.decide ?? proposeDecision)(prepared, snapshot);
              if (options.signal?.aborted) break;
              const decision = await signDecision(prepared, c, record.id, snapshot, inference, account, (state.decisionCount ?? 0) + 1, state.lastDecisionHash ?? null, !!options.propose || !!options.decide);
              await verifyDecision(decision, prepared, c, record.id);
              // Immutable receipt and checkpoint are durable before transaction signing/broadcast.
              // An exact deterministic retry may reuse identical bytes; conflicting receipts stop the worker.
              try {
                const path = join(decisionsDirectory, `${decision.hash.slice(2)}.json`);
                let receiptFile;
                try { receiptFile = await open(path, 'wx', 0o600); }
                catch (error) {
                  if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || canonical(JSON.parse(await readFile(path, 'utf8'))) !== canonical(decision)) throw error;
                }
                if (receiptFile) { try { await receiptFile.writeFile(JSON.stringify(decision, null, 2)); await receiptFile.sync(); } finally { await receiptFile.close(); } }
                const receiptParent = await open(decisionsDirectory, 'r'); try { await receiptParent.sync(); } finally { await receiptParent.close(); }
              } catch (error) { storageHealthy = false; throw error; }
              state.decisionCount = decision.body.sequence; state.lastDecisionHash = decision.hash; await persist();
              const hash = await submitTrade(prepared, c, snapshot, inference.rawProposal, account, async pending => { state.pending = { ...pending, decisionHash: decision.hash }; await persist(); }, client, maxFee, options.signal, economy ? { policy: economy, spentWei: BigInt(budget.spentWei) } : undefined, decision.hash);
              if (!hash) { state.lastBlock = snapshot.blockNumber.toString(); await persist(); }
              observe({ state: hash ? 'submitted' : 'hold', ...(hash ? { hash } : {}) });
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'Live valuation is unavailable.') { try { await requestOracleRefresh(config.registrationId); } catch { /* Stay blocked; a failed upkeep request cannot authorize a trade. */ } }
          if (options.once || !storageHealthy) throw error;
          if (error instanceof BudgetLimitError) observe({ state: 'budget', budgetReason: error.reason });
          else
          observe({ state: 'blocked', reason: 'Trading blocked. Check permission, valuation, runtime and pending journal; uncertain submissions remain journaled.' });
        }
        if (options.once || options.signal?.aborted) break;
        await new Promise<void>(done => { const finish = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', finish); done(); }; const timer = setTimeout(finish, poll); options.signal?.addEventListener('abort', finish, { once: true }); });
      } while (!options.signal?.aborted);
    } finally { await lock.close(); await unlink(lockPath); }
  } finally { signer.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort()); process.once('SIGTERM', () => stop.abort());
  try {
    const file = process.env.PUMPCOIN_AUTONOMY_CONFIG;
    if (!file) throw new Error('Set PUMPCOIN_AUTONOMY_CONFIG to an operator-reviewed local JSON file.');
    await runAutonomous(JSON.parse(await readFile(file, 'utf8')), { once: process.argv.includes('--once'), signal: stop.signal });
  } catch {
    // Provider/model errors can contain private local paths or request material.
    console.error('Autonomous worker stopped. Check signer setup, live deployment, permission, valuation and pending journal before restarting.');
    process.exitCode = 1;
  }
}
