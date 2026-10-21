import { decodeEventLog, getAddress, parseAbi, type Hex } from 'viem';
import { strategyBindingHash, riskBindingHash } from './core.js';
import { identityURI } from './binding.js';
import { normalized, networkChecks, vaultArtifact, vaultClient, vaultNetwork, type VaultNetwork } from './vault-setup.js';
import { autonomousAbi } from './autonomous.js';
import type { RegistrationRecord, LiveVaultObservation } from './types.js';

const abi = parseAbi(['function admin() view returns(address)', 'function manager() view returns(address)',
  'function registrationCommitment() view returns(bytes32)', 'function asset() view returns(address)', 'function positionAsset() view returns(address)',
  'function paused() view returns(bool)', 'function currentConfigHash() view returns(bytes32)',
  'function totalSupply() view returns(uint256)', 'function totalAssets() view returns(uint256)',
  'function balanceOf(address) view returns(uint256)', 'function decimals() view returns(uint8)', 'function symbol() view returns(string)',
  'function valuationSource() view returns(address)', 'function perTradeCap() view returns(uint256)', 'function maxPositionValue() view returns(uint256)',
  'function expenseBudget() view returns(uint256)', 'function CONFIG_DELAY() view returns(uint256)', 'function DEMO_CONFIG_DELAY() view returns(uint256)',
  'function strategyHash() view returns(bytes32)', 'function riskHash() view returns(bytes32)', 'function identityRegistry() view returns(address)', 'function agentId() view returns(uint256)',
  'function ownerOf(uint256) view returns(address)', 'function tokenURI(uint256) view returns(string)', 'function status() view returns(bool,bytes32)']);
export type { LiveVaultObservation } from "./types.js";
const publicValues = (value: unknown): unknown => typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(publicValues)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, publicValues(v)])) : value;

