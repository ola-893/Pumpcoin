import { activeOracleDemand } from './oracle-demand.js';
import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, decodeFunctionData, getAddress, http, keccak256, parseAbi, parseTransaction, recoverTransactionAddress, type Address, type Hex, type TransactionSerialized } from 'viem';
import { monadTestnet } from 'viem/chains';
import type { PrivateKeyAccount } from 'viem/accounts';
import { readClient } from './rpc.js';
import { tradingService, type TradingNetwork } from './trading.js';
import type { VaultNetwork } from './vault-setup.js';
import { registrationService } from './service.js';
import { gasDay, economyPolicy, requireActivityBudget, requireGasBudget, type EconomyPolicy, type GasDay } from './gas-budget.js';

export const KEEPER_NAME = 'PumpCoin oracle keeper';
export function oracleRefreshEligible(view: { paused: boolean; configured: boolean; cash?: string; position?: string; bundle?: { guard?: unknown } }, onDemand = false) {
  const emptyBootstrap = onDemand && view.paused && !view.configured && view.cash === '0' && view.position === '0' && !!view.bundle?.guard;
  return emptyBootstrap || (!view.paused && (view.configured || !!view.bundle?.guard));
}
export type KeeperConfig = { version: 'PUMPCOIN-ORACLE-KEEPER-v1'; chainId: 10143; controller: Address; address: Address; registrations: Hex[];
  refreshAheadSeconds: number; pollIntervalMs: number; maxFeePerGasWei: string; economy: EconomyPolicy;
  mode: 'on-demand' | 'continuous'; keepWarmRequests?: boolean; enabled: boolean; validUntil: number };
type Pending = { hash: Hex; serialized: Hex; target: Address; kind: 'mon' | 'usd' | 'checkpoint'; registrationId?: Hex; submittedAt: string; maximumCostWei: string };
export type KeeperJournal = { scope: string; budget?: GasDay; pending?: Pending; lastReceipt?: { hash: Hex; blockNumber: string; blockHash: Hex; status: string };
  receipts: { hash: Hex; status: string; gasCostWei: string; valueWei: string; kind: string; target: Address }[] };
