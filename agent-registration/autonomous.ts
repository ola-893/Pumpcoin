import { committedTradeData } from './trade-commitment.js';
import { requireGasBudget, type EconomyPolicy } from './gas-budget.js';
import { createPublicClient, createWalletClient, getAddress, http, keccak256, parseAbi, type Address, type Hex, type Chain } from 'viem';
import { monadTestnet, foundry } from 'viem/chains';
import type { PrivateKeyAccount } from 'viem/accounts';
import { type Prepared, riskBindingHash, strategyBindingHash } from './core.js';
import { type VaultNetwork, vaultNetwork, networkChecks } from './vault-setup.js';
import { guardedProposal, inferProposal, inferTrace, LIVE_PURPOSE, matchingDetection } from './worker.js';
import { detectLocalModel } from '../local-inference/discovery.js';
import type { PaperInput } from './types.js';

export const autonomousAbi = parseAbi([
  'function admin() view returns(address)', 'function manager() view returns(address)',
  'function managerVersion() view returns(uint256)', 'function tradeConfigVersion() view returns(uint256)',
  'function currentConfigHash() view returns(bytes32)', 'function registrationCommitment() view returns(bytes32)',
  'function identityRegistry() view returns(address)', 'function agentId() view returns(uint256)',
  'function strategyHash() view returns(bytes32)', 'function riskHash() view returns(bytes32)',
  'function perTradeCap() view returns(uint256)', 'function maxPositionValue() view returns(uint256)',
  'function asset() view returns(address)', 'function positionAsset() view returns(address)',
  'function adapter() view returns(address)', 'function valuationSource() view returns(address)',
  'function paused() view returns(bool)', 'function tradingPermissionRequired() view returns(bool)',
  'function tradingPermission() view returns(uint64 validUntil,uint16 maxSlippageBps,uint256 dailyQuoteCap,uint256 managerVersion,uint256 configVersion)',
  'function dailyQuoteTraded(uint256) view returns(uint256)',
  'function managerTrade(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 deadline,address venue) returns(uint256)',
  'function grantTradingPermission(address expectedManager,bytes32 expectedConfigHash,uint64 validUntil,uint256 dailyQuoteCap,uint16 maxSlippageBps)',
  'function revokeTradingPermission()',
]);
const sourceAbi = parseAbi(['function status() view returns(bool,bytes32)', 'function price() view returns(uint256)', 'function markedValue(uint256) view returns(uint256)', 'function positionDecimals() view returns(uint8)']);
const adapterAbi = parseAbi(['function vault() view returns(address)', 'function quote() view returns(address)', 'function asset() view returns(address)', 'function allowedVenue() view returns(address)', 'function revoked() view returns(bool)']);
const tokenAbi = parseAbi(['function balanceOf(address) view returns(uint256)']);
const identityAbi = parseAbi(['function ownerOf(uint256) view returns(address)']);
type RuntimePin = { address: Address; codeHash: Hex; implementation?: Address; implementationCodeHash?: Hex };
export type AutonomousDeployment = VaultNetwork & { vault: Address; vaultCodeHash: Hex; adapter: Address; adapterCodeHash: Hex; venue: Address; venueCodeHash: Hex; source: Address; sourceCodeHash: Hex; dependencies?: RuntimePin[] };
export function autonomousDeployment(value: AutonomousDeployment) {
  const c = vaultNetwork(value);
  for (const key of ['vault', 'adapter', 'venue', 'source'] as const) {
    if (getAddress(value[key]) !== value[key] || /^0x0{40}$/i.test(value[key]) || !/^0x[0-9a-f]{64}$/i.test(value[`${key}CodeHash`]) || /^0x0{64}$/i.test(value[`${key}CodeHash`])) throw new Error('Pin all reviewed autonomy contracts and runtime hashes.');
  }
  if ((value.chainId === 10143 && !value.dependencies?.length) || (value.dependencies && (!Array.isArray(value.dependencies) || value.dependencies.length > 32))) throw new Error('Pin the reviewed oracle and exchange dependencies.');
  for (const pin of value.dependencies ?? []) {
    if (getAddress(pin.address) !== pin.address || /^0x0{40}$/i.test(pin.address) || !/^0x[0-9a-f]{64}$/i.test(pin.codeHash) || /^0x0{64}$/i.test(pin.codeHash)
        || !!pin.implementation !== !!pin.implementationCodeHash || (pin.implementation && (getAddress(pin.implementation) !== pin.implementation || /^0x0{40}$/i.test(pin.implementation) || !/^0x[0-9a-f]{64}$/i.test(pin.implementationCodeHash!) || /^0x0{64}$/i.test(pin.implementationCodeHash!)))) throw new Error('Invalid external dependency pin.');
  }
  return c as AutonomousDeployment;
}
const chainFor = (id: number): Chain => id === 10143 ? monadTestnet : foundry;
export const autonomousClient = (c: AutonomousDeployment) => createPublicClient({ chain: chainFor(c.chainId), transport: http(c.rpcUrl, { retryCount: 0, timeout: 15000 }), cacheTime: 0 });
export type TradeSnapshot = { blockNumber: bigint; blockHash: Hex; timestamp: bigint; price: bigint; configHash: Hex; input: PaperInput; cash: bigint; positions: bigint; permission: readonly [bigint, number, bigint, bigint, bigint]; spent: bigint };