/** A bounded live activity view, deliberately not a performance/accounting export. */
export function liveVaultService(config: VaultNetwork, records: () => Promise<RegistrationRecord[]>, client: any = vaultClient(config), options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const network = vaultNetwork(config), cache = new Map<string, { at: number; value: LiveVaultObservation }>(), pending = new Map<string, Promise<LiveVaultObservation>>();
  const failures = new Map<string, { at: number; error: unknown }>(), scopes = new Map<string, string>();
  async function collect(record: RegistrationRecord) {
    if (!record?.binding || record.binding.chainId !== 10143 || network.chainId !== 10143) throw new Error('Select a verified Monad testnet vault. Local simulations are excluded from live evidence.');
    const vault = getAddress(record.binding.vault), block = await client.getBlock({ blockTag: 'latest' });
    if (block.number === null || !block.hash) throw new Error('Live evidence could not anchor a block.');
    await networkChecks(network, client, block.number);
    const code = await client.getCode({ address: vault, blockNumber: block.number });
    if (!code || code === '0x') throw new Error('The selected vault is not deployed at this block.');
    const read = (address: string, functionName: string, args: unknown[] = [], contractAbi: any = abi) => client.readContract({ address: getAddress(address), abi: contractAbi, functionName, args, blockNumber: block.number });
    const artifact = vaultArtifact(!!record.manifest.vaultPolicy);
    if (code.length !== artifact.deployedBytecode.object.length || normalized(code, artifact.deployedBytecode.immutableReferences) !== normalized(artifact.deployedBytecode.object, artifact.deployedBytecode.immutableReferences)) throw new Error('Vault runtime differs from the reviewed artifact.');
    const names = ['registrationCommitment', 'asset', 'positionAsset', 'admin', 'manager', 'paused', 'currentConfigHash', 'totalSupply', 'decimals', 'valuationSource', 'perTradeCap', 'maxPositionValue', 'expenseBudget', 'strategyHash', 'riskHash', 'identityRegistry', 'agentId'];
    const values = await Promise.all(names.map(name => read(vault, name))), v = Object.fromEntries(names.map((name, i) => [name, values[i]]));
    if (v.registrationCommitment !== record.commitment || v.asset !== network.quote || v.positionAsset !== network.position) throw new Error('Live vault binding differs from this registration.');
    if (v.identityRegistry !== network.identityRegistry) throw new Error('Current identity registry differs from the reviewed registry.');
    const [cash, position, quoteDecimals, quoteSymbol, positionDecimals, positionSymbol, owner, uri, notice, valuationResult, navResult] = await Promise.all([
      read(network.quote, 'balanceOf', [vault]), read(network.position, 'balanceOf', [vault]),
      read(network.quote, 'decimals'), read(network.quote, 'symbol'), read(network.position, 'decimals'), read(network.position, 'symbol'),
      read(v.identityRegistry, 'ownerOf', [v.agentId]), read(v.identityRegistry, 'tokenURI', [v.agentId]),
      read(vault, record.manifest.vaultPolicy ? 'DEMO_CONFIG_DELAY' : 'CONFIG_DELAY'),
      read(v.valuationSource, 'status').then((value: any) => ({ value }), () => ({ value: undefined })),
      read(vault, 'totalAssets').then((value: any) => ({ value }), () => ({ value: undefined })),
    ]);
    const controller = v.admin, manager = v.manager, paused = v.paused, configHash = v.currentConfigHash, shares = v.totalSupply, shareDecimals = v.decimals;
    const nav = navResult.value === undefined ? undefined : String(navResult.value);
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const prepared = { manifest: record.manifest, commitment: record.commitment, privateRuntimeConfig: { inferenceBaseURL: '' } };
    const identity = { strategyHash: v.strategyHash, riskHash: v.riskHash, strategyMatchesDeclaration: v.strategyHash === strategyBindingHash(prepared), riskMatchesDeclaration: v.riskHash === riskBindingHash(prepared),
      mandateMatchesDeclaration: String(v.perTradeCap) === record.manifest.proposedMandate.perTradeQuoteUnits && String(v.maxPositionValue) === record.manifest.proposedMandate.maxPositionQuoteUnits, publishedManifestURI: uri, registry: v.identityRegistry, agentId: String(v.agentId), owner,
      ownerMatchesDeclaration: same(owner, record.manifest.controller), manifestMatchesDeclaration: uri === identityURI(prepared),
      bindingMatchesRecord: same(v.identityRegistry, record.binding.identityRegistry) && String(v.agentId) === record.binding.agentId,
      controllerMatchesDeclaration: same(controller, record.manifest.controller), managerMatchesDeclaration: same(manager, record.manifest.executionKey) };
    const valuation = { source: v.valuationSource, available: nav !== undefined && valuationResult.value?.[0] === true,
      ...(valuationResult.value === undefined ? { reason: 'The valuation-source status read did not return a value at this block.' } : valuationResult.value?.[0] === false ? { reason: String(valuationResult.value[1]) } : nav === undefined ? { reason: 'The vault NAV read did not return a value at this block.' } : {}) };
    let permission: LiveVaultObservation['permission'];
    let permissionSupported = false;
    try {
      const [required, p, managerVersion, configVersion, spent] = await Promise.all([read(vault, 'tradingPermissionRequired', [], autonomousAbi), read(vault, 'tradingPermission', [], autonomousAbi), read(vault, 'managerVersion', [], autonomousAbi), read(vault, 'tradeConfigVersion', [], autonomousAbi), read(vault, 'dailyQuoteTraded', [block.timestamp / 86400n], autonomousAbi)]);
      permissionSupported = true;
      permission = { active: !!required && !paused && p[0] > block.timestamp && p[2] > 0n && p[3] === managerVersion && p[4] === configVersion,
        validUntil: String(p[0]), dailyQuoteCap: String(p[2]), dailyQuoteTraded: String(spent) };
    } catch { /* Old immutable vaults do not expose the permission interface. */ }
    const from = block.number > 999n ? block.number - 999n : 0n;
    const logs: any[] = [];
    const ranges: { start: bigint; end: bigint }[] = [];
    for (let start = from; start <= block.number; start += 100n) ranges.push({ start, end: start + 99n < block.number ? start + 99n : block.number });
    const batches = await Promise.all(ranges.map(({ start, end }) => client.getLogs({ address: vault, fromBlock: start, toBlock: end })));
    for (const [i, { start, end }] of ranges.entries()) {
      const batch = batches[i];
      if (!Array.isArray(batch) || batch.length > 2000 || logs.length + batch.length > 5000) throw new Error('Recent vault activity exceeds this view’s coverage limit.');
      for (const log of batch) {
        if (log.removed || !log.transactionHash || log.blockNumber < start || log.blockNumber > end || log.address.toLowerCase() !== vault.toLowerCase()) throw new Error('RPC returned inconsistent vault activity.');
      }
      logs.push(...batch);
    }
    logs.sort((a, b) => a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
    const hashes = [...new Set<Hex>(logs.map(l => l.transactionHash))].reverse();
    const transactions: LiveVaultObservation['transactions'] = [];
    const eventAbi = artifact.abi;
    for (const hash of hashes) {
      const [receipt, transaction] = await Promise.all([client.getTransactionReceipt({ hash }), client.getTransaction({ hash })]);
      if (receipt.status !== 'success' && receipt.logs.length) throw new Error('A reverted receipt returned inconsistent vault events.');
      const selected = logs.filter(l => l.transactionHash === hash);
      if (receipt.transactionHash !== hash || transaction.hash !== hash || receipt.blockNumber > block.number || selected.some(l => l.blockHash !== receipt.blockHash || l.blockNumber !== receipt.blockNumber)) throw new Error('Vault activity disagrees with its mined receipt.');
      if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) throw new Error('A vault receipt is no longer canonical. Refresh live evidence.');
      // Read events from the actual receipt and compare every selected log byte-for-byte.
      for (const log of selected) {
        const actual = receipt.logs.find((l: any) => l.logIndex === log.logIndex);
        if (!actual || actual.address.toLowerCase() !== vault.toLowerCase() || actual.data !== log.data || JSON.stringify(actual.topics) !== JSON.stringify(log.topics)) throw new Error('RPC logs do not match the vault receipt.');
      }
      const events = receipt.logs.filter((l: any) => l.address.toLowerCase() === vault.toLowerCase()).map((l: any) => {
        try { const e = decodeEventLog({ abi: eventAbi, data: l.data, topics: l.topics }); return { name: e.eventName, values: publicValues(e.args) as Record<string, unknown> }; }
        catch { return { name: 'Unrecognized vault event', values: {} }; }
      });
      transactions.push({ hash, blockNumber: String(receipt.blockNumber), blockHash: receipt.blockHash, sender: getAddress(transaction.from), status: receipt.status, events });
    }
    const allEvents = transactions.flatMap(tx => tx.events);
    const deposits = allEvents.filter(e => e.name === 'Deposit'), withdrawals = allEvents.filter(e => e.name === 'Withdraw');
    const activity = { trades: allEvents.filter(e => e.name === 'ManagerTrade').length, deposits: deposits.length, withdrawals: withdrawals.length,
      depositedQuoteUnits: deposits.reduce((sum, e) => sum + BigInt(String(e.values.assets)), 0n).toString(),
      withdrawnQuoteUnits: withdrawals.reduce((sum, e) => sum + BigInt(String(e.values.assets)), 0n).toString() };
    let deploymentBlock: string | undefined;
    if (record.binding.deploymentTransaction) {
      const deployment = await client.getTransactionReceipt({ hash: record.binding.deploymentTransaction });
      if (deployment.status !== 'success' || !deployment.contractAddress || !same(deployment.contractAddress, vault) || (await client.getBlock({ blockNumber: deployment.blockNumber })).hash !== deployment.blockHash) throw new Error('Vault deployment provenance could not be confirmed.');
      deploymentBlock = String(deployment.blockNumber);
    }
    if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Chain changed during the live evidence check. Refresh.');
    return { chainId: 10143 as const, vault, blockNumber: String(block.number), blockHash: block.hash, checkedAt: new Date().toISOString(), controller, manager, paused, configHash,
      cash: String(cash), position: String(position), positionDecimals, shares: String(shares), shareDecimals, ...(nav !== undefined ? { nav } : {}),
      quote: { address: network.quote, decimals: quoteDecimals, symbol: quoteSymbol }, positionToken: { address: network.position, decimals: positionDecimals, symbol: positionSymbol },
      identity, valuation, mandate: { perTradeQuoteUnits: String(v.perTradeCap), maxPositionQuoteUnits: String(v.maxPositionValue), expenseBudget: String(v.expenseBudget), configurationNoticeSeconds: String(notice) }, activity,
      permissionSupported, ...(permission ? { permission } : {}), history: { fromBlock: String(from), toBlock: String(block.number), transactionLimit: 10, ...(deploymentBlock ? { deploymentBlock } : {}), completePerformanceHistory: false }, transactions: transactions.slice(0, 10) };
  }
  function refresh(key: string, record: RegistrationRecord) {
    const current = pending.get(key); if (current) return current;
    const task = collect(record).then(value => { cache.set(key, { at: now(), value }); failures.delete(key); return value; })
      .catch(error => { failures.set(key, { at: now(), error }); throw error; })
      .finally(() => pending.delete(key));
    pending.set(key, task); return task;
  }
  return {
    cacheStatus(id: string) {
      const key = scopes.get(id);
      return { refreshing: !!key && pending.has(key), error: key ? failures.get(key)?.error : undefined };
    },
    async inspect(id: string, policy: { allowStale?: boolean; force?: boolean } = {}): Promise<LiveVaultObservation> {
      if (!/^0x[0-9a-f]{64}$/i.test(id)) throw new Error('Invalid registration identifier.');
      const record = (await records()).find(r => r.id === id);
      if (!record) throw new Error('Agent registration not found.');
      // Same ID with a changed binding must never reuse another vault's snapshot.
      const key = JSON.stringify([id, record.commitment, record.binding, record.manifest.vaultPolicy]);
      scopes.set(id, key);
      const hit = cache.get(key), age = hit ? now() - hit.at : Infinity;
      if (hit && age < 60000 && !policy.force) return hit.value;
      if (hit && policy.allowStale && age < 15 * 60000) {
        const failure = failures.get(key);
        if (policy.force || !failure || now() - failure.at >= 30000) void refresh(key, record).catch(() => undefined);
        return hit.value;
      }
      return refresh(key, record);
    },
  };
}
