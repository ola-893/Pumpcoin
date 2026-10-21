import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, getAddress, keccak256, parseAbi, type Hex } from 'viem';
import { liveVaultService } from '../agent-registration/live-vault.js';
import type { RegistrationRecord } from '../agent-registration/types.js';
import { vaultArtifact } from '../agent-registration/vault-setup.js';
import { strategyBindingHash, riskBindingHash } from '../agent-registration/core.js';
import { identityURI } from '../agent-registration/binding.js';
import { agentStateService } from '../agent-registration/agent-state.js';
import { agentStateKey, restoreAgentState, saveAgentState } from '../app/src/lib/agent-state-cache.js';
import { readAgentState, chainLabel, activityLabel } from '../app/src/lib/agent-state.js';
import { prepareManifest, initialDraft } from '../app/src/lib/registration.js';
import type { VaultNetwork } from '../agent-registration/vault-setup.js';

const address = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`), hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const code = '0x6000' as const, codeHash = keccak256(code), zeroSlot = hash(0), id = hash(1), vault = address(4);
const network: VaultNetwork = { chainId: 10143, rpcUrl: 'https://testnet-rpc.monad.xyz', identityRegistry: address(1), identityCodeHash: codeHash,
  quote: address(2), quoteCodeHash: codeHash, position: address(3), positionCodeHash: codeHash, positionDecimals: 18 };
const prepared = prepareManifest({ ...initialDraft, name: 'Observed agent', controller: address(8), executionKey: address(9), model: 'actual-local', modelSource: 'https://example.com/weights.gguf', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), strategyCodeHash: 'c'.repeat(64), strategy: 'Observe actual state without substituted agent values.', pair: 'WMON / USDC', tradeCap: '10', exposureCap: '50', selfHosted: true });
const record = { id, authorization: { challenge: { chainId: 10143 } }, manifest: prepared.manifest, commitment: prepared.commitment, binding: { chainId: 10143, vault, identityRegistry: network.identityRegistry, agentId: '42' } } as unknown as RegistrationRecord;
const eventAbi = parseAbi(['event Deposit(address indexed sender,address indexed owner,uint256 assets,uint256 shares)']);
const log = { address: vault, transactionHash: hash(7), blockNumber: 950n, blockHash: hash(950), logIndex: 0, removed: false,
  topics: encodeEventTopics({ abi: eventAbi, eventName: 'Deposit', args: { sender: address(8), owner: address(8) } }),
  data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [1000000n, 1000000000000n]) };
function mock(options: { missingReceiptLog?: boolean; reorg?: boolean; wrongCommitment?: boolean; wrongChain?: boolean; permission?: boolean; changedOwner?: boolean; editedURI?: boolean; wrongRuntime?: boolean; availableNav?: boolean; changedStrategy?: boolean } = {}) {
  let calls = 0;
  const client = {
    getChainId: async () => options.wrongChain ? 31337 : 10143,
    getCode: async ({ address: a }: any) => a === vault && !options.wrongRuntime ? vaultArtifact().deployedBytecode.object : code, getStorageAt: async () => zeroSlot,
    getBlock: async (query: any) => ({ number: query.blockNumber ?? 1000n, timestamp: 200000n, hash: query.blockNumber === 1000n && options.reorg ? hash(9999) : hash(Number(query.blockNumber ?? 1000n)) }),
    readContract: async ({ address: a, functionName: f }: any) => {
      calls++;
      if (f === 'decimals') return a === vault ? 12 : a === network.quote ? 6 : 18;
      if (f === 'asset') return network.quote; if (f === 'positionAsset') return network.position;
      if (f === 'registrationCommitment') return options.wrongCommitment ? hash(6) : record.commitment;
      if (f === 'strategyHash') return options.changedStrategy ? hash(100) : strategyBindingHash(prepared);
      if (f === 'riskHash') return riskBindingHash(prepared);
      if (f === 'identityRegistry') return network.identityRegistry;
      if (f === 'agentId') return 42n;
      if (f === 'ownerOf') return options.changedOwner ? address(10) : address(8);
      if (f === 'tokenURI') return options.editedURI ? 'edited' : identityURI(prepared);
      if (f === 'symbol') return a === network.quote ? 'pUSD' : 'WMON';
      if (f === 'valuationSource') return address(11);
      if (f === 'perTradeCap') return 10000000n;
      if (f === 'maxPositionValue') return 50000000n;
      if (f === 'expenseBudget') return 1000000n;
      if (f === 'CONFIG_DELAY') return 86400n;
      if (f === 'status') return [!!options.availableNav, hash(99)];
      if (f === 'admin') return address(8); if (f === 'manager') return address(9);
      if (f === 'currentConfigHash') return hash(10); if (f === 'paused') return false;
      if (f === 'balanceOf') return a === network.quote ? 1000000n : 5n * 10n ** 18n;
      if (f === 'totalSupply') return 10n ** 12n;
      if (f === 'totalAssets') { if (options.availableNav) return 3000000n; throw new Error('Valuation unavailable'); }
      if (!options.permission) throw new Error('Old vault function missing');
      if (f === 'tradingPermissionRequired') return true;
      if (f === 'tradingPermission') return [300000n, 50, 3000000n, 1n, 1n];
      if (f === 'managerVersion' || f === 'tradeConfigVersion') return 1n;
      if (f === 'dailyQuoteTraded') return 1000000n;
      throw new Error(`Unexpected ${f}`);
    },
    getLogs: async ({ fromBlock, toBlock }: any) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock ? [log] : [],
    getTransactionReceipt: async () => ({ transactionHash: log.transactionHash, blockNumber: log.blockNumber, blockHash: log.blockHash, status: 'success', logs: options.missingReceiptLog ? [] : [log] }),
    getTransaction: async () => ({ hash: log.transactionHash, from: address(8) }),
  };
  return { client, calls: () => calls };
}
test('live view uses Monad receipts, preserves unavailable NAV and discloses bounded history', async () => {
  const fixture = mock(); const service = liveVaultService(network, async () => [record], fixture.client);
  const [a, b] = await Promise.all([service.inspect(id), service.inspect(id)]);
  assert.equal(a, b); assert.equal(a.chainId, 10143); assert.equal(a.nav, undefined); assert.equal(a.permissionSupported, false);
  assert.equal(a.history.completePerformanceHistory, false); assert.equal(a.history.fromBlock, '1');
  assert.equal(a.shares, '1000000000000'); assert.equal(a.shareDecimals, 12);
  assert.equal(a.transactions[0].sender, address(8)); assert.equal(a.transactions[0].events[0].name, 'Deposit');
  assert.equal(a.transactions[0].events[0].values.assets, '1000000');
  const before = fixture.calls(); await service.inspect(id); assert.equal(fixture.calls(), before);
});
test('live view distinguishes an active permission from an older vault', async () => {
  const { client } = mock({ permission: true });
  const data = await liveVaultService(network, async () => [record], client).inspect(id);
  assert.equal(data.permissionSupported, true); assert.equal(data.permission?.active, true); assert.equal(data.permission?.dailyQuoteTraded, '1000000');
});
for (const [name, options, message] of [
  ['wrong chain', { wrongChain: true }, /another chain/],
  ['foreign vault commitment', { wrongCommitment: true }, /binding differs/],
  ['missing receipt log', { missingReceiptLog: true }, /match the vault receipt/],
  ['changed anchor block', { reorg: true }, /Chain changed/],
] as const) test(`live view rejects ${name}`, async () => {
  const { client } = mock(options);
  await assert.rejects(liveVaultService(network, async () => [record], client).inspect(id), message);
});
test('local simulation bindings cannot appear as live Monad evidence', async () => {
  const { client } = mock();
  await assert.rejects(liveVaultService(network, async () => [{ ...record, binding: { ...record.binding!, chainId: 31337 } }], client).inspect(id), /simulations are excluded/);
});

test('current identity changes are returned as mismatches, never as fixed verified badges', async () => {
  const { client } = mock({ changedOwner: true, editedURI: true });
  const data = await liveVaultService(network, async () => [record], client).inspect(id);
  assert.equal(data.identity.owner, address(10));
  assert.equal(data.identity.ownerMatchesDeclaration, false);
  assert.equal(data.identity.manifestMatchesDeclaration, false);
  assert.equal(data.mandate.perTradeQuoteUnits, '10000000');
  assert.equal(data.quote.symbol, 'pUSD');
  assert.equal(data.valuation.reason, hash(99));
  assert.equal(data.activity.depositedQuoteUnits, '1000000');
  assert.equal(data.activity.deposits, 1);
  assert.equal(data.activity.trades, 0);
});
test('agent state preserves independent chain/runtime failures and rejects foreign or altered observations', async () => {
  const fixture = mock({ availableNav: true });
  const live = liveVaultService(network, async () => [record], fixture.client);
  const runtime = { status: async () => ({ configured: true, running: false, state: 'stopped' as const, changedAt: new Date().toISOString(), message: 'Stopped on this host.' }) };
  const api = agentStateService(async () => [record], live, runtime);
  const data = readAgentState(await api.inspect(id), record);
  assert.equal(data.observation?.nav, '3000000');
  assert.equal(chainLabel(data), 'Vault enabled');
  assert.match(activityLabel(data), /0 observed trades/);
  assert.equal(chainLabel(data, true), 'Earlier chain snapshot');
  for (const edit of [
    (x: any) => { x.registrationId = hash(20); },
    (x: any) => { x.manifestCommitment = hash(20); },
    (x: any) => { x.observation.vault = address(20); },
    (x: any) => { x.observation.activity.depositedQuoteUnits = 'NaN'; },
    (x: any) => { x.observation.quote.decimals = 1.5; },
  ]) { const altered = structuredClone(data); edit(altered); assert.throws(() => readAgentState(altered, record)); }
  const failed = await agentStateService(async () => [record], { inspect: async () => { throw new Error('Canonical block changed.'); } }, runtime).inspect(id);
  assert.equal(failed.observation, undefined); assert.equal(failed.runtime?.state, 'stopped');
  assert.equal(chainLabel(readAgentState(failed, record)), 'Chain check unavailable');
  await assert.rejects(api.inspect(hash(200)), /not found/);
});
test('unreviewed vault runtime cannot support a live state claim', async () => {
  await assert.rejects(liveVaultService(network, async () => [record], mock({ wrongRuntime: true }).client).inspect(id), /runtime differs/);
});

test('changed enforced strategy is disclosed independently of unchanged registry ownership', async () => {
  const observation = await liveVaultService(network, async () => [record], mock({ changedStrategy: true }).client).inspect(id);
  const runtime = { configured: true, running: false, state: 'stopped' as const, changedAt: new Date().toISOString(), message: 'Stopped.' };
  const state = readAgentState({ registrationId: record.id, manifestCommitment: record.commitment, vault, checkedAt: new Date().toISOString(), observation, runtime }, record);
  assert.equal(observation.identity.ownerMatchesDeclaration, true);
  assert.equal(observation.identity.strategyMatchesDeclaration, false);
  assert.equal(chainLabel(state), 'Identity/configuration changed');
  const edited = structuredClone(state); edited.observation!.identity.strategyMatchesDeclaration = true;
  assert.throws(() => readAgentState(edited, record));
});

test('display cache returns a timestamped snapshot immediately while one refresh is in flight', async () => {
  let now = 1000;
  const fixture = mock();
  const service = liveVaultService(network, async () => [record], fixture.client, { now: () => now });
  const first = await service.inspect(id);
  now += 61000;
  let release!: () => void;
  const original = fixture.client.getBlock;
  fixture.client.getBlock = async (query: any) => {
    if (query.blockTag === 'latest') await new Promise<void>(r => { release = r; });
    return original(query);
  };
  const [a, b] = await Promise.all([service.inspect(id, { allowStale: true }), service.inspect(id, { allowStale: true })]);
  assert.equal(a, first); assert.equal(b, first);
  assert.equal(a.checkedAt, first.checkedAt);
  assert.equal(service.cacheStatus(id).refreshing, true);
  // A blocking caller shares the same refresh; it never receives the stale value.
  const fresh = service.inspect(id);
  await new Promise<void>(r => setImmediate(r)); release();
  await fresh;
  assert.equal(service.cacheStatus(id).refreshing, false);
});
test('failed background refresh exposes the failure without changing the last observed snapshot', async () => {
  let now = 1000;
  const fixture = mock();
  const service = liveVaultService(network, async () => [record], fixture.client, { now: () => now });
  const first = await service.inspect(id);
  now += 61000;
  fixture.client.getBlock = async () => { throw new Error('Provider unavailable.'); };
  assert.equal(await service.inspect(id, { allowStale: true }), first);
  await new Promise<void>(r => setImmediate(r));
  assert.match(String(service.cacheStatus(id).error), /Provider unavailable/);
  assert.equal((await service.inspect(id, { allowStale: true })).checkedAt, first.checkedAt);
  await assert.rejects(service.inspect(id), /Provider unavailable/);
});
test('saved public snapshots are scoped, revalidated and expire without changing source timestamps', async () => {
  const observation = await liveVaultService(network, async () => [record], mock().client).inspect(id);
  const data = { registrationId: record.id, manifestCommitment: record.commitment, vault, checkedAt: observation.checkedAt, observation,
    runtime: { configured: true, running: false, state: 'stopped' as const, changedAt: observation.checkedAt, message: 'Stopped.' } };
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  saveAgentState(storage, record, data);
  assert.deepEqual(restoreAgentState(storage, record), data);
  assert.notDeepEqual(agentStateKey(record), agentStateKey({ ...record, binding: { ...record.binding!, vault: address(30) } }));
  assert.equal(restoreAgentState(storage, { ...record, binding: { ...record.binding!, vault: address(30) } }), undefined);
  const key = JSON.stringify(agentStateKey(record));
  const edited = structuredClone(data); edited.observation.vault = address(30); storage.setItem(key, JSON.stringify(edited));
  assert.equal(restoreAgentState(storage, record), undefined);
  saveAgentState(storage, record, data);
  assert.equal(restoreAgentState(storage, record, Date.parse(data.checkedAt) + 16 * 60000), undefined);
  assert.equal(values.size, 0);
});
