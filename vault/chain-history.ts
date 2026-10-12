import { decodeEventLog, parseAbi, type Address, type Hex, type PublicClient } from 'viem';
import { replay, type Coverage, type Snapshot, type VaultEvent } from './ledger.js';
const zero = '0x0000000000000000000000000000000000000000';
const eventsAbi = parseAbi([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Deposit(address indexed sender,address indexed owner,uint256 assets,uint256 shares)',
    'event Withdraw(address indexed sender,address indexed receiver,address indexed owner,uint256 assets,uint256 shares)',
    'event ManagerTrade(address indexed venue,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut)',
    'event ExpenseAccrued(uint256 amount,uint256 totalAccrued)',
    'event ExpenseAccrualReversed(uint256 amount,uint256 totalAccrued)',
    'event ExpenseSettled(bytes32 indexed obligationId,uint256 amount)',
    'event ExpenseRefunded(bytes32 indexed obligationId,uint256 amount)',
    'event ExpenseFunded(bytes32 indexed obligationId,uint256 amount,bytes32 serviceId,address recipient)',
    'event PeriodOpened(uint256 indexed periodId,bytes32 configHash,bytes32 strategyHash,address manager,bool valued)',
    'event PeriodClosed(uint256 indexed periodId,uint256 endNAV,bool valued)',
    'event ExpenseStreamUpdated(address indexed stream)',
]);
const reads = parseAbi([
    'function asset() view returns (address)', 'function positionAsset() view returns (address)',
    'function expenseStream() view returns (address)', 'function valuationSource() view returns (address)',
    'function accruedExpenses() view returns (uint256)', 'function totalSupply() view returns (uint256)',
    'function price() view returns (uint256)', 'function status() view returns (bool available,bytes32 reason)',
    'function balanceOf(address) view returns (uint256)', 'function escrowBalance() view returns(uint256)', 'function totalAssets() view returns(uint256)',
]);
export const VAULT_REPORT_VERSION = 'UNORA-RPC-REPLAY-v1';
// All receipts are scanned, rather than trusting a potentially truncated eth_getLogs export.
// A lying/pruned RPC is still a trust boundary. Missing data fails; no quorum is claimed.
export async function collectVaultHistory(client: PublicClient, args: {
    vault: Address;
    deploymentBlock: bigint;
    fromBlock: bigint;
    toBlock: bigint;
}) {
    if (args.fromBlock < args.deploymentBlock || args.fromBlock < 1n || args.toBlock < args.fromBlock || args.toBlock - args.fromBlock > 2000n || args.toBlock > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('invalid-or-oversized-coverage');
    const chainId = await client.getChainId();
    const read = async (address: Address, functionName: 'asset' | 'positionAsset' | 'expenseStream' | 'valuationSource' | 'accruedExpenses' | 'totalSupply' | 'price' | 'status' | 'escrowBalance' | 'totalAssets', blockNumber: bigint) => client.readContract({ address, abi: reads, functionName, blockNumber });
    const quote = await read(args.vault, 'asset', args.toBlock) as Address;
    const position = await read(args.vault, 'positionAsset', args.toBlock) as Address;
    const canonicalHashes: Record<number, Hex> = {};
    const streams = new Set<Address>();
    const receipts = [];
    let previous: Hex | undefined;
    for (let b = args.fromBlock - 1n; b <= args.toBlock; b++) {
        const block = await client.getBlock({ blockNumber: b });
        if (block.number !== b || !block.hash || (previous && block.parentHash !== previous))
            throw new Error('noncanonical-block-sequence');
        canonicalHashes[Number(b)] = block.hash;
        previous = block.hash;
        if (b < args.fromBlock)
            continue;
        for (const tx of block.transactions) {
            const receipt = await client.getTransactionReceipt({ hash: tx });
            if (receipt.blockNumber !== b || receipt.blockHash !== block.hash)
                throw new Error('receipt-block-mismatch');
            if (receipt.status !== 'success' && receipt.logs.length)
                throw new Error('reverted-receipt-has-logs');
            receipts.push(receipt);
            for (const log of receipt.logs) {
                if (log.address.toLowerCase() !== args.vault.toLowerCase())
                    continue;
                try {
                    const d = decodeEventLog({ abi: eventsAbi, data: log.data, topics: log.topics });
                    if (d.eventName === 'ExpenseStreamUpdated' && d.args.stream.toLowerCase() !== zero)
                        streams.add(d.args.stream);
                }
                catch { /* other vault events carry no economic deltas */ }
            }
        }
    }
    const balance = async (token: Address, owner: Address, blockNumber: bigint) => client.readContract({ address: token, abi: reads, functionName: 'balanceOf', args: [owner], blockNumber });
    const snapshot = async (b: bigint): Promise<Snapshot> => {
        if (b < args.deploymentBlock)
            return { cash: 0n, positionBalance: 0n, escrows: {}, accrued: 0n, totalShares: 0n, priceE18: 0n, valued: true, managedEscrow: 0n };
        const stream = await read(args.vault, 'expenseStream', b) as Address;
        if (stream.toLowerCase() !== zero)
            streams.add(stream);
        const source = await read(args.vault, 'valuationSource', b) as Address;
        const state = await read(source, 'status', b) as readonly [
            boolean,
            Hex
        ];
        let valued = state[0];
        try {
            await read(args.vault, 'totalAssets', b);
        }
        catch {
            valued = false;
        }
        const managedEscrow = stream.toLowerCase() === zero ? 0n : await read(stream, 'escrowBalance', b) as bigint;
        const escrows: Record<string, bigint> = {};
        for (const s of streams)
            escrows[s.toLowerCase()] = await balance(quote, s, b);
        return { cash: await balance(quote, args.vault, b), positionBalance: await balance(position, args.vault, b), escrows, accrued: await read(args.vault, 'accruedExpenses', b) as bigint, totalShares: await read(args.vault, 'totalSupply', b) as bigint, priceE18: await read(source, 'price', b) as bigint, valued, managedEscrow };
    };
    // Discover initial/final stream before building both checkpoints.
    for (const b of [args.fromBlock - 1n, args.toBlock])
        if (b >= args.deploymentBlock) {
            const s = await read(args.vault, 'expenseStream', b) as Address;
            if (s.toLowerCase() !== zero)
                streams.add(s);
        }
    const opening = await snapshot(args.fromBlock - 1n), closing = await snapshot(args.toBlock);
    const result: VaultEvent[] = [];
    for (const receipt of receipts) {
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== args.vault.toLowerCase() && log.address.toLowerCase() !== quote.toLowerCase() && log.address.toLowerCase() !== position.toLowerCase())
                continue;
            let d;
            try {
                d = decodeEventLog({ abi: eventsAbi, data: log.data, topics: log.topics });
            }
            catch {
                continue;
            }
            if (log.blockNumber === null || log.logIndex === null || !log.transactionHash || !log.blockHash)
                throw new Error('pending-log');
            const base = { block: Number(log.blockNumber), logIndex: log.logIndex, tx: log.transactionHash, blockHash: log.blockHash, emitter: log.address };
            if (d.eventName === 'Transfer') {
                const a = d.args;
                if (log.address.toLowerCase() === quote.toLowerCase() || log.address.toLowerCase() === position.toLowerCase()) {
                    const tracked = new Set([args.vault.toLowerCase(), ...Array.from(streams, s => s.toLowerCase())]);
                    if (!tracked.has(a.from.toLowerCase()) && !tracked.has(a.to.toLowerCase()))
                        continue;
                }
                result.push({ ...base, kind: 'transfer', amount: a.value, from: a.from, to: a.to });
            }
            else if (log.address.toLowerCase() === args.vault.toLowerCase()) {
                switch (d.eventName) {
                    case 'Deposit':
                        result.push({ ...base, kind: 'deposit', amount: d.args.assets, shares: d.args.shares, from: d.args.sender, to: d.args.owner });
                        break;
                    case 'Withdraw':
                        result.push({ ...base, kind: 'redeem', amount: d.args.assets, shares: d.args.shares, from: d.args.sender, to: d.args.receiver, owner: d.args.owner });
                        break;
                    case 'ManagerTrade':
                        result.push({ ...base, kind: 'trade', amount: d.args.amountIn, amountOut: d.args.amountOut, tokenIn: d.args.tokenIn, tokenOut: d.args.tokenOut });
                        break;
                    case 'ExpenseAccrued':
                        result.push({ ...base, kind: 'accrue', amount: d.args.amount });
                        break;
                    case 'ExpenseAccrualReversed':
                        result.push({ ...base, kind: 'reverse', amount: d.args.amount });
                        break;
                    case 'ExpenseSettled':
                        result.push({ ...base, kind: 'settle', amount: d.args.amount });
                        break;
                    case 'ExpenseRefunded':
                        result.push({ ...base, kind: 'refund', amount: d.args.amount });
                        break;
                    case 'ExpenseFunded':
                        result.push({ ...base, kind: 'fund', amount: d.args.amount });
                        break;
                    case 'ExpenseStreamUpdated':
                        result.push({ ...base, kind: 'stream', stream: d.args.stream });
                        break;
                    case 'PeriodOpened':
                        result.push({ ...base, kind: 'config', periodId: d.args.periodId, configHash: d.args.configHash, strategyHash: d.args.strategyHash, manager: d.args.manager, valued: d.args.valued });
                        break;
                    case 'PeriodClosed':
                        result.push({ ...base, kind: 'period-close', periodId: d.args.periodId, valued: d.args.valued });
                        break;
                }
            }
        }
    }
    result.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
    // Recheck EVERY scanned block after reads: do not accept a reorg during collection.
    for (let b = args.fromBlock - 1n; b <= args.toBlock; b++)
        if ((await client.getBlock({ blockNumber: b })).hash !== canonicalHashes[Number(b)])
            throw new Error('reorg-during-collection');
    if (await client.getChainId() !== chainId)
        throw new Error('chain-changed-during-collection');
    const coverage: Coverage = { chainId, vault: args.vault, quote, position, deploymentBlock: Number(args.deploymentBlock), fromBlock: Number(args.fromBlock), toBlock: Number(args.toBlock), canonicalHashes, reportVersion: VAULT_REPORT_VERSION, receiptEvents: result, opening, closing };
    return { events: result, coverage, report: replay(result, coverage) };
}
// Verify an untrusted export against fresh RPC reads, not against the export's
// own purported canonical map/checkpoints. The caller supplies the known deployment.
export async function verifyVaultExport(client: PublicClient, expected: {
    chainId: number;
    vault: Address;
    deploymentBlock: bigint;
}, candidate: {
    events: VaultEvent[];
    coverage: Coverage;
}) {
    if (await client.getChainId() !== expected.chainId || candidate.coverage.chainId !== expected.chainId || candidate.coverage.vault.toLowerCase() !== expected.vault.toLowerCase() || BigInt(candidate.coverage.deploymentBlock) !== expected.deploymentBlock)
        throw new Error('export-deployment-mismatch');
    const fresh = await collectVaultHistory(client, { vault: expected.vault, deploymentBlock: expected.deploymentBlock, fromBlock: BigInt(candidate.coverage.fromBlock), toBlock: BigInt(candidate.coverage.toBlock) });
    const serialize = (x: unknown) => JSON.stringify(x, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
    if (serialize(candidate.coverage.opening) !== serialize(fresh.coverage.opening) || serialize(candidate.coverage.closing) !== serialize(fresh.coverage.closing) || serialize(candidate.coverage.canonicalHashes) !== serialize(fresh.coverage.canonicalHashes))
        return { status: 'inconsistent' as const, reason: 'export-checkpoint-or-canonical-mismatch', coverage: fresh.coverage };
    return replay(candidate.events, fresh.coverage);
}
// Decode the saved JSON bundle without lossy conversion of integer token/share units.
// Parsing establishes types only; callers must still run verifyVaultExport with
// an independently known deployment and live/archive RPC.
export function parseVaultExport(json: string): {
    events: VaultEvent[];
    coverage: Coverage;
} {
    if (json.length > 15000000)
        throw new Error('export-too-large');
    const root = JSON.parse(json), input = root.bundle ?? root;
    if (!input || !Array.isArray(input.events) || !input.coverage)
        throw new Error('invalid-export');
    const integer = (x: unknown): bigint => { if (typeof x !== 'string' || !/^\d+$/.test(x))
        throw new Error('invalid-integer-export'); return BigInt(x); };
    const event = (e: VaultEvent): VaultEvent => { const copy = { ...e }; for (const k of ['amount', 'amountOut', 'shares', 'periodId'] as const)
        if (copy[k] !== undefined)
            copy[k] = integer(copy[k]); return copy; };
    const snapshot = (s: Snapshot): Snapshot => ({ ...s, cash: integer(s.cash), positionBalance: integer(s.positionBalance), accrued: integer(s.accrued), totalShares: integer(s.totalShares), priceE18: integer(s.priceE18), managedEscrow: integer(s.managedEscrow), escrows: Object.fromEntries(Object.entries(s.escrows).map(([k, v]) => [k, integer(v)])) });
    const c = input.coverage as Coverage;
    return { events: input.events.map(event), coverage: { ...c, opening: snapshot(c.opening), closing: snapshot(c.closing), receiptEvents: c.receiptEvents.map(event) } };
}
