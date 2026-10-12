import { isAddress, type Address, type Hex } from 'viem';
import { navOf, netPnl } from './nav.js';
export type EvidenceLabel = 'operator-claimed' | 'signature-verified' | 'execution-verified' | 'independently-checked' | 'unavailable' | 'inconsistent';
export interface ClaimEvidence {
    label: EvidenceLabel;
    environment: 'simulation' | 'testnet' | 'funded';
    method?: string;
    scope?: string;
    note?: string;
    signer?: string;
}
export interface VaultEvent {
    kind: 'deposit' | 'redeem' | 'trade' | 'accrue' | 'reverse' | 'settle' | 'refund' | 'fund' | 'config' | 'period-close' | 'price' | 'transfer' | 'stream';
    block: number;
    logIndex: number;
    tx: Hex;
    blockHash: Hex;
    emitter: Address;
    amount?: bigint;
    from?: Address;
    to?: Address;
    tokenIn?: Address;
    tokenOut?: Address;
    amountOut?: bigint;
    shares?: bigint;
    owner?: Address;
    valued?: boolean;
    periodId?: bigint;
    configHash?: Hex;
    strategyHash?: Hex;
    manager?: Address;
    stream?: Address;
}
export interface Snapshot {
    cash: bigint;
    positionBalance: bigint;
    escrows: Record<string, bigint>;
    accrued: bigint;
    totalShares: bigint;
    priceE18: bigint;
    valued: boolean;
    managedEscrow: bigint;
}
export interface Coverage {
    chainId: number;
    vault: Address;
    quote: Address;
    position: Address;
    deploymentBlock: number;
    fromBlock: number;
    toBlock: number;
    canonicalHashes: Record<number, Hex>;
    reportVersion: string;
    // Authoritative expected events must come from ALL block transaction receipts,
    // independently of the candidate export being checked. Trust remains in the RPC.
    receiptEvents: VaultEvent[];
    opening: Snapshot;
    closing: Snapshot;
}
export interface ReplayOk {
    status: 'ok';
    deposits: bigint;
    withdrawals: bigint;
    donations: bigint;
    netPnl: bigint;
    periods: number;
    coverage: Coverage;
    trustBoundary: string;
}
export interface ReplayBad {
    status: 'unavailable' | 'inconsistent';
    reason: string;
    coverage: Coverage;
}
const hash = (x: unknown) => typeof x === 'string' && /^0x[\da-fA-F]{64}$/.test(x);
const addr = (x: unknown) => typeof x === 'string' && isAddress(x, { strict: false });
const lower = (x: string) => x.toLowerCase();
const serial = (e: VaultEvent) => JSON.stringify(e, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
const eq = (a: VaultEvent, b: VaultEvent) => serial(a) === serial(b);
const sum = (m: Record<string, bigint>) => Object.values(m).reduce((a, b) => a + b, 0n);
function snapshotNav(s: Snapshot): bigint { return navOf({ ...s, escrow: s.managedEscrow }); }
export function replay(events: VaultEvent[], c: Coverage): ReplayOk | ReplayBad {
    const bad = (reason: string, status: 'unavailable' | 'inconsistent' = 'inconsistent'): ReplayBad => ({ status, reason, coverage: c });
    if (!c || !Number.isSafeInteger(c.chainId) || c.chainId <= 0 || !addr(c.vault) || !addr(c.quote) || !addr(c.position) || !c.reportVersion || !Number.isSafeInteger(c.fromBlock) || !Number.isSafeInteger(c.toBlock) || c.fromBlock < c.deploymentBlock || c.fromBlock < 1 || c.toBlock < c.fromBlock || !Array.isArray(c.receiptEvents) || !c.opening || !c.closing)
        return bad('invalid-coverage', 'unavailable');
    for (let b = c.fromBlock - 1; b <= c.toBlock; b++)
        if (!hash(c.canonicalHashes[b]))
            return bad(`missing-canonical-hash-${b}`, 'unavailable');
    if (events.length !== c.receiptEvents.length)
        return bad('missing-or-extra-receipt-events');
    let prevBlock = -1, prevLog = -1;
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (!eq(e, c.receiptEvents[i]))
            return bad('receipt-event-mismatch');
        if (e.block < c.fromBlock || e.block > c.toBlock || e.blockHash !== c.canonicalHashes[e.block] || !hash(e.tx) || !addr(e.emitter) || !Number.isSafeInteger(e.logIndex) || e.logIndex < 0)
            return bad('event-scope-or-hash');
        if (e.block < prevBlock || (e.block === prevBlock && e.logIndex <= prevLog))
            return bad('reordered-or-duplicate');
        if (e.amount !== undefined && e.amount < 0n)
            return bad('negative-event');
        prevBlock = e.block;
        prevLog = e.logIndex;
    }
    if (!c.opening.valued || !c.closing.valued || events.some(e => (e.kind === 'config' || e.kind === 'period-close') && e.valued !== true))
        return bad('unvalued-boundary', 'unavailable');
    let cash = c.opening.cash, pos = c.opening.positionBalance, accrued = c.opening.accrued, shares = c.opening.totalShares;
    const escrows = Object.fromEntries(Object.entries(c.opening.escrows).map(([k, v]) => [lower(k), v]));
    for (const address of Object.keys(c.closing.escrows))
        escrows[lower(address)] ??= 0n;
    let deposits = 0n, withdrawals = 0n, donations = 0n, periods = 0, managedEscrow = c.opening.managedEscrow;
    const txGroups = new Map<string, VaultEvent[]>();
    for (const e of events) {
        const group = txGroups.get(e.tx) ?? [];
        group.push(e);
        txGroups.set(e.tx, group);
    }
    const zero = '0x0000000000000000000000000000000000000000';
    const incomeMatches = new Set<VaultEvent>();
    for (const group of txGroups.values()) {
        for (let i = 0; i < group.length; i++) {
            const e = group[i];
            if (e.kind === 'deposit') {
                const mint = group[i - 1], payment = group[i - 2];
                if (!mint || !payment || mint.kind !== 'transfer' || payment.kind !== 'transfer' || lower(mint.emitter) !== lower(c.vault) || lower(payment.emitter) !== lower(c.quote) || mint.from?.toLowerCase() !== zero || mint.to?.toLowerCase() !== e.to?.toLowerCase() || mint.amount !== e.shares || payment.to?.toLowerCase() !== lower(c.vault) || payment.from?.toLowerCase() !== e.from?.toLowerCase() || payment.amount !== e.amount)
                    return bad('unmatched-deposit-companions');
                if (incomeMatches.has(payment))
                    return bad('duplicate-payment-attribution');
                incomeMatches.add(payment);
            }
            if (e.kind === 'trade') {
                const output = group[i - 1], input = group[i - 2];
                if (!output || !input || output.kind !== 'transfer' || input.kind !== 'transfer' || !e.tokenOut || !e.tokenIn || lower(output.emitter) !== lower(e.tokenOut) || output.to?.toLowerCase() !== lower(c.vault) || output.amount !== e.amountOut || lower(input.emitter) !== lower(e.tokenIn) || input.from?.toLowerCase() !== lower(c.vault) || input.amount !== e.amount)
                    return bad('unmatched-trade-companions');
                if (incomeMatches.has(output))
                    return bad('duplicate-payment-attribution');
                incomeMatches.add(output);
            }
        }
    }
    for (const e of events) {
        if (e.kind === 'deposit')
            deposits += e.amount ?? 0n;
        if (e.kind === 'redeem')
            withdrawals += e.amount ?? 0n;
        if (e.kind === 'config')
            periods++;
        if (e.kind === 'fund')
            managedEscrow += e.amount ?? 0n;
        if (e.kind === 'settle' || e.kind === 'refund')
            managedEscrow -= e.amount ?? 0n;
        if (e.kind === 'accrue')
            accrued += e.amount ?? 0n;
        if (e.kind === 'reverse' || e.kind === 'settle')
            accrued -= e.amount ?? 0n;
        if (e.kind === 'stream' && e.stream && lower(e.stream) !== zero)
            escrows[lower(e.stream)] ??= 0n;
        if (e.kind === 'transfer') {
            if (!e.from || !e.to || e.amount === undefined)
                return bad('malformed-transfer');
            const from = lower(e.from), to = lower(e.to), token = lower(e.emitter), amount = e.amount;
            if (token === lower(c.vault)) {
                if (from === zero)
                    shares += amount;
                if (to === zero)
                    shares -= amount;
            }
            if (token === lower(c.quote)) {
                if (from === lower(c.vault))
                    cash -= amount;
                if (to === lower(c.vault))
                    cash += amount;
                if (from in escrows)
                    escrows[from] -= amount;
                if (to in escrows)
                    escrows[to] += amount;
                if (to === lower(c.vault) && from !== lower(c.vault) && !(from in escrows)) {
                    if (!incomeMatches.has(e))
                        donations += amount;
                }
            }
            if (token === lower(c.position)) {
                if (from === lower(c.vault))
                    pos -= amount;
                if (to === lower(c.vault))
                    pos += amount;
                if (to === lower(c.vault) && !incomeMatches.has(e))
                    return bad('unaccounted-position-donation');
            }
        }
        if ([cash, pos, accrued, shares, managedEscrow, ...Object.values(escrows)].some(x => x < 0n))
            return bad('negative-replayed-state');
    }
    const wantEscrows = Object.fromEntries(Object.entries(c.closing.escrows).map(([k, v]) => [lower(k), v]));
    if (managedEscrow !== c.closing.managedEscrow || cash !== c.closing.cash || pos !== c.closing.positionBalance || accrued !== c.closing.accrued || shares !== c.closing.totalShares || Object.entries(escrows).some(([k, v]) => v !== (wantEscrows[k] ?? 0n)))
        return bad('checkpoint-mismatch');
    return { status: 'ok', deposits, withdrawals, donations, netPnl: netPnl(snapshotNav(c.opening), snapshotNav(c.closing), [{ kind: 'deposit', amount: deposits }, { kind: 'withdraw', amount: withdrawals }]) - donations, periods, coverage: c, trustBoundary: 'Complete only for the stated vault/block range under the selected RPC provider; canonical receipts and balance checkpoints are checked. No independent RPC quorum or runtime proof.' };
}
export function backtestLabel(): ClaimEvidence { return { label: 'operator-claimed', method: 'backtest', environment: 'simulation', note: 'Backtest only; not funded execution.' }; }
// A mode name alone is never proof of execution.
export function labelFundedExecution(environment: ClaimEvidence['environment']): ClaimEvidence { return { label: 'operator-claimed', environment, method: 'unverified-mode-declaration', note: 'Execution requires a successfully reconciled receipt package.' }; }
export function replayEvidence(report: ReplayOk | ReplayBad, environment: ClaimEvidence['environment']): ClaimEvidence { if (environment === 'funded' || (report.coverage.chainId === 31337 && environment !== 'simulation'))
    return { label: 'unavailable', environment, note: 'Funded execution is outside this test-token slice; chain/environment mismatch is not verified.' }; return report.status === 'ok' ? { label: 'execution-verified', environment, method: 'rpc-receipt-and-state-reconciliation', scope: `${report.coverage.chainId}:${report.coverage.vault}:${report.coverage.fromBlock}-${report.coverage.toBlock}`, note: environment === 'simulation' ? 'Test-token simulation only; not funded performance.' : report.trustBoundary } : { label: report.status, environment, note: report.reason }; }
