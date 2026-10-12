import { createPublicClient, encodeFunctionData, getAddress, http, keccak256, parseAbi, type Address, type Hex } from 'viem';
import { riskBindingHash, strategyBindingHash, type Prepared } from './core.js';
export type Deployment = { chainId: 10143 | 31337; mode: 'monad-testnet' | 'local-simulation'; rpcUrl: string; identityRegistry: Address; identityCodeHash: Hex; identityImplementation?: Address; identityImplementationCodeHash?: Hex; vault: Address; vaultCodeHash: Hex; adapter: Address; adapterCodeHash: Hex; venue: Address; venueCodeHash: Hex; quote: Address; position: Address; pair: string };
const identityAbi = parseAbi(['function setAgentURI(uint256,string)', 'function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)', 'function register(string agentURI, (string metadataKey,bytes metadataValue)[] metadata) returns (uint256)']);
const vaultAbi = parseAbi(['function admin() view returns (address)', 'function manager() view returns (address)', 'function identityRegistry() view returns (address)', 'function agentId() view returns (uint256)', 'function strategyHash() view returns (bytes32)', 'function riskHash() view returns (bytes32)', 'function perTradeCap() view returns (uint256)', 'function maxPositionValue() view returns (uint256)', 'function currentConfigHash() view returns (bytes32)', 'function asset() view returns (address)', 'function positionAsset() view returns (address)', 'function adapter() view returns (address)', 'function paused() view returns (bool)']);
const adapterAbi = parseAbi(['function vault() view returns (address)', 'function quote() view returns (address)', 'function asset() view returns (address)', 'function allowedVenue() view returns (address)', 'function revoked() view returns (bool)']);
const tokenAbi = parseAbi(['function decimals() view returns (uint8)']);
export function deployment(value: unknown): Deployment {
  const c = value as Deployment;
  if (!c || ![10143, 31337].includes(c.chainId) || c.mode !== (c.chainId === 10143 ? 'monad-testnet' : 'local-simulation')) throw new Error('Configure an explicit Monad testnet or local simulation deployment.');
  const url = new URL(c.rpcUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (c.chainId === 31337 && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Invalid configured RPC endpoint.');
  for (const k of ['identityRegistry', 'vault', 'adapter', 'venue', 'quote', 'position'] as const) if (!/^0x[a-f0-9]{40}$/i.test(c[k]) || /^0x0{40}$/i.test(c[k]) || getAddress(c[k]) !== c[k]) throw new Error('Deployment addresses must be nonzero checksummed addresses.');
  for (const k of ['identityCodeHash', 'vaultCodeHash', 'adapterCodeHash', 'venueCodeHash'] as const) if (!/^0x[a-f0-9]{64}$/i.test(c[k]) || /^0x0{64}$/i.test(c[k])) throw new Error('Pin reviewed runtime code hashes for all binding contracts.');
  if (!['MON / USDC', 'WMON / USDC'].includes(c.pair) || c.quote === c.position) throw new Error('Invalid configured token pair.');
  if (!!c.identityImplementation !== !!c.identityImplementationCodeHash) throw new Error('Pin both proxy implementation address and code hash.');
  if (c.identityImplementation && (!/^0x[a-f0-9]{40}$/i.test(c.identityImplementation) || getAddress(c.identityImplementation) !== c.identityImplementation || /^0x0{40}$/i.test(c.identityImplementation) || !/^0x[a-f0-9]{64}$/i.test(c.identityImplementationCodeHash!) || /^0x0{64}$/i.test(c.identityImplementationCodeHash!))) throw new Error('Invalid identity implementation pin.');
  return c;
}
export const bindingClient = (c: Deployment) => createPublicClient({ transport: http(c.rpcUrl, { timeout: 10000, retryCount: 0 }) });
export function identityURI(p: Prepared): string {
  const file = { type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1', name: p.manifest.name, description: p.manifest.strategy.description, active: false, services: [], x_pumpcoin: { manifestCommitment: p.commitment, manifest: p.manifest, evidence: 'operator-declared-with-local-check', investmentEligible: false } };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(file)).toString('base64')}`;
}
async function pin(client: any, address: Address, expected: Hex, blockNumber: bigint) {
  const code = await client.getCode({ address, blockNumber });
  if (!code || code === '0x' || keccak256(code) !== expected) throw new Error('Deployed runtime bytecode does not match the configured reviewed code hash.');
}
async function pinIdentity(client: any, c: Deployment, blockNumber: bigint) {
  await pin(client, c.identityRegistry, c.identityCodeHash, blockNumber);
  const slot = await client.getStorageAt({ address: c.identityRegistry, slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', blockNumber });
  if (typeof slot !== 'string' || !/^0x[0-9a-f]{64}$/i.test(slot)) throw new Error('RPC did not provide the identity implementation slot.');
  const beacon = await client.getStorageAt({ address: c.identityRegistry, slot: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50', blockNumber });
  if (typeof beacon !== 'string' || !/^0x0{64}$/i.test(beacon)) throw new Error('Beacon identity proxies are unsupported; use a reviewed direct or ERC-1967 implementation deployment.');
  const implementation = getAddress('0x' + slot.slice(-40));
  if (/^0x0{40}$/i.test(implementation)) { if (c.identityImplementation) throw new Error('Identity implementation pin does not match a direct deployment.'); return; }
  if (!c.identityImplementation || !c.identityImplementationCodeHash || implementation !== c.identityImplementation) throw new Error('Pin the reviewed ERC-1967 identity implementation before proceeding.');
  await pin(client, implementation, c.identityImplementationCodeHash, blockNumber);
}
async function anchored(client: any, c: Deployment) {
  if (await client.getChainId() !== c.chainId) throw new Error('RPC is connected to another chain.');
  const block = await client.getBlock({ blockTag: 'latest' });
  if (block.number === null || !block.hash) throw new Error('RPC did not provide an anchored block.');
  return block as { number: bigint; hash: Hex };
}
async function finish(client: any, block: { number: bigint; hash: Hex }) {
  if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Chain changed during verification. Retry.');
}
export async function identityPlan(p: Prepared, config: Deployment, client: any = bindingClient(config), existingId?: string) {
  const c = deployment(config), block = await anchored(client, c);
  await pinIdentity(client, c, block.number);
  if (existingId !== undefined) {
    if (!/^(0|[1-9]\d{0,77})$/.test(existingId) || BigInt(existingId) >= 2n ** 256n) throw new Error('Invalid existing identity ID.');
    const owner = await client.readContract({ address: c.identityRegistry, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(existingId)], blockNumber: block.number });
    if (typeof owner !== 'string' || owner.toLowerCase() !== p.manifest.controller.toLowerCase()) throw new Error('The existing identity is not owned by this controller.');
    const args = [BigInt(existingId), identityURI(p)] as const;
    await client.simulateContract({ account: p.manifest.controller, address: c.identityRegistry, abi: identityAbi, functionName: 'setAgentURI', args, blockNumber: block.number });
    await finish(client, block);
    return { chainId: c.chainId, mode: c.mode, from: p.manifest.controller, to: c.identityRegistry, value: '0', data: encodeFunctionData({ abi: identityAbi, functionName: 'setAgentURI', args }), commitment: p.commitment, blockNumber: block.number.toString(), blockHash: block.hash, status: 'prepared-not-submitted', existingAgentId: existingId, note: 'Update the same identity to a new configuration; prior signed records remain in local history. No trading permission granted.' };
  }
  const args = [identityURI(p), [{ metadataKey: 'pumpcoinManifestCommitment', metadataValue: p.commitment }]] as const;
  await client.simulateContract({ account: p.manifest.controller, address: c.identityRegistry, abi: identityAbi, functionName: 'register', args, blockNumber: block.number });
  await finish(client, block);
  return { chainId: c.chainId, mode: c.mode, from: p.manifest.controller, to: c.identityRegistry, value: '0', data: encodeFunctionData({ abi: identityAbi, functionName: 'register', args }), commitment: p.commitment, blockNumber: block.number.toString(), blockHash: block.hash, status: 'prepared-not-submitted', note: 'Review and submit with your controller wallet. This creates identity only, not trading permission or investment eligibility.' };
}
export async function verifyBinding(p: Prepared, id: string, config: Deployment, client: any = bindingClient(config)) {
  const c = deployment(config);
  if (!/^(0|[1-9]\d{0,77})$/.test(id) || BigInt(id) >= 2n ** 256n) throw new Error('Enter a valid agent identity token ID.');
  if (c.pair !== p.manifest.strategy.pair) throw new Error('Configured vault uses another proposed token pair.');
  const block = await anchored(client, c);
  await pinIdentity(client, c, block.number);
  await Promise.all([[c.vault, c.vaultCodeHash], [c.adapter, c.adapterCodeHash], [c.venue, c.venueCodeHash]].map(([address, hash]) => pin(client, address as Address, hash as Hex, block.number)));
  const read = (address: Address, abi: unknown, functionName: string, args: unknown[] = []) => client.readContract({ address, abi, functionName, args, blockNumber: block.number });
  const names = ['admin', 'manager', 'identityRegistry', 'agentId', 'strategyHash', 'riskHash', 'perTradeCap', 'maxPositionValue', 'currentConfigHash', 'asset', 'positionAsset', 'adapter', 'paused'];
  const values = await Promise.all(names.map(n => read(c.vault, vaultAbi, n)));
  const v = Object.fromEntries(names.map((n, i) => [n, values[i]]));
  const [owner, uri, quoteDecimals, positionDecimals, aVault, aQuote, aAsset, aVenue, revoked] = await Promise.all([read(c.identityRegistry, identityAbi, 'ownerOf', [BigInt(id)]), read(c.identityRegistry, identityAbi, 'tokenURI', [BigInt(id)]), read(c.quote, tokenAbi, 'decimals'), read(c.position, tokenAbi, 'decimals'), ...['vault', 'quote', 'asset', 'allowedVenue', 'revoked'].map(n => read(c.adapter, adapterAbi, n))]);
  const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
  if (!same(owner, p.manifest.controller) || uri !== identityURI(p)) throw new Error('Identity ownership or published manifest differs from this registration.');
  if (!same(v.admin, p.manifest.controller) || !same(v.manager, p.manifest.executionKey) || !same(v.identityRegistry, c.identityRegistry) || v.agentId !== BigInt(id)) throw new Error('Vault authority or identity binding does not match the signed registration.');
  if (!same(v.strategyHash, strategyBindingHash(p)) || !same(v.riskHash, riskBindingHash(p)) || v.perTradeCap !== BigInt(p.manifest.proposedMandate.perTradeQuoteUnits) || v.maxPositionValue !== BigInt(p.manifest.proposedMandate.maxPositionQuoteUnits)) throw new Error('Vault strategy or limits differ from the signed declaration.');
  if (!same(v.asset, c.quote) || !same(v.positionAsset, c.position) || !same(v.adapter, c.adapter) || !same(aVault, c.vault) || !same(aQuote, c.quote) || !same(aAsset, c.position) || !same(aVenue, c.venue) || revoked !== false || v.paused !== false || quoteDecimals !== 6 || positionDecimals !== 6) throw new Error('Vault adapter, tokens, decimals or safety state do not satisfy the configured binding.');
  await finish(client, block);
  return { status: 'binding-checked-at-block', chainId: c.chainId, mode: c.mode, vault: c.vault, identityRegistry: c.identityRegistry, agentId: id, blockNumber: block.number.toString(), blockHash: block.hash, configHash: v.currentConfigHash as Hex, checkedAt: new Date().toISOString(), investmentEligible: false, evidence: 'configured-rpc-and-pinned-code', scope: 'Point-in-time identity, authority and declared limit binding. A single configured RPC is trusted; this is not performance verification or continuous monitoring.' };
}
