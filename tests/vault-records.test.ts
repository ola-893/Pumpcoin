import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { keccak256, stringToHex, type Address } from 'viem';
import { encryptRecord, decryptRecord, createRecordService, buildPublicPackage, verifySelectiveReport, selectiveReportMessage, type RecordGrant } from '../vault/records.js';
const manager = privateKeyToAccount(generatePrivateKey()), alice = privateKeyToAccount(generatePrivateKey()), bob = privateKeyToAccount(generatePrivateKey());
const V = '0x0000000000000000000000000000000000000001' as Address, V2 = '0x0000000000000000000000000000000000000002' as Address;
const key = randomBytes(32);
function setup() {
    let clock = 1000;
    let owner = manager.address;
    const records = [{ id: 'strategy', key, record: encryptRecord(key, V, 'strategy-private', 1, manager.address, Buffer.from('weights')) }, { id: 'alice', key, record: encryptRecord(key, V, 'investor-personal', 1, alice.address, Buffer.from('alice statement')) }, { id: 'bob', key, record: encryptRecord(key, V, 'investor-personal', 1, bob.address, Buffer.from('bob statement')) }, { id: 'other-vault', key, record: encryptRecord(key, V2, 'strategy-private', 1, bob.address, Buffer.from('other weights')) }];
    const resolveGrant = async (chainId: number, vault: Address): Promise<RecordGrant | undefined> => vault === V ? { chainId, vault, manager: owner, admin: owner } : vault === V2 ? { chainId, vault, manager: bob.address, admin: bob.address } : undefined;
    return { service: createRecordService({ resolveGrant, records, now: () => clock }), rotate: () => { owner = bob.address; }, expire: () => { clock += 60001; }, records };
}
test('Authenticated encryption rejects wrong key and metadata/ciphertext tampering', () => {
    const r = encryptRecord(key, V, 'strategy-private', 1, manager.address, Buffer.from('weights'));
    assert.equal(decryptRecord(key, r).toString(), 'weights');
    assert.throws(() => decryptRecord(randomBytes(32), r));
    for (const change of [{ chainId: 1 }, { vault: V2 }, { period: 2 }, { owner: alice.address }, { scope: 'investor-personal' as const }, { version: 'v0' }, { dataB64: Buffer.from('tampered').toString('base64') }])
        assert.throws(() => decryptRecord(key, { ...r, ...change }));
    assert.notEqual(r.nonceB64, encryptRecord(key, V, 'strategy-private', 1, manager.address, Buffer.from('weights')).nonceB64);
});
test('Authentic manager succeeds; spoofed signer, challenge replay and expired request fail', async () => {
    const { service, expire } = setup();
    const c = service.challengeRead(manager.address, V, 31337, 'strategy');
    const sig = await manager.signMessage({ message: c.message });
    assert.equal((await service.read('strategy', c.id, sig)).toString(), 'weights');
    await assert.rejects(service.read('strategy', c.id, sig));
    const spoof = service.challengeRead(manager.address, V, 31337, 'strategy');
    await assert.rejects(service.read('strategy', spoof.id, await alice.signMessage({ message: spoof.message })), /wrong-signer/);
    const old = service.challengeRead(manager.address, V, 31337, 'strategy');
    expire();
    await assert.rejects(service.read('strategy', old.id, await manager.signMessage({ message: old.message })), /expired/);
});
test('Investor cannot claim a manager role, another investor or another vault', async () => {
    const { service } = setup();
    for (const [requester, vault, record] of [[alice, V, 'strategy'], [bob, V, 'alice'], [manager, V2, 'other-vault']] as const) {
        const c = service.challengeRead(requester.address, vault, 31337, record);
        await assert.rejects(service.read(record, c.id, await requester.signMessage({ message: c.message })), /access-denied/);
    }
    const c = service.challengeRead(alice.address, V, 31337, 'alice');
    assert.equal((await service.read('alice', c.id, await alice.signMessage({ message: c.message }))).toString(), 'alice statement');
});
test('Request signatures are bound to record, chain, vault and operation', async () => {
    const { service } = setup();
    const c = service.challengeRead(manager.address, V, 31337, 'strategy');
    const sig = await manager.signMessage({ message: c.message });
    await assert.rejects(service.read('alice', c.id, sig));
    await assert.rejects(service.export(c.id, sig));
    const wrongChain = service.challengeRead(manager.address, V, 1, 'strategy');
    await assert.rejects(service.read('strategy', wrongChain.id, await manager.signMessage({ message: wrongChain.message })), /access-denied/);
});
test('Revoked manager cannot read after trusted role resolution changes', async () => {
    const { service, rotate } = setup();
    const c = service.challengeRead(manager.address, V, 31337, 'strategy');
    rotate();
    await assert.rejects(service.read('strategy', c.id, await manager.signMessage({ message: c.message })), /access-denied/);
});
test('Authenticated owner export excludes other investors and private strategies', async () => {
    const { service } = setup();
    const c = service.challengeExport(alice.address, V, 31337);
    const items = await service.export(c.id, await alice.signMessage({ message: c.message }));
    assert.deepEqual(items, [{ id: 'alice', scope: 'investor-personal', plaintext: 'alice statement' }]);
    assert.ok(!JSON.stringify(items).includes('bob'));
});
test('Public serializer strips unknown fields at root and nested levels', () => {
    const h = keccak256(stringToHex('test'));
    const input = { vault: V, privateStrategy: 'secret', periods: [{ id: 1, strategyHash: h, manager: manager.address, startBlock: 1, endBlock: null, privateNotes: 'secret' }], navHistory: [{ block: 1, nav: '100', sharePrice: '1', privateInvestor: 'secret' }], settledExpenses: [{ recipient: alice.address, amount: '3', serviceId: h, tx: h, privateInvoice: 'secret' }] };
    const p = buildPublicPackage(input);
    assert.ok(!JSON.stringify(p).includes('secret'));
    assert.equal(p.verifier, 'unverified-export');
    assert.match(p.disclosure, /Public trades/);
});
test('Selective claims verify signature/domain/payload before assigning verified label', async () => {
    const title = 'period 1', payload = '{"return":"-10%"}', payloadHash = keccak256(stringToHex(payload));
    const signature = await manager.signMessage({ message: selectiveReportMessage(title, payloadHash, 31337, V) });
    const args = { title, payloadHash, payload, signature, expectedSigner: manager.address, chainId: 31337, vault: V };
    const r = await verifySelectiveReport(args);
    assert.equal(r.label, 'signature-verified');
    assert.match(r.trustBoundary, /not completeness/);
    await assert.rejects(verifySelectiveReport({ ...args, payload: 'altered' }));
    await assert.rejects(verifySelectiveReport({ ...args, vault: V2 }));
    await assert.rejects(verifySelectiveReport({ ...args, expectedSigner: bob.address }));
});