/** Everything is read at one canonical block; RPC and reviewed price source remain trust boundaries. */
export async function tradingSnapshot(p: Prepared, config: AutonomousDeployment, client: any = autonomousClient(config)): Promise<TradeSnapshot> {
  const c = autonomousDeployment(config), block = await client.getBlock({ blockTag: 'latest' });
  if (block.number === null || !block.hash) throw new Error('Cannot anchor trading state.');
  await networkChecks(c, client, block.number);
  for (const key of ['vault', 'adapter', 'venue', 'source'] as const) {
    const code = await client.getCode({ address: c[key], blockNumber: block.number });
    if (!code || keccak256(code) !== c[`${key}CodeHash`]) throw new Error('Trading contract runtime changed.');
  }
  for (const pin of c.dependencies ?? []) {
    const code = await client.getCode({ address: pin.address, blockNumber: block.number });
    if (!code || code === '0x' || keccak256(code) !== pin.codeHash) throw new Error('External dependency runtime changed.');
    const implementation = await client.getStorageAt({ address: pin.address, slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', blockNumber: block.number });
    const beacon = await client.getStorageAt({ address: pin.address, slot: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50', blockNumber: block.number });
    if (!/^0x0{64}$/i.test(beacon ?? '') || !/^0x[0-9a-f]{64}$/i.test(implementation ?? '')) throw new Error('Unsupported external dependency proxy.');
    const actual = getAddress('0x' + implementation.slice(-40));
    if (pin.implementation ? actual !== pin.implementation : !/^0x0{40}$/i.test(actual)) throw new Error('External dependency implementation changed.');
    if (pin.implementation) {
      const runtime = await client.getCode({ address: pin.implementation, blockNumber: block.number });
      if (!runtime || runtime === '0x' || keccak256(runtime) !== pin.implementationCodeHash) throw new Error('External dependency implementation runtime changed.');
    }
  }
  const read = (address: Address, abi: any, functionName: string, args: unknown[] = []) => client.readContract({ address, abi, functionName, args, blockNumber: block.number });
  const fields = ['admin', 'manager', 'managerVersion', 'tradeConfigVersion', 'currentConfigHash', 'registrationCommitment', 'identityRegistry', 'agentId', 'strategyHash', 'riskHash', 'perTradeCap', 'maxPositionValue', 'asset', 'positionAsset', 'adapter', 'valuationSource', 'paused', 'tradingPermissionRequired', 'tradingPermission'];
  const values = await Promise.all(fields.map(n => read(c.vault, autonomousAbi, n))), v = Object.fromEntries(fields.map((n, i) => [n, values[i]]));
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (!same(v.admin, p.manifest.controller) || !same(v.manager, p.manifest.executionKey) || !same(v.identityRegistry, c.identityRegistry)
      || v.registrationCommitment !== p.commitment || v.strategyHash !== strategyBindingHash(p) || v.riskHash !== riskBindingHash(p)
      || v.perTradeCap !== BigInt(p.manifest.proposedMandate.perTradeQuoteUnits) || v.maxPositionValue !== BigInt(p.manifest.proposedMandate.maxPositionQuoteUnits)
      || !same(v.asset, c.quote) || !same(v.positionAsset, c.position) || !same(v.adapter, c.adapter) || !same(v.valuationSource, c.source)
      || v.paused || !v.tradingPermissionRequired) throw new Error('Vault is paused or differs from the signed declaration/deployment.');
  if (!same(await read(c.identityRegistry, identityAbi, 'ownerOf', [v.agentId]), p.manifest.controller)) throw new Error('Agent identity owner changed.');
  const bindings = await Promise.all(['vault', 'quote', 'asset', 'allowedVenue', 'revoked'].map(n => read(c.adapter, adapterAbi, n)));
  if (!same(bindings[0], c.vault) || !same(bindings[1], c.quote) || !same(bindings[2], c.position) || !same(bindings[3], c.venue) || bindings[4]) throw new Error('Restricted trading adapter is unavailable.');
  const permission = v.tradingPermission as TradeSnapshot['permission'];
  if (BigInt(permission[0]) <= block.timestamp || permission[2] <= 0n || permission[3] !== v.managerVersion || permission[4] !== v.tradeConfigVersion || permission[1] > p.manifest.proposedMandate.slippageBps) throw new Error('Trading permission expired, revoked or exceeds declared slippage.');
  const status = await read(c.source, sourceAbi, 'status');
  if (!status[0]) throw new Error('Live valuation is unavailable.');
  const [decimals, price, cash, positions, spent] = await Promise.all([
    read(c.source, sourceAbi, 'positionDecimals'), read(c.source, sourceAbi, 'price'),
    read(c.quote, tokenAbi, 'balanceOf', [c.vault]), read(c.position, tokenAbi, 'balanceOf', [c.vault]), read(c.vault, autonomousAbi, 'dailyQuoteTraded', [block.timestamp / 86400n]),
  ]);
  if (!status[0] || decimals !== c.positionDecimals || price <= 0n) throw new Error('Live valuation is unavailable.');
  const positionValue = await read(c.source, sourceAbi, 'markedValue', [positions]);
  if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Chain changed during trading checks.');
  return { blockNumber: block.number, blockHash: block.hash, timestamp: block.timestamp, price, configHash: v.currentConfigHash, cash, positions, permission, spent,
    input: { fresh: true, valued: true, cashQuoteUnits: cash.toString(), positionQuoteUnits: positionValue.toString() } };
}

export function tradeArguments(p: Prepared, c: AutonomousDeployment, s: TradeSnapshot, raw: unknown) {
  const proposal = guardedProposal(raw, s.input, p);
  if (proposal.action === 'HOLD') return undefined;
  const notional = BigInt(proposal.quoteUnits), denominator = 10n ** 18n;
  const amountIn = proposal.action === 'BUY' ? notional : notional * denominator / s.price;
  if (amountIn === 0n || (proposal.action === 'SELL' && amountIn > s.positions)) return undefined;
  const actualNotional = proposal.action === 'BUY' ? amountIn : (amountIn * s.price + denominator - 1n) / denominator;
  if (s.spent + actualNotional > s.permission[2]) return undefined;
  const expectedOut = proposal.action === 'BUY' ? amountIn * denominator / s.price : amountIn * s.price / denominator;
  const minOut = (expectedOut * BigInt(10000 - s.permission[1]) + 9999n) / 10000n;
  if (minOut === 0n) return undefined;
  return [proposal.action === 'BUY' ? c.quote : c.position, proposal.action === 'BUY' ? c.position : c.quote, amountIn, minOut, s.timestamp + 120n, c.venue] as const;
}

export async function proposeTrade(p: Prepared, snapshot: TradeSnapshot, dependencies = { detect: detectLocalModel, infer: inferProposal }) {
  const first = await dependencies.detect(p.privateRuntimeConfig.inferenceBaseURL, () => {}); matchingDetection(p, first);
  const proposal = await dependencies.infer(p, snapshot.input, fetch, 'Live spot proposal from the configured vault valuation at an anchored block; no tools or signing authority');
  const last = await dependencies.detect(p.privateRuntimeConfig.inferenceBaseURL, () => {}); matchingDetection(p, last);
  if (JSON.stringify(first.runtimeManifest) !== JSON.stringify(last.runtimeManifest)) throw new Error('Local runtime changed during proposal.');
  return proposal;
}

export async function proposeDecision(p: Prepared, snapshot: TradeSnapshot, dependencies = { detect: detectLocalModel, infer: inferTrace }) {
  const first = await dependencies.detect(p.privateRuntimeConfig.inferenceBaseURL, () => {}); matchingDetection(p, first);
  const inference = await dependencies.infer(p, snapshot.input, fetch, LIVE_PURPOSE);
  const last = await dependencies.detect(p.privateRuntimeConfig.inferenceBaseURL, () => {}); matchingDetection(p, last);
  if (JSON.stringify(first.runtimeManifest) !== JSON.stringify(last.runtimeManifest)) throw new Error('Local runtime changed during proposal.');
  return inference;
}

/** Prepare locally, journal BEFORE broadcast, then send one signed transaction. */
export async function submitTrade(p: Prepared, c: AutonomousDeployment, s: TradeSnapshot, raw: unknown, account: PrivateKeyAccount,
  savePending: (pending: { hash: Hex; serialized: Hex; blockNumber: string }) => Promise<void>, client: any = autonomousClient(c), maxFeePerGas = 100000000000n, signal?: AbortSignal, budget?: { policy: EconomyPolicy; spentWei: bigint }, decisionCommitment?: Hex) {
  if (account.address.toLowerCase() !== p.manifest.executionKey.toLowerCase()) throw new Error('Execution account does not match the declaration.');
  const args = tradeArguments(p, c, s, raw);
  if (!args) return undefined;
  const latest = await tradingSnapshot(p, c, client);
  if (latest.configHash !== s.configHash || latest.timestamp > s.timestamp + 30n || latest.timestamp < s.timestamp
      || latest.cash !== s.cash || latest.positions !== s.positions || latest.spent !== s.spent) throw new Error('Trading state changed during inference. Request a fresh proposal.');
  const wallet = createWalletClient({ account, chain: chainFor(c.chainId), transport: http(c.rpcUrl, { retryCount: 0, timeout: 15000 }) });
  await client.simulateContract({ account: account.address, address: c.vault, abi: autonomousAbi, functionName: 'managerTrade', args });
  const request = await wallet.prepareTransactionRequest({ to: c.vault, data: committedTradeData(autonomousAbi, args, decisionCommitment), value: 0n });
  if ((request.maxFeePerGas ?? request.gasPrice ?? 0n) > maxFeePerGas || request.gas > 1500000n) throw new Error('Trading transaction exceeds the operator gas budget.');
  if (budget) requireGasBudget(budget.policy, await client.getBalance({ address: account.address }), request.gas, request.maxFeePerGas ?? request.gasPrice ?? 0n, budget.spentWei);
  if (signal?.aborted) throw new Error('Worker is stopping.');
  const serialized = await wallet.signTransaction(request), hash = keccak256(serialized);
  if (signal?.aborted) throw new Error('Worker is stopping.');
  await savePending({ hash, serialized, blockNumber: s.blockNumber.toString() });
  if (signal?.aborted) throw new Error('Worker is stopping with a journaled transaction.');
  await client.sendRawTransaction({ serializedTransaction: serialized });
  return hash;
}