export type OracleTask = { registrationId: Hex; kind: 'mon' | 'usd' | 'checkpoint'; target: Address };
const updateAbi = parseAbi(['function updatePriceFeeds(bytes[]) payable', 'function updateMon(bytes)', 'function checkpoint() returns(bool)']);
export function checkedKeeper(value: KeeperConfig): KeeperConfig {
  if (value.version !== 'PUMPCOIN-ORACLE-KEEPER-v1' || value.chainId !== 10143 || getAddress(value.controller) !== value.controller || getAddress(value.address) !== value.address || /^0x0{40}$/i.test(value.address) || value.address === value.controller
      || !Array.isArray(value.registrations) || value.registrations.length < 1 || value.registrations.length > 16 || new Set(value.registrations).size !== value.registrations.length || value.registrations.some(id => !/^0x[0-9a-f]{64}$/.test(id))
      || !Number.isSafeInteger(value.refreshAheadSeconds) || value.refreshAheadSeconds < 60 || value.refreshAheadSeconds > 180 || !Number.isSafeInteger(value.pollIntervalMs) || value.pollIntervalMs < 15000 || value.pollIntervalMs > 60000
      || !/^[1-9]\d{0,14}$/.test(value.maxFeePerGasWei) || BigInt(value.maxFeePerGasWei) > 500000000000n || (value.keepWarmRequests!==undefined&&typeof value.keepWarmRequests!=='boolean') || !['on-demand','continuous'].includes(value.mode) || typeof value.enabled !== 'boolean' || !Number.isSafeInteger(value.validUntil) || value.validUntil < 0) throw new Error('Invalid reviewed oracle keeper configuration.');
  economyPolicy(value.economy);
  if (!value.economy || BigInt(value.economy.maxTransactionGasWei) > 300000000000000000n || BigInt(value.economy.maxDailyGasWei) > 4500000000000000000n || BigInt(value.economy.gasReserveWei) < 100000000000000000n) throw new Error('Keeper budget exceeds the faucet policy.');
  return value;
}
export function oracleTasks(views: { id: Hex; source: Address; monPublishedAt: string; usdPublishedAt: string }[], pyth: Address, now: bigint, ahead: number): OracleTask[] {
  const tasks: OracleTask[] = []; let usdQueued = false; const sources = new Set<string>();
  const due = (value: string) => { if (!/^(0|[1-9]\d{0,15})$/.test(value) || BigInt(value) > now) throw new Error('Invalid oracle publication time.'); return now - BigInt(value) >= BigInt(300 - ahead); };
  for (const view of views) {
    // USDC is shared across vaults; one update refreshes all of them.
    if (due(view.usdPublishedAt) && !usdQueued) { tasks.push({ registrationId: view.id, kind: 'usd', target: pyth }); usdQueued = true; }
    if (due(view.monPublishedAt) && !sources.has(view.source.toLowerCase())) { tasks.push({ registrationId: view.id, kind: 'mon', target: view.source }); sources.add(view.source.toLowerCase()); }
  }
  return tasks;
}
export function requireOracleCall(task: OracleTask, plan: { to?: string; data: Hex; value: string }, pyth: Address) {
  if (plan.to?.toLowerCase() !== task.target.toLowerCase() || (task.kind === 'usd' && task.target.toLowerCase() !== pyth.toLowerCase())) throw new Error('Keeper transaction target changed.');
  const decoded = decodeFunctionData({ abi: updateAbi, data: plan.data });
  const value = BigInt(plan.value);
  if (decoded.functionName !== (task.kind === 'mon' ? 'updateMon' : task.kind === 'checkpoint' ? 'checkpoint' : 'updatePriceFeeds') || value < 0n || value > (task.kind === 'usd' ? 1000000000000000n : 0n)) throw new Error('Keeper can only publish signed oracle updates within the update-fee ceiling.');
}

