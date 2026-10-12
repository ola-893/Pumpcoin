import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { getAddress, isAddress, keccak256, stringToHex, recoverMessageAddress, type Address, type Hex } from 'viem';
export const RECORDS_DESIGN_VERSION = 'UNORA-VAULT-RECORDS-v2';
export type Scope = 'strategy-private' | 'investor-personal' | 'public-performance';
export interface EncryptedRecord {
    version: string;
    chainId: number;
    vault: Address;
    scope: Scope;
    period: number;
    owner: Address;
    nonceB64: string;
    dataB64: string;
    tagB64: string;
}
function metadata(r: Pick<EncryptedRecord, 'version' | 'chainId' | 'vault' | 'scope' | 'period' | 'owner'>): Buffer {
    if (r.version !== RECORDS_DESIGN_VERSION || !Number.isSafeInteger(r.chainId) || r.chainId <= 0 || !isAddress(r.vault, { strict: false }) || !isAddress(r.owner, { strict: false }) || !Number.isSafeInteger(r.period) || r.period < 0 || !['strategy-private', 'investor-personal', 'public-performance'].includes(r.scope))
        throw new Error('invalid-record-metadata');
    return Buffer.from(JSON.stringify([r.version, r.chainId, getAddress(r.vault), r.scope, r.period, getAddress(r.owner)]));
}
// Cryptographic primitives only. Possession of a key permits decryption; roles
// cannot secure a key already handed to a caller. Use the service for authorization.
export function encryptRecord(key: Buffer, vault: Address, scope: Scope, period: number, owner: Address, plaintext: Buffer, chainId = 31337): EncryptedRecord {
    if (key.length !== 32)
        throw new Error('key-must-be-32-bytes');
    const rec = { version: RECORDS_DESIGN_VERSION, chainId, vault: getAddress(vault), scope, period, owner: getAddress(owner), nonceB64: '', dataB64: '', tagB64: '' };
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    cipher.setAAD(metadata(rec));
    rec.dataB64 = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64');
    rec.tagB64 = cipher.getAuthTag().toString('base64');
    rec.nonceB64 = nonce.toString('base64');
    return rec;
}
export function decryptRecord(key: Buffer, rec: EncryptedRecord): Buffer {
    if (key.length !== 32)
        throw new Error('key-must-be-32-bytes');
    const nonce = Buffer.from(rec.nonceB64, 'base64'), tag = Buffer.from(rec.tagB64, 'base64');
    if (nonce.length !== 12 || tag.length !== 16)
        throw new Error('invalid-envelope');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    decipher.setAAD(metadata(rec));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(rec.dataB64, 'base64')), decipher.final()]);
}
export interface RecordGrant {
    chainId: number;
    vault: Address;
    manager: Address;
    admin: Address;
}
export interface StoredRecord {
    id: string;
    record: EncryptedRecord;
    key: Buffer;
}
export interface AccessChallenge {
    id: string;
    message: string;
    expiresAt: number;
}
export function createRecordService(args: {
    resolveGrant: (chainId: number, vault: Address) => Promise<RecordGrant | undefined>;
    records: StoredRecord[];
    now?: () => number;
}) {
    // Trusted application construction, not request arguments. Never serialize keys.
    // Production persistence/KMS and on-chain grant refresh must replace this local store.
    const now = args.now ?? Date.now;
    const records = new Map(args.records.map(s => [s.id, { record: structuredClone(s.record), key: Buffer.from(s.key) }]));
    if (records.size !== args.records.length)
        throw new Error('duplicate-record-id');
    const nonces = new Map<string, {
        id: string;
        requester: Address;
        vault: Address;
        chainId: number;
        purpose: string;
        expiresAt: number;
        message: string;
    }>();
    function challenge(requester: Address, vault: Address, chainId: number, purpose: string): AccessChallenge {
        // Bound pending nonces and discard expired entries to avoid unbounded local growth.
        for (const [id, n] of nonces)
            if (n.expiresAt < now())
                nonces.delete(id);
        if (nonces.size >= 1000)
            throw new Error('challenge-capacity');
        const id = randomBytes(32).toString('hex'), expiresAt = now() + 60000;
        const message = JSON.stringify({ domain: 'unora-private-record-access-v1', requester: getAddress(requester), vault: getAddress(vault), chainId, purpose, nonce: id, expiresAt });
        nonces.set(id, { id, requester: getAddress(requester), vault: getAddress(vault), chainId, purpose, expiresAt, message });
        return { id, message, expiresAt };
    }
    async function authenticate(id: string, signature: Hex, purpose: string) {
        const n = nonces.get(id);
        if (!n || n.expiresAt < now() || n.purpose !== purpose)
            throw new Error('invalid-expired-or-replayed-challenge');
        const signer = await recoverMessageAddress({ message: n.message, signature });
        if (getAddress(signer) !== n.requester)
            throw new Error('wrong-signer');
        nonces.delete(id);
        return n;
    }
    async function allowed(requester: Address, rec: EncryptedRecord, vault: Address, chainId: number): Promise<boolean> {
        if (getAddress(rec.vault) !== vault || rec.chainId !== chainId)
            return false;
        const grant = await args.resolveGrant(chainId, vault);
        if (grant && (grant.chainId !== chainId || getAddress(grant.vault) !== vault))
            return false;
        if (rec.scope === 'public-performance')
            return true;
        if (rec.scope === 'investor-personal')
            return getAddress(rec.owner) === requester;
        return !!grant && (getAddress(grant.manager) === requester || getAddress(grant.admin) === requester);
    }
    return {
        challengeRead: (requester: Address, vault: Address, chainId: number, recordId: string) => challenge(requester, vault, chainId, `read:${recordId}`),
        challengeExport: (requester: Address, vault: Address, chainId: number) => challenge(requester, vault, chainId, 'export'),
        async read(recordId: string, id: string, signature: Hex): Promise<Buffer> {
            const n = await authenticate(id, signature, `read:${recordId}`), stored = records.get(recordId);
            if (!stored || !await allowed(n.requester, stored.record, n.vault, n.chainId))
                throw new Error('access-denied');
            return decryptRecord(stored.key, stored.record);
        },
        async export(id: string, signature: Hex): Promise<Array<{
            id: string;
            scope: Scope;
            plaintext: string;
        }>> {
            const n = await authenticate(id, signature, 'export');
            const output: Array<{
                id: string;
                scope: Scope;
                plaintext: string;
            }> = [];
            for (const [recordId, s] of records)
                if (await allowed(n.requester, s.record, n.vault, n.chainId))
                    output.push({ id: recordId, scope: s.record.scope, plaintext: decryptRecord(s.key, s.record).toString('utf8') });
            return output;
        }
    };
}
export interface PublicPackage {
    vault: Address;
    periods: Array<{
        id: number;
        strategyHash: Hex;
        manager: Address;
        startBlock: number;
        endBlock: number | null;
    }>;
    navHistory: Array<{
        block: number;
        nav: string;
        sharePrice: string;
    }>;
    settledExpenses: Array<{
        recipient: Address;
        amount: string;
        serviceId: Hex;
        tx: Hex;
    }>;
    disclosure: string;
    verifier: string;
    trustBoundary: string;
}
export function buildPublicPackage(args: Omit<PublicPackage, 'disclosure' | 'verifier' | 'trustBoundary'>): PublicPackage {
    const integer = (n: number) => { if (!Number.isSafeInteger(n) || n < 0)
        throw new Error('invalid-public-integer'); return n; };
    const amount = (s: string) => { if (typeof s !== 'string' || !/^\d+$/.test(s))
        throw new Error('invalid-public-amount'); return s; };
    const hash = (h: Hex) => { if (typeof h !== 'string' || !/^0x[\da-fA-F]{64}$/.test(h))
        throw new Error('invalid-public-hash'); return h; };
    // Explicit allowlists at EVERY level; structural TS types do not strip runtime fields.
    return { vault: getAddress(args.vault), periods: args.periods.map(p => ({ id: integer(p.id), strategyHash: hash(p.strategyHash), manager: getAddress(p.manager), startBlock: integer(p.startBlock), endBlock: p.endBlock === null ? null : integer(p.endBlock) })), navHistory: args.navHistory.map(n => ({ block: integer(n.block), nav: amount(n.nav), sharePrice: amount(n.sharePrice) })), settledExpenses: args.settledExpenses.map(e => ({ recipient: getAddress(e.recipient), amount: amount(e.amount), serviceId: hash(e.serviceId), tx: hash(e.tx) })), disclosure: 'Local simulation with test tokens; not funded performance. Public trades and share balances remain observable.', verifier: 'unverified-export', trustBoundary: 'This serializer does not verify metrics. Check the separate receipt/checkpoint package; strategy records are excluded.' };
}
export interface SelectiveReport {
    title: string;
    method: 'signed-selective-report';
    label: 'signature-verified';
    signer: Address;
    payloadHash: Hex;
    signature: Hex;
    chainId: number;
    vault: Address;
    trustBoundary: string;
}
export function selectiveReportMessage(title: string, payloadHash: Hex, chainId: number, vault: Address): string {
    if (!/^0x[\da-fA-F]{64}$/.test(payloadHash) || !Number.isSafeInteger(chainId) || chainId <= 0)
        throw new Error('invalid-report-domain');
    return JSON.stringify({ domain: 'unora-selective-report-v1', chainId, vault: getAddress(vault), title, payloadHash });
}
export async function verifySelectiveReport(args: {
    title: string;
    payloadHash: Hex;
    signature: Hex;
    expectedSigner: Address;
    chainId: number;
    vault: Address;
    payload?: string;
}): Promise<SelectiveReport> {
    if (args.payload !== undefined && keccak256(stringToHex(args.payload)) !== args.payloadHash)
        throw new Error('payload-hash-mismatch');
    const signer = await recoverMessageAddress({ message: selectiveReportMessage(args.title, args.payloadHash, args.chainId, args.vault), signature: args.signature });
    if (getAddress(signer) !== getAddress(args.expectedSigner))
        throw new Error('wrong-report-signer');
    return { title: args.title, method: 'signed-selective-report', label: 'signature-verified', signer, payloadHash: args.payloadHash, signature: args.signature, chainId: args.chainId, vault: getAddress(args.vault), trustBoundary: 'Only signer/message authenticity verified; not completeness, accuracy, ZK/TEE privacy or runtime execution.' };
}
