import { readFileSync } from 'node:fs';
import { createPublicClient, encodeDeployData, getAddress, http, keccak256, parseAbi, type Abi, type Address, type Hex } from 'viem';
import { identityURI } from './binding.js';
import { riskBindingHash, strategyBindingHash, type Prepared } from './core.js';
import type { BindingReceipt } from './types.js';

export type VaultNetwork = { chainId: 10143 | 31337; rpcUrl: string; identityRegistry: Address; identityCodeHash: Hex; identityImplementation?: Address; identityImplementationCodeHash?: Hex; quote: Address; quoteCodeHash: Hex; position: Address; positionCodeHash: Hex; positionDecimals: 6 | 18 };
export type VaultPlan = { chainId: number; from: Address; data: Hex; value: '0x0'; gas: Hex; balance: string; estimatedFee: string; canSubmit: boolean; commitment: Hex; scope: string; blockers: string[] };
export type VaultArtifact = { abi: Abi; bytecode: { object: Hex }; deployedBytecode: { object: Hex; immutableReferences: Record<string, { start: number; length: number }[]> } };
const registryAbi = parseAbi(['function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)']);
const vaultAbi = parseAbi(['function admin() view returns (address)', 'function manager() view returns (address)', 'function identityRegistry() view returns (address)', 'function agentId() view returns (uint256)', 'function registrationCommitment() view returns (bytes32)', 'function strategyHash() view returns (bytes32)', 'function riskHash() view returns (bytes32)', 'function perTradeCap() view returns (uint256)', 'function maxPositionValue() view returns (uint256)', 'function currentConfigHash() view returns (bytes32)', 'function asset() view returns (address)', 'function positionAsset() view returns (address)', 'function adapter() view returns (address)', 'function valuationSource() view returns (address)', 'function paused() view returns (bool)', 'function totalSupply() view returns (uint256)']);
const tokenAbi = parseAbi(['function decimals() view returns (uint8)']);
const sourceAbi = parseAbi(['function status() view returns (bool,bytes32)', 'function positionDecimals() view returns (uint8)']);
const slot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as Hex;
const beaconSlot = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50' as Hex;
const ZERO = '0x0000000000000000000000000000000000000000';
export function vaultNetwork(c: VaultNetwork): VaultNetwork {
  const u = new URL(c.rpcUrl);
  if (![10143, 31337].includes(c.chainId) || ![6, 18].includes(c.positionDecimals) || !['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || (c.chainId === 31337 && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) throw new Error('Invalid vault network configuration.');
  for (const k of ['identityRegistry', 'quote', 'position'] as const) if (!/^0x[0-9a-f]{40}$/i.test(c[k]) || c[k] === ZERO || getAddress(c[k]) !== c[k]) throw new Error('Invalid configured contract address.');
  for (const k of ['identityCodeHash', 'quoteCodeHash', 'positionCodeHash'] as const) if (!/^0x[0-9a-f]{64}$/i.test(c[k]) || /^0x0{64}$/i.test(c[k])) throw new Error('Missing runtime code pin.');
  if (!!c.identityImplementation !== !!c.identityImplementationCodeHash || (c.identityImplementation && (getAddress(c.identityImplementation) !== c.identityImplementation || c.identityImplementation === ZERO || !/^0x[0-9a-f]{64}$/i.test(c.identityImplementationCodeHash!)))) throw new Error('Invalid registry implementation pin.');
  if (c.quote === c.position) throw new Error('Vault assets must differ.');
  return c;
}
export function vaultArtifact(): VaultArtifact {
  try { return JSON.parse(readFileSync(new URL('../contracts/out/PumpCoinRegisteredVault.sol/PumpCoinRegisteredVault.json', import.meta.url), 'utf8')); }
  catch { throw new Error('Vault deployment artifact is unavailable. Build the reviewed contracts before registering on-chain.'); }
}
export const vaultClient = (c: VaultNetwork) => createPublicClient({ transport: http(c.rpcUrl, { timeout: 15000, retryCount: 0 }), cacheTime: 0 });
async function pin(client: any, address: Address, expected: Hex, blockNumber: bigint) {
  const code = await client.getCode({ address, blockNumber });
  if (!code || code === '0x' || keccak256(code) !== expected) throw new Error('Configured contract bytecode changed; deployment is blocked.');
}
export async function networkChecks(c: VaultNetwork, client: any, blockNumber: bigint) {
  if (await client.getChainId() !== c.chainId) throw new Error('Vault RPC is connected to another chain.');
  await Promise.all([[c.identityRegistry, c.identityCodeHash], [c.quote, c.quoteCodeHash], [c.position, c.positionCodeHash]].map(([a, h]) => pin(client, a as Address, h as Hex, blockNumber)));
  const implementation = await client.getStorageAt({ address: c.identityRegistry, slot, blockNumber });
  const beacon = await client.getStorageAt({ address: c.identityRegistry, slot: beaconSlot, blockNumber });
  if (!/^0x0{64}$/i.test(beacon ?? '')) throw new Error('Unsupported registry beacon proxy.');
  if (!/^0x[0-9a-f]{64}$/i.test(implementation ?? '')) throw new Error('Registry implementation slot unavailable.');
  const actual = getAddress('0x' + implementation.slice(-40));
  if (actual === ZERO ? !!c.identityImplementation : actual !== c.identityImplementation) throw new Error('Registry implementation changed; deployment is blocked.');
  if (c.identityImplementation) await pin(client, c.identityImplementation, c.identityImplementationCodeHash!, blockNumber);
  const decimals = await Promise.all([c.quote, c.position].map(address => client.readContract({ address, abi: tokenAbi, functionName: 'decimals', blockNumber })));
  if (decimals[0] !== 6 || decimals[1] !== c.positionDecimals) throw new Error('Configured token decimals do not match the vault policy.');
}
function dataFor(p: Prepared, c: VaultNetwork, a: VaultArtifact): Hex {
  return encodeDeployData({ abi: a.abi, bytecode: a.bytecode.object, args: [{ quote: c.quote, position: c.position, controller: p.manifest.controller, manager: p.manifest.executionKey, strategy: strategyBindingHash(p), risk: riskBindingHash(p), tradeCap: BigInt(p.manifest.proposedMandate.perTradeQuoteUnits), positionCap: BigInt(p.manifest.proposedMandate.maxPositionQuoteUnits), registry: c.identityRegistry, uri: identityURI(p), commitment: p.commitment }] });
}
export async function prepareVault(p: Prepared, config: VaultNetwork, client: any = vaultClient(config), artifact = vaultArtifact()): Promise<VaultPlan> {
  const c = vaultNetwork(config), block = await client.getBlock({ blockTag: 'latest' });
  if (block.number === null || !block.hash) throw new Error('RPC could not anchor the deployment check.');
  await networkChecks(c, client, block.number);
  const data = dataFor(p, c, artifact), from = getAddress(p.manifest.controller);
  // Zero gas price is ONLY for this read-only simulation; the wallet pays normal gas.
  const [estimate, price, balance] = await Promise.all([client.estimateGas({ account: from, data, value: 0n, gasPrice: 0n }), client.getGasPrice(), client.getBalance({ address: from })]);
  const gas = estimate * 12n / 10n, fee = gas * price * 2n;
  if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Chain changed during deployment preparation. Retry.');
  return { chainId: c.chainId, from, data, value: '0x0', gas: `0x${gas.toString(16)}`, balance: balance.toString(), estimatedFee: fee.toString(), canSubmit: balance >= fee, commitment: p.commitment,
    scope: 'Create a dedicated paused vault and ERC-8004 identity. Controller owns the identity and administers this vault; the declared execution key is its manager. No deposit, approval, swap or token transfer. Trading and investment stay blocked until live valuation and a restricted venue are configured through notice.',
    blockers: balance < fee ? ['Fund the controller with testnet MON for deployment gas.'] : [] };
}
export function normalized(code: Hex, refs: VaultArtifact['deployedBytecode']['immutableReferences']) {
  const bytes = Buffer.from(code.slice(2), 'hex');
  for (const ranges of Object.values(refs ?? {})) for (const { start, length } of ranges) { if (start < 0 || start + length > bytes.length) throw new Error('Invalid runtime artifact references.'); bytes.fill(0, start, start + length); }
  return bytes.toString('hex');
}
export async function confirmVault(p: Prepared, txHash: Hex, config: VaultNetwork, client: any = vaultClient(config), artifact = vaultArtifact()): Promise<BindingReceipt> {
  const c = vaultNetwork(config);
  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) throw new Error('Enter a valid deployment transaction hash.');
  let receipt: any, tx: any;
  try { [receipt, tx] = await Promise.all([client.getTransactionReceipt({ hash: txHash }), client.getTransaction({ hash: txHash })]); }
  catch (e) { if (['TransactionReceiptNotFoundError', 'TransactionNotFoundError'].includes((e as Error).name)) throw new Error('Deployment has not been mined yet. Keep this hash and retry verification.'); throw e; }
  if (receipt.status !== 'success' || !receipt.contractAddress || tx.to !== null || tx.from.toLowerCase() !== p.manifest.controller.toLowerCase() || tx.value !== 0n || tx.input.toLowerCase() !== dataFor(p, c, artifact).toLowerCase()) throw new Error('Transaction is not the exact successful controller-approved vault deployment for this declaration.');
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash) throw new Error('Deployment is no longer on the canonical chain.');
  await networkChecks(c, client, receipt.blockNumber);
  const vault = getAddress(receipt.contractAddress), runtime = await client.getCode({ address: vault, blockNumber: receipt.blockNumber });
  if (!runtime || normalized(runtime, artifact.deployedBytecode.immutableReferences) !== normalized(artifact.deployedBytecode.object, artifact.deployedBytecode.immutableReferences)) throw new Error('Vault runtime differs from the compiled deployment artifact.');
  const read = (address: Address, abi: Abi, functionName: string, args: unknown[] = []) => client.readContract({ address, abi, functionName, args, blockNumber: receipt.blockNumber });
  const names = ['admin', 'manager', 'identityRegistry', 'agentId', 'registrationCommitment', 'strategyHash', 'riskHash', 'perTradeCap', 'maxPositionValue', 'currentConfigHash', 'asset', 'positionAsset', 'adapter', 'valuationSource', 'paused', 'totalSupply'];
  const values = await Promise.all(names.map(n => read(vault, vaultAbi, n))), v = Object.fromEntries(names.map((n, i) => [n, values[i]]));
  const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
  const [owner, uri, sourceStatus, sourceDecimals] = await Promise.all([read(c.identityRegistry, registryAbi, 'ownerOf', [v.agentId]), read(c.identityRegistry, registryAbi, 'tokenURI', [v.agentId]), read(v.valuationSource, sourceAbi, 'status'), read(v.valuationSource, sourceAbi, 'positionDecimals')]);
  if (!same(v.admin, p.manifest.controller) || !same(v.manager, p.manifest.executionKey) || !same(owner, p.manifest.controller) || uri !== identityURI(p) || !same(v.identityRegistry, c.identityRegistry) || !same(v.registrationCommitment, p.commitment) || !same(v.strategyHash, strategyBindingHash(p)) || !same(v.riskHash, riskBindingHash(p)) || v.perTradeCap !== BigInt(p.manifest.proposedMandate.perTradeQuoteUnits) || v.maxPositionValue !== BigInt(p.manifest.proposedMandate.maxPositionQuoteUnits) || !same(v.asset, c.quote) || !same(v.positionAsset, c.position) || v.adapter !== ZERO || v.paused !== true || v.totalSupply !== 0n || sourceStatus[0] !== false || sourceDecimals !== c.positionDecimals) throw new Error('Created vault identity, authority, limits or safety state do not match this registration.');
  if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) throw new Error('Chain changed during vault verification. Retry.');
  return { status: 'binding-checked-at-block', chainId: c.chainId, mode: c.chainId === 10143 ? 'monad-testnet' : 'local-simulation', vault, identityRegistry: c.identityRegistry, agentId: String(v.agentId), blockNumber: String(receipt.blockNumber), blockHash: receipt.blockHash, configHash: v.currentConfigHash, checkedAt: new Date().toISOString(), investmentEligible: false, evidence: 'controller-deployment-receipt-and-runtime-verification', scope: 'Dedicated vault and ERC-8004 identity created and bound. Vault starts paused with unavailable valuation and no trading adapter. Trading and investment remain blocked. Historical deployment snapshot; configured RPC and registry implementation are trust boundaries.', deploymentTransaction: txHash, tradingReady: false };
}