export function oracleKeeper(config: KeeperConfig, options: { root: string; network: VaultNetwork; market: TradingNetwork;
  account?: PrivateKeyAccount; client?: any; wallet?: any; trading?: ReturnType<typeof tradingService> }) {
  const c = checkedKeeper(config);
  if (options.network.chainId !== 10143 || options.market.chainId !== 10143 || options.market.oracle !== 'supra-pyth') throw new Error('Keeper only supports the reviewed Monad hybrid route.');
  const pyth = options.market.pyth;
  if (options.account && options.account.address !== c.address) throw new Error('Keeper account differs from the reviewed separate signer.');
  const client = options.client ?? readClient(options.network.rpcUrl);
  const broadcastClient = options.client ?? createPublicClient({ chain: monadTestnet, transport: http(options.network.rpcUrl, { retryCount: 0, timeout: 15000, methods: { include: ['eth_sendRawTransaction'] } }) });
  const records = registrationService({ directory: join(options.root, '.local/agent-registrations') });
  const trading = options.trading ?? tradingService(options.network, options.market, join(options.root, '.local/vault-trading'), () => records.records(), client);
  const wallet = options.wallet ?? (options.account && createWalletClient({ account: options.account, chain: monadTestnet, transport: http(options.network.rpcUrl, { retryCount: 0, timeout: 15000 }) }));
  const dir = join(options.root, '.local/oracle-keeper'), file = join(dir, `${c.address.toLowerCase()}.json`);
  const scope = JSON.stringify([c.chainId, c.address, c.controller, c.registrations]);
  let journal: KeeperJournal, active = false;
  async function load() {
    if (journal) return;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try { journal = JSON.parse(await readFile(file, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; journal = { scope, receipts: [] }; }
    if (journal.scope !== scope || !Array.isArray(journal.receipts)) throw new Error('Keeper journal differs from the reviewed scope.');
  }
  async function save() {
    const temp = file + '.tmp', handle = await open(temp, 'w', 0o600);
    try { await handle.writeFile(JSON.stringify(journal, null, 2)); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, file); const parent = await open(dir, 'r'); try { await parent.sync(); } finally { await parent.close(); }
  }
  async function inspect() {
    if (await client.getChainId() !== 10143) throw new Error('Keeper RPC is on another chain.');
    const head = await client.getBlock(); const views = [];
    const demand = c.mode === 'on-demand' ? await activeOracleDemand(c.registrations, options.root) : new Set(c.registrations);
    const pendingId = journal?.pending?.registrationId;
    if (pendingId && !c.registrations.includes(pendingId)) throw new Error('Pending keeper registration is outside the reviewed scope.');
    // Legacy pending recovery still inspects all pins. New requests read only their vaults.
    const selected = c.mode === 'on-demand' && !(journal?.pending && !pendingId)
      ? c.registrations.filter(id => demand.has(id) || id === pendingId) : c.registrations;
    for (const id of selected) {
      const inspection = trading.inspectForOracle ? await trading.inspectForOracle(id) : undefined;
      const view = inspection?.view ?? await trading.inspect(id);
      if (view.controller !== c.controller || view.manager === c.address || !view.bundle) throw new Error('Keeper targets must be deployed vaults owned by the configured controller, with a separate manager.');
      views.push({ ...view, id, prepareOraclePlan: inspection?.plan });
    }
    const now = (await client.getBlock()).timestamp; // Snapshot calls are paced; use fresh chain time.
    const eligible = views.filter(v => demand.has(v.id) && oracleRefreshEligible(v, c.mode === 'on-demand'));
    const tasks = oracleTasks(eligible.map(v => {
      let monPublishedAt=v.monPublishedAt, usdPublishedAt=v.usdPublishedAt; const g=v.bundle.guard;
      if(g){
        const mon=BigInt(monPublishedAt),usd=BigInt(usdPublishedAt),oldest=mon<usd?mon:usd;
        const advance=BigInt(g.candidateAt)>0n&&now>=BigInt(g.candidateAt)+60n&&oldest<BigInt(g.candidatePublication)+60n;
        const skew=mon>usd?mon-usd:usd-mon;
        // Refresh only the feed that has not advanced. Requiring both again
        // after every USDC receipt would continually starve the MON task.
        if((advance&&mon<BigInt(g.candidatePublication)+60n)||(skew>60n&&mon<usd))monPublishedAt='0';
        if((advance&&usd<BigInt(g.candidatePublication)+60n)||(skew>60n&&usd<mon))usdPublishedAt='0';
      }
      return {id:v.id,source:v.bundle.source,monPublishedAt,usdPublishedAt};
    }),pyth,now,c.refreshAheadSeconds);
    for(const v of eligible){
      const g=v.bundle.guard;if(!g)continue;
      const mon=BigInt(v.monPublishedAt),usd=BigInt(v.usdPublishedAt),oldest=mon<usd?mon:usd,skew=mon>usd?mon-usd:usd-mon;
      const stable=now>=mon&&now>=usd&&now-mon<=300n&&now-usd<=300n&&skew<=60n&&!v.blockers.some((x:string)=>/DEX|pool|MON price|USDC price/.test(x));
      const candidate=BigInt(g.candidateAt),accepted=BigInt(g.acceptedAt);
      const needs=candidate>0n?now>=candidate+60n&&oldest>=BigInt(g.candidatePublication)+60n:accepted===0n||((!v.valuation||now-accepted>=180n)&&now>=accepted+60n&&oldest>BigInt(g.acceptedPublication));
      if(stable&&needs)tasks.push({registrationId:v.id,kind:'checkpoint',target:g.address});
    }
    const balance = await client.getBalance({ address: c.address });
    return { head, now, tasks, balance, views, public: { address: c.address, chainId: 10143, fundedWei: String(balance), mode: c.mode, activeRequests: demand.size, enabled: c.enabled, validUntil: c.validUntil,
      due: tasks.map(t => ({ kind: t.kind, target: t.target })), vaults: views.map(v => ({ id: v.id, vault: v.vault, valuationAvailable: v.valuation, monPublishedAt: v.monPublishedAt, usdPublishedAt: v.usdPublishedAt })), economy: c.economy,
      scope: 'Keeper readiness only. No price is fabricated; current signature, freshness, liquidity and runtime checks still apply. Monitoring is not evidence of funded or continuous operation.' } };
  }
  return {
    inspect,
    async cycle(broadcast = false) {
      if (active) throw new Error('Keeper cycle is already running.'); active = true;
      let lock: Awaited<ReturnType<typeof open>> | undefined;
      try {
        await load();
        if (broadcast) { lock = await open(file + '.lock', 'wx', 0o600); await lock.writeFile(JSON.stringify({ pid: process.pid })); }
        // Reload after acquiring the cross-process lock. Another cycle may have advanced it.
        if (broadcast) { journal = undefined as unknown as KeeperJournal; await load(); }
        if (journal.lastReceipt) {
          const receipt = await client.getTransactionReceipt({ hash: journal.lastReceipt.hash });
          if (receipt.status !== journal.lastReceipt.status || receipt.blockHash !== journal.lastReceipt.blockHash || String(receipt.blockNumber) !== journal.lastReceipt.blockNumber || (await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) throw new Error('Keeper receipt changed; operator review required.');
        }
        // A mined receipt records an already-authorized update; it does not
        // authorize a new broadcast. Reconcile it without another full vault
        // snapshot, which can make the next feed miss the alignment window.
        if (broadcast && journal.pending?.registrationId) {
          const pending=journal.pending,pendingId=pending.registrationId!,tx=parseTransaction(pending.serialized);
          if(!c.registrations.includes(pendingId)||await client.getChainId()!==10143||keccak256(pending.serialized)!==pending.hash||tx.chainId!==10143||tx.to?.toLowerCase()!==pending.target.toLowerCase()||(await recoverTransactionAddress({serializedTransaction:pending.serialized as TransactionSerialized})).toLowerCase()!==c.address.toLowerCase())throw new Error('Invalid keeper pending transaction.');
          const fee=tx.maxFeePerGas??tx.gasPrice??0n;
          if(!tx.gas||fee<=0n||fee>BigInt(c.maxFeePerGasWei)||tx.gas*fee+(tx.value??0n)>BigInt(c.economy.maxTransactionGasWei))throw new Error('Pending keeper fee exceeds policy.');
          requireOracleCall({registrationId:pendingId,kind:pending.kind,target:pending.target},{to:tx.to,data:tx.data!,value:String(tx.value??0n)},pyth);
          let receipt;
          try{receipt=await client.getTransactionReceipt({hash:pending.hash});}catch(error){if((error as Error).name!=='TransactionReceiptNotFoundError')throw error;}
          if(receipt){
            if((await client.getBlock()).number<receipt.blockNumber+1n)return {state:'confirming',hash:pending.hash,due:[] as {kind:string;target:Address}[]};
            const block=await client.getBlock({blockNumber:receipt.blockNumber});
            if(block.hash!==receipt.blockHash)throw new Error('Keeper receipt is not canonical.');
            const budget=gasDay(journal.budget,block.timestamp),cost=BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice),value=receipt.status==='success'?(tx.value??0n):0n;
            journal.budget={...budget,trades:budget.trades+1,spentWei:String(BigInt(budget.spentWei)+cost+value)};
            journal.receipts.push({hash:pending.hash,status:receipt.status,gasCostWei:String(cost),valueWei:String(value),kind:pending.kind,target:pending.target});
            journal.lastReceipt={hash:pending.hash,status:receipt.status,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash};
            delete journal.pending;await save();
            return {state:receipt.status,hash:pending.hash,due:[] as {kind:string;target:Address}[],scope:'Canonical mined keeper receipt reconciled. New updates still require a fresh verified vault inspection.'};
          }
        }
        const state = await inspect();
        if (journal.pending) {
          const pending = journal.pending, tx = parseTransaction(pending.serialized);
          if (keccak256(pending.serialized) !== pending.hash || tx.chainId !== 10143 || tx.to?.toLowerCase() !== pending.target.toLowerCase() || (await recoverTransactionAddress({ serializedTransaction: pending.serialized as TransactionSerialized })).toLowerCase() !== c.address.toLowerCase()) throw new Error('Invalid keeper pending transaction.');
          const pendingFee = tx.maxFeePerGas ?? tx.gasPrice ?? 0n;
          if (!tx.gas || pendingFee <= 0n || pendingFee > BigInt(c.maxFeePerGasWei) || tx.gas * pendingFee + (tx.value ?? 0n) > BigInt(c.economy.maxTransactionGasWei)) throw new Error('Pending keeper fee exceeds policy.');
          requireOracleCall({ registrationId: c.registrations[0], kind: pending.kind, target: pending.target }, { to: tx.to, data: tx.data!, value: String(tx.value ?? 0n) }, pyth);
          const allowed = [pyth, ...state.views.flatMap(v => [v.bundle!.source,...(v.bundle?.guard?[v.bundle.guard.address]:[])])];
          if (!allowed.includes(pending.target)) throw new Error('Pending keeper target is outside the reviewed scope.');
          let receipt;
          try { receipt = await client.getTransactionReceipt({ hash: pending.hash }); } catch (e) { if ((e as Error).name !== 'TransactionReceiptNotFoundError') throw e; }
          if (!receipt) {
            if (broadcast) { try { await broadcastClient.sendRawTransaction({ serializedTransaction: pending.serialized }); } catch { /* Reconcile the same bytes next cycle. */ } }
            return { ...state.public, state: 'pending', hash: pending.hash };
          }
          if ((await client.getBlock()).number < receipt.blockNumber + 1n) return { ...state.public, state: 'confirming', hash: pending.hash };
          const block = await client.getBlock({ blockNumber: receipt.blockNumber });
          if (block.hash !== receipt.blockHash) throw new Error('Keeper receipt is not canonical.');
          if (broadcast) {
            const budget = gasDay(journal.budget, block.timestamp), cost = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice), value = receipt.status === 'success' ? (tx.value ?? 0n) : 0n;
            journal.budget = { ...budget, trades: budget.trades + 1, spentWei: String(BigInt(budget.spentWei) + cost + value) };
            journal.receipts.push({ hash: pending.hash, status: receipt.status, gasCostWei: String(cost), valueWei: String(value), kind: pending.kind, target: pending.target });
            journal.lastReceipt = { hash: pending.hash, status: receipt.status, blockNumber: String(receipt.blockNumber), blockHash: receipt.blockHash };
            delete journal.pending; await save();
          }
          return { ...state.public, state: receipt.status, hash: pending.hash };
        }
        const task = state.tasks[0];
        if (!task) {
          if (broadcast && c.mode === 'on-demand' && !c.keepWarmRequests) { for (const view of state.views.filter(v => !v.paused && v.configured && v.valuation)) { try { await unlink(join(options.root, '.local/oracle-keeper-demand', `${view.id.slice(2)}.json`)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } } }
          return { ...state.public, state: state.public.activeRequests ? 'fresh-or-blocked' : 'idle' };
        }
        const preparePlan = (task: OracleTask, account: Address) => {
          const action = task.kind === 'mon' ? 'update-mon-price' : task.kind === 'checkpoint' ? 'checkpoint-valuation' : 'update-prices';
          const prepared = state.views.find(v => v.id === task.registrationId)?.prepareOraclePlan;
          return prepared ? prepared(action, account) : trading.plan(task.registrationId, action, account);
        };
        const plan = await preparePlan(task, broadcast ? c.address : c.controller);
        requireOracleCall(task, plan, pyth);
        const gas = BigInt(plan.gas), gasPrice = await client.getGasPrice(), value = BigInt(plan.value);
        const expected = gas * gasPrice + value;
        const estimates = { expectedUpdateCostWei: String(expected), projectedContinuousDayCostWei: String(expected * 86400n / BigInt(300 - c.refreshAheadSeconds) * BigInt(state.views.length + 1)),
          scope: 'Approximation using this update estimate and configured cadence; MON and USDC update costs differ. Budget exhaustion deliberately permits staleness rather than overspending.' };
        if (!broadcast) {
          const costs = [{ kind: task.kind, target: task.target, estimatedCostWei: String(expected) }];
          for (const other of state.tasks.slice(1)) {
            const review = await preparePlan(other, c.controller);
            requireOracleCall(other, review, pyth);
            costs.push({ kind: other.kind, target: other.target, estimatedCostWei: String(BigInt(review.gas) * gasPrice + BigInt(review.value)) });
          }
          const cycleCost = costs.reduce((sum, x) => sum + BigInt(x.estimatedCostWei), 0n);
          return { ...state.public, ...estimates, estimates: costs, estimatedRefreshCycleCostWei: String(cycleCost), projectedContinuousDayCostWei: String(cycleCost * 86400n / BigInt(300 - c.refreshAheadSeconds)), simulationAccount: c.controller, state: 'simulated-no-broadcast' };
        }
        if (!c.enabled || BigInt(c.validUntil) <= state.now || BigInt(c.validUntil) > state.now + 86400n || !wallet || !options.account) throw new Error('Keeper requires an explicitly enabled, unexpired one-day-or-shorter budget and separate signer.');
        const budget = gasDay(journal.budget, state.now); requireActivityBudget(c.economy, budget, state.now);
        const request = await wallet.prepareTransactionRequest({ account: options.account, to: task.target, data: plan.data, value, gas });
        const latest = await client.getBlock();
        // EIP-1559 estimates commonly reserve 2x base fee. Clamp only when the
        // current base fee + tip still fits the reviewed total transaction cap.
        const affordableFee = (BigInt(c.economy.maxTransactionGasWei) - value) / gas;
        const priceCeiling = affordableFee < BigInt(c.maxFeePerGasWei) ? affordableFee : BigInt(c.maxFeePerGasWei);
        if (request.maxFeePerGas !== undefined && request.maxFeePerGas > priceCeiling) {
          if (latest.baseFeePerGas === null || latest.baseFeePerGas === undefined || priceCeiling < BigInt(latest.baseFeePerGas) + BigInt(request.maxPriorityFeePerGas ?? 0n)) throw new Error('Current base fee does not fit the keeper cap.');
          request.maxFeePerGas = priceCeiling;
        }
        const fee = request.maxFeePerGas ?? request.gasPrice ?? 0n;
        if (fee <= 0n || fee > BigInt(c.maxFeePerGasWei) || gas > 3000000n) throw new Error('Keeper gas estimate exceeds the reviewed ceiling.');
        const maximum = requireGasBudget(c.economy, state.balance - value, gas, fee, BigInt(budget.spentWei) + value) + value;
        if (maximum > BigInt(c.economy.maxTransactionGasWei)) throw new Error('Keeper total update cost exceeds the per-transaction ceiling.');
        if (latest.timestamp > state.now + 60n || latest.timestamp >= BigInt(c.validUntil)) throw new Error('Keeper plan expired during preparation.');
        await client.call({ account: c.address, to: task.target, data: plan.data, value });
        const serialized = await wallet.signTransaction(request), hash = keccak256(serialized);
        journal.pending = { hash, serialized, target: task.target, kind: task.kind, registrationId: task.registrationId, submittedAt: String(latest.timestamp), maximumCostWei: String(maximum) }; await save();
        await broadcastClient.sendRawTransaction({ serializedTransaction: serialized });
        return { ...state.public, state: 'submitted', hash };
      } finally { if (lock) { await lock.close(); await unlink(file + '.lock'); } active = false; }
    },
  };
}
