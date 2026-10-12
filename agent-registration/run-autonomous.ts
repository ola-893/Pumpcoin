import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { decodeFunctionData, keccak256, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from 'viem';
import { configuredSigner } from './signer.js';
import { registrationService } from './service.js';
import { autonomousAbi, autonomousClient, autonomousDeployment, tradingSnapshot, proposeTrade, submitTrade, type AutonomousDeployment } from './autonomous.js';

type Pending = { hash: Hex; serialized: Hex; blockNumber: string };
type Journal = { scope: string; lastBlock: string; pending?: Pending; lastReceipt?: { hash: Hex; status: string; blockNumber: string; blockHash: Hex } };
export type WorkerConfig = { registrationId: Hex; deployment: AutonomousDeployment; pollIntervalMs?: number; maxFeePerGasWei?: string; confirmations?: number };

export async function runAutonomous(config: WorkerConfig, options: { once?: boolean; directory?: string; registrations?: string; signal?: AbortSignal; propose?: typeof proposeTrade; client?: ReturnType<typeof autonomousClient> } = {}) {
  if (options.signal?.aborted) return;
  const c = autonomousDeployment(config.deployment);
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
      let blocked = false;
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
            let receipt;
            try { receipt = await client.getTransactionReceipt({ hash: pending.hash }); }
            catch (e) { if ((e as Error).name !== 'TransactionReceiptNotFoundError') throw e; }
            if (!receipt) {
              // Rebroadcast identical signed bytes only. An ambiguous send never causes a new nonce/trade.
              try { await client.sendRawTransaction({ serializedTransaction: pending.serialized }); } catch { /* Keep pending; reconcile on the next cycle. */ }
              console.log(JSON.stringify({ state: 'pending', hash: pending.hash }));
            } else if ((await client.getBlockNumber()) < receipt.blockNumber + BigInt(confirmations - 1)) {
              console.log(JSON.stringify({ state: 'confirming', hash: pending.hash }));
            } else {
              if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) throw new Error('Pending receipt is not canonical.');
              state.lastReceipt = { hash: pending.hash, status: receipt.status, blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash };
              // Skip the receipt block as well, avoiding a second action on unchanged market observations.
              state.lastBlock = receipt.blockNumber.toString(); delete state.pending; await persist();
              console.log(JSON.stringify({ state: receipt.status, hash: receipt.transactionHash }));
            }
          } else {
            const snapshot = await tradingSnapshot(prepared, c, client);
            if (snapshot.blockNumber > BigInt(state.lastBlock)) {
              const proposal = await (options.propose ?? proposeTrade)(prepared, snapshot);
              if (options.signal?.aborted) break;
              const hash = await submitTrade(prepared, c, snapshot, proposal, account, async pending => { state.pending = pending; await persist(); }, client, maxFee, options.signal);
              if (!hash) { state.lastBlock = snapshot.blockNumber.toString(); await persist(); }
              console.log(JSON.stringify({ state: hash ? 'submitted' : 'hold', ...(hash ? { hash } : {}) }));
            }
          }
          blocked = false;
        } catch (error) {
          if (options.once || !storageHealthy) throw error;
          if (!blocked) console.log(JSON.stringify({ state: 'blocked', reason: 'Trading blocked. Check permission, valuation, runtime and pending journal; uncertain submissions remain journaled.' }));
          blocked = true;
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
