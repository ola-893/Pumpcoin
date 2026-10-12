import { decodeEventLog, getAddress, parseAbi, type Hex } from 'viem';
import { networkChecks, vaultArtifact, vaultClient, vaultNetwork, type VaultNetwork } from './vault-setup.js';
import { autonomousAbi } from './autonomous.js';
import type { RegistrationRecord, LiveVaultObservation } from './types.js';

const abi = parseAbi(['function admin() view returns(address)', 'function manager() view returns(address)',
  'function registrationCommitment() view returns(bytes32)', 'function asset() view returns(address)', 'function positionAsset() view returns(address)',
  'function paused() view returns(bool)', 'function currentConfigHash() view returns(bytes32)',
  'function totalSupply() view returns(uint256)', 'function totalAssets() view returns(uint256)',
  'function balanceOf(address) view returns(uint256)', 'function decimals() view returns(uint8)']);
export type { LiveVaultObservation } from "./types.js";
const publicValues = (value: unknown): unknown => typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(publicValues)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, publicValues(v)])) : value;

/** A bounded live activity view, deliberately not a performance/accounting export. */
export function liveVaultService(config: VaultNetwork, records: () => Promise<RegistrationRecord[]>, client: any = vaultClient(config)) {
  const network = vaultNetwork(config), cache = new Map<string, { at: number; value: LiveVaultObservation }>(), pending = new Map<string, Promise<LiveVaultObservation>>();
  async function collect(id: string) {
    const record = (await records()).find(r => r.id === id);
    if (!record?.binding || record.binding.chainId !== 10143 || network.chainId !== 10143) throw new Error('Select a verified Monad testnet vault. Local simulations are excluded from live evidence.');
    const vault = getAddress(record.binding.vault), block = await client.getBlock({ blockTag: 'latest' });
    if (block.number === null || !block.hash) throw new Error('Live evidence could not anchor a block.');
    await networkChecks(network, client, block.number);
    const code = await client.getCode({ address: vault, blockNumber: block.number });
    if (!code || code === '0x') throw new Error('The selected vault is not deployed at this block.');
    const read = (address: string, functionName: string, args: unknown[] = [], contractAbi: any = abi) => client.readContract({ address: getAddress(address), abi: contractAbi, functionName, args, blockNumber: block.number });
    // Sequential reads keep public RPC requests bounded on a frontend refresh.
    const commitment = await read(vault, 'registrationCommitment');
    if (commitment !== record.commitment || await read(vault, 'asset') !== network.quote || await read(vault, 'positionAsset') !== network.position) throw new Error('Live vault binding differs from this registration.');
    const controller = await read(vault, 'admin'), manager = await read(vault, 'manager');
    const paused = await read(vault, 'paused'), configHash = await read(vault, 'currentConfigHash');
    const cash = await read(network.quote, 'balanceOf', [vault]), position = await read(network.position, 'balanceOf', [vault]);
    const shares = await read(vault, 'totalSupply'), shareDecimals = await read(vault, 'decimals');
    let nav: string | undefined; try { nav = String(await read(vault, 'totalAssets')); } catch { /* Unavailable valuation stays unavailable. */ }
    let permission: LiveVaultObservation['permission'];
    let permissionSupported = false;
    try {
      const required = await read(vault, 'tradingPermissionRequired', [], autonomousAbi);
      const p = await read(vault, 'tradingPermission', [], autonomousAbi);
      const managerVersion = await read(vault, 'managerVersion', [], autonomousAbi), configVersion = await read(vault, 'tradeConfigVersion', [], autonomousAbi);
      const spent = await read(vault, 'dailyQuoteTraded', [block.timestamp / 86400n], autonomousAbi);
      permissionSupported = true;
      permission = { active: !!required && !paused && p[0] > block.timestamp && p[2] > 0n && p[3] === managerVersion && p[4] === configVersion,
        validUntil: String(p[0]), dailyQuoteCap: String(p[2]), dailyQuoteTraded: String(spent) };
    } catch { /* Old immutable vaults do not expose the permission interface. */ }
    const from = block.number > 999n ? block.number - 999n : 0n;
    const logs: any[] = [];
    for (let start = from; start <= block.number; start += 100n) {
      const end = start + 99n < block.number ? start + 99n : block.number;
      const batch = await client.getLogs({ address: vault, fromBlock: start, toBlock: end });
      if (!Array.isArray(batch) || batch.length > 2000 || logs.length + batch.length > 5000) throw new Error('Recent vault activity exceeds this view’s coverage limit.');
      for (const log of batch) {
        if (log.removed || !log.transactionHash || log.blockNumber < start || log.blockNumber > end || log.address.toLowerCase() !== vault.toLowerCase()) throw new Error('RPC returned inconsistent vault activity.');
      }
      logs.push(...batch);
    }
    logs.sort((a, b) => a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
    const hashes = [...new Set<Hex>(logs.map(l => l.transactionHash))].reverse().slice(0, 10);
    const transactions: LiveVaultObservation['transactions'] = [];
    const eventAbi = vaultArtifact().abi;
    for (const hash of hashes) {
      const receipt = await client.getTransactionReceipt({ hash }), transaction = await client.getTransaction({ hash });
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
    if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('Chain changed during the live evidence check. Refresh.');
    return { chainId: 10143 as const, vault, blockNumber: String(block.number), blockHash: block.hash, checkedAt: new Date().toISOString(), controller, manager, paused, configHash,
      cash: String(cash), position: String(position), positionDecimals: network.positionDecimals, shares: String(shares), shareDecimals, ...(nav !== undefined ? { nav } : {}),
      permissionSupported, ...(permission ? { permission } : {}), history: { fromBlock: String(from), toBlock: String(block.number), transactionLimit: 10, completePerformanceHistory: false as const }, transactions };
  }
  return { async inspect(id: string): Promise<LiveVaultObservation> {
    if (!/^0x[0-9a-f]{64}$/i.test(id)) throw new Error('Invalid registration identifier.');
    const hit = cache.get(id); if (hit && Date.now() - hit.at < 10000) return hit.value;
    const existing = pending.get(id); if (existing) return existing;
    const task = collect(id).then(value => { cache.set(id, { at: Date.now(), value }); return value; }).finally(() => pending.delete(id));
    pending.set(id, task); return task;
  } };
}
