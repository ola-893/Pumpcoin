import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, stringToHex, type Address, type Hex } from 'viem';
import { navOf, netPnl, perShare, NAV_POLICY_HASH, NAV_POLICY_VERSION } from '../vault/nav.js';
import { replay, replayEvidence, labelFundedExecution, type Coverage, type VaultEvent, type Snapshot } from '../vault/ledger.js';
const V = '0x0000000000000000000000000000000000000001' as Address, Q = '0x0000000000000000000000000000000000000002' as Address, P = '0x0000000000000000000000000000000000000003' as Address, S = '0x0000000000000000000000000000000000000004' as Address, A = '0x0000000000000000000000000000000000000005' as Address;
const H = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex;
const snap: Snapshot = { cash: 1000n, positionBalance: 0n, escrows: { [S]: 0n }, accrued: 0n, totalShares: 1000n, priceE18: 10n ** 18n, valued: true, managedEscrow: 0n };
const event = (kind: VaultEvent['kind'], logIndex: number, fields: Partial<VaultEvent> = {}): VaultEvent => ({ kind, block: 1, logIndex, tx: H(11), blockHash: H(1), emitter: V, ...fields });
function coverage(events: VaultEvent[] = [], closing: Snapshot = snap): Coverage { return { chainId: 31337, vault: V, quote: Q, position: P, deploymentBlock: 1, fromBlock: 1, toBlock: 1, canonicalHashes: { 0: H(0), 1: H(1) }, reportVersion: 'v1', receiptEvents: structuredClone(events), opening: structuredClone(snap), closing: structuredClone(closing) }; }
test('NAV and P&L distinguish losses, accrued costs and capital flows', () => {
    assert.equal(navOf({ cash: 500n, positionBalance: 500n, priceE18: 8n * 10n ** 17n, escrow: 0n, accrued: 10n }), 890n);
    assert.equal(netPnl(1000n, 2200n, [{ kind: 'deposit', amount: 1100n }]), 100n);
    assert.equal(netPnl(2200n, 1200n, [{ kind: 'withdraw', amount: 1100n }]), 100n);
    assert.throws(() => navOf({ cash: -1n, positionBalance: 0n, priceE18: 1n, escrow: 0n, accrued: 0n }));
});
test('Policy hash is computed and whole-share price is not rounded to zero', () => {
    assert.equal(NAV_POLICY_HASH, keccak256(stringToHex(NAV_POLICY_VERSION)));
    assert.equal(perShare(1000000000n, 1000000000000000n), 1000000n);
});
test('Removing a log inside a represented block fails against receipt coverage', () => {
    const es = [event('accrue', 0, { amount: 10n }), event('reverse', 1, { amount: 10n })], c = coverage(es);
    assert.equal(replay(es, c).status, 'ok');
    assert.equal(replay(es.slice(0, 1), c).status, 'inconsistent');
    assert.equal(replay([], c).status, 'inconsistent');
    assert.equal(replay([es[1], es[0]], c).status, 'inconsistent');
    assert.equal(replay([es[0], es[0]], c).status, 'inconsistent');
});
test('Missing hashes, reorged logs, wrong emitter, altered tx and missing snapshots fail closed', () => {
    const es = [event('accrue', 0, { amount: 10n })], c = coverage(es, { ...snap, accrued: 10n });
    assert.equal(replay(es, { ...c, canonicalHashes: {} }).status, 'unavailable');
    for (const change of [{ blockHash: H(99) }, { emitter: A }, { tx: H(99) }])
        assert.equal(replay([{ ...es[0], ...change }], c).status, 'inconsistent');
    assert.equal(replay(es, { ...c, closing: { ...snap, cash: 999n } }).status, 'inconsistent');
    assert.equal(replay(es, { ...c, closing: undefined } as unknown as Coverage).status, 'unavailable');
});
test('Expense funding/settlement/refund stay out of investor capital totals', () => {
    const es = [
        event('transfer', 0, { emitter: Q, from: V, to: S, amount: 50n }), event('fund', 1, { amount: 50n }),
        event('accrue', 2, { amount: 30n }), event('transfer', 3, { emitter: Q, from: S, to: A, amount: 30n }), event('settle', 4, { amount: 30n }),
        event('transfer', 5, { emitter: Q, from: S, to: V, amount: 20n }), event('refund', 6, { amount: 20n }),
    ];
    const r = replay(es, coverage(es, { ...snap, cash: 970n }));
    assert.equal(r.status, 'ok');
    if (r.status !== 'ok')
        return;
    assert.equal(r.deposits, 0n);
    assert.equal(r.withdrawals, 0n);
    assert.equal(r.donations, 0n);
    assert.equal(r.netPnl, -30n);
});
test('Capital issuance and share supply reconcile without creating profit', () => {
    const z = '0x0000000000000000000000000000000000000000' as Address;
    const es = [event('transfer', 0, { emitter: Q, from: A, to: V, amount: 100n }), event('transfer', 1, { emitter: V, from: z, to: A, amount: 100n }), event('deposit', 2, { amount: 100n, shares: 100n, from: A, to: A })];
    const r = replay(es, coverage(es, { ...snap, cash: 1100n, totalShares: 1100n }));
    assert.equal(r.status, 'ok');
    if (r.status !== 'ok')
        return;
    assert.equal(r.netPnl, 0n);
});
test('Unsolicited quote donation is disclosed separately from trading profit', () => {
    const es = [event('transfer', 0, { emitter: Q, from: A, to: V, amount: 100n })];
    const r = replay(es, coverage(es, { ...snap, cash: 1100n }));
    assert.equal(r.status, 'ok');
    if (r.status !== 'ok')
        return;
    assert.equal(r.donations, 100n);
    assert.equal(r.netPnl, 0n);
});
test('Unvalued boundaries do not become zero-price performance', () => {
    const es = [event('config', 0, { valued: false })];
    assert.equal(replay(es, coverage(es)).status, 'unavailable');
    assert.equal(replay([], { ...coverage(), opening: { ...snap, valued: false } }).status, 'unavailable');
});
test('A mode name or local simulation cannot become a funded badge', () => {
    assert.equal(labelFundedExecution('funded').label, 'operator-claimed');
    const r = replay([], coverage());
    assert.equal(replayEvidence(r, 'simulation').label, 'execution-verified');
    assert.equal(replayEvidence(r, 'funded').label, 'unavailable');
    assert.equal(replayEvidence(r, 'testnet').label, 'unavailable');
});
test('Equal-amount donation in the same transaction cannot be mistaken for investor deposit', () => {
    const z = '0x0000000000000000000000000000000000000000' as Address;
    const es = [event('transfer', 0, { emitter: Q, from: A, to: V, amount: 100n }), event('transfer', 1, { emitter: Q, from: A, to: V, amount: 100n }), event('transfer', 2, { emitter: V, from: z, to: A, amount: 100n }), event('deposit', 3, { amount: 100n, shares: 100n, from: A, to: A })];
    const r = replay(es, coverage(es, { ...snap, cash: 1200n, totalShares: 1100n }));
    assert.equal(r.status, 'ok');
    if (r.status !== 'ok')
        return;
    assert.equal(r.deposits, 100n);
    assert.equal(r.donations, 100n);
    assert.equal(r.netPnl, 0n);
});
