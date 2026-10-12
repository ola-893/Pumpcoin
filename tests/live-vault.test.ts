import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, getAddress, keccak256, parseAbi, type Hex } from 'viem';
import { liveVaultService } from '../agent-registration/live-vault.js';
import type { RegistrationRecord } from '../agent-registration/types.js';
import type { VaultNetwork } from '../agent-registration/vault-setup.js';

const address = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`), hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const code = '0x6000' as const, codeHash = keccak256(code), zeroSlot = hash(0), id = hash(1), vault = address(4);
const network: VaultNetwork = { chainId: 10143, rpcUrl: 'https://testnet-rpc.monad.xyz', identityRegistry: address(1), identityCodeHash: codeHash,
  quote: address(2), quoteCodeHash: codeHash, position: address(3), positionCodeHash: codeHash, positionDecimals: 18 };
const record = { id, commitment: hash(5), binding: { chainId: 10143, vault } } as unknown as RegistrationRecord;
const eventAbi = parseAbi(['event Deposit(address indexed sender,address indexed owner,uint256 assets,uint256 shares)']);
const log = { address: vault, transactionHash: hash(7), blockNumber: 950n, blockHash: hash(950), logIndex: 0, removed: false,
  topics: encodeEventTopics({ abi: eventAbi, eventName: 'Deposit', args: { sender: address(8), owner: address(8) } }),
  data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [1000000n, 1000000000000n]) };
function mock(options: { missingReceiptLog?: boolean; reorg?: boolean; wrongCommitment?: boolean; wrongChain?: boolean; permission?: boolean } = {}) {
  let calls = 0;
  const client = {
    getChainId: async () => options.wrongChain ? 31337 : 10143,
    getCode: async () => code, getStorageAt: async () => zeroSlot,
    getBlock: async (query: any) => ({ number: query.blockNumber ?? 1000n, timestamp: 200000n, hash: query.blockNumber === 1000n && options.reorg ? hash(9999) : hash(Number(query.blockNumber ?? 1000n)) }),
    readContract: async ({ address: a, functionName: f }: any) => {
      calls++;
      if (f === 'decimals') return a === vault ? 12 : a === network.quote ? 6 : 18;
      if (f === 'asset') return network.quote; if (f === 'positionAsset') return network.position;
      if (f === 'registrationCommitment') return options.wrongCommitment ? hash(6) : record.commitment;
      if (f === 'admin') return address(8); if (f === 'manager') return address(9);
      if (f === 'currentConfigHash') return hash(10); if (f === 'paused') return false;
      if (f === 'balanceOf') return a === network.quote ? 1000000n : 5n * 10n ** 18n;
      if (f === 'totalSupply') return 10n ** 12n;
      if (f === 'totalAssets') throw new Error('Valuation unavailable');
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
