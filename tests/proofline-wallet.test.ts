import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexToString, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PROOFLINE_CHAIN_ID, signBrowserMessage, walletChain, walletAddress, publicWalletError, type Provider, type WalletBinding } from '../app/src/lib/wallet-core.js';
import { createOwnershipChallenge, validateOwnershipChallenge, performanceScope } from '../app/src/lib/proofline.js';
import { readDemo } from '../app/src/lib/evidence.js';
const account = privateKeyToAccount(`0x${'1'.repeat(64)}`), other = privateKeyToAccount(`0x${'2'.repeat(64)}`);
const binding: WalletBinding = { address: account.address, chainId: PROOFLINE_CHAIN_ID, revision: 1, kind: 'browser', name: 'Test' };
const source = readFileSync('app/public/evidence/vault-local-evidence.json', 'utf8'), scope = performanceScope(readDemo(source), source);
const origin = 'http://localhost:5189';
function mock() {
  let current: WalletBinding | undefined = { ...binding }, actual = account.address, chain = 10143, signCalls = 0;
  let hook = async () => {};
  const p: Provider = { request: async ({ method, params }) => {
    if (method === 'eth_accounts') return [actual];
    if (method === 'eth_chainId') return `0x${chain.toString(16)}`;
    if (method === 'personal_sign') { signCalls++; await hook(); return account.signMessage({ message: hexToString(params![0] as Hex) }); }
    throw new Error(`Unexpected wallet RPC ${method}`);
  } };
  return { p, current: () => current, revise: (value?: WalletBinding) => { current = value; }, actual: (value: typeof actual) => { actual = value; }, chain: (value: number) => { chain = value; }, hook: (value: typeof hook) => { hook = value; }, calls: () => signCalls };
}
test('Ownership check verifies recovered EOA and makes no transaction/approval RPC', async () => {
  const m = mock(), message = createOwnershipChallenge(binding, scope, origin, 100, 'a'.repeat(64));
  const signature = await signBrowserMessage(m.p, binding, m.current, message);
  assert.equal(signature, await account.signMessage({ message })); assert.equal(m.calls(), 1);
});
test('Wrong chain and silent account/network changes fail before a wallet signature', async () => {
  for (const setup of [(m: ReturnType<typeof mock>) => m.actual(other.address), (m: ReturnType<typeof mock>) => m.chain(1)]) {
    const m = mock(); setup(m); await assert.rejects(signBrowserMessage(m.p, binding, m.current, 'check')); assert.equal(m.calls(), 0);
  }
  const m = mock(), mainnet = { ...binding, chainId: 1 }; m.revise(mainnet);
  await assert.rejects(signBrowserMessage(m.p, mainnet, m.current, 'check'), /Monad/); assert.equal(m.calls(), 0);
});
test('Switching away and back, disconnecting, or changing account during prompt rejects a late signature', async () => {
  for (const change of [undefined, { ...binding, revision: 3 }, { ...binding, address: other.address }, { ...binding, chainId: 1 }]) {
    const m = mock(); m.hook(async () => m.revise(change)); await assert.rejects(signBrowserMessage(m.p, binding, m.current, 'check'), /Wallet changed/);
  }
  const m = mock(); m.hook(async () => m.chain(1)); await assert.rejects(signBrowserMessage(m.p, binding, m.current, 'check'), /network changed/);
});
test('A provider returning a different signer or malformed signature never verifies', async () => {
  for (const signature of [await other.signMessage({ message: 'check' }), '0xabc']) {
    const m = mock(), request = m.p.request;
    m.p.request = args => args.method === 'personal_sign' ? Promise.resolve(signature) : request(args);
    await assert.rejects(signBrowserMessage(m.p, binding, m.current, 'check'), /Signature|signature/);
  }
});
test('Challenge pins origin, wallet, exact evidence, deployment, strategy and five-minute lifetime', () => {
  const message = createOwnershipChallenge(binding, scope, origin, 100, 'a'.repeat(64));
  validateOwnershipChallenge(message, binding, scope, origin, 101);
  assert.equal(JSON.parse(message).evidence.evidenceChainId, 31337); assert.equal(JSON.parse(message).walletChainId, 10143);
  for (const field of ['vault', 'manager', 'configHash', 'strategyHash', 'bundleHash', 'fromBlock', 'toBlock', 'environment', 'evidenceChainId']) {
    const c = JSON.parse(message); c.evidence[field] = 'altered'; assert.throws(() => validateOwnershipChallenge(JSON.stringify(c), binding, scope, origin, 101));
  }
  for (const changed of [{ ...binding, address: other.address }, { ...binding, chainId: 1 }]) assert.throws(() => validateOwnershipChallenge(message, changed, scope, origin, 101));
  assert.throws(() => validateOwnershipChallenge(message, binding, scope, 'https://other.example', 101));
  assert.throws(() => validateOwnershipChallenge(message, binding, scope, origin, 99));
  assert.throws(() => validateOwnershipChallenge(message, binding, scope, origin, 400));
  const replay = JSON.parse(message); replay.expiresAt = 401; assert.throws(() => validateOwnershipChallenge(JSON.stringify(replay), binding, scope, origin, 101));
});
test('Exact archive bytes are committed; signatures do not upgrade performance evidence', () => {
  assert.notEqual(scope.bundleHash, performanceScope(readDemo(source), source + '\n').bundleHash);
  assert.equal(scope.accounting, 'archive-reconciled-not-independently-verified'); assert.equal(scope.environment, 'simulation');
  const c = JSON.parse(createOwnershipChallenge(binding, scope, origin, 100, 'a'.repeat(64)));
  assert.match(c.purpose, /No trading, spending, registration or vault authority/);
});
test('Malformed wallet data and unavailable PRF have actionable failures', () => {
  for (const value of ['1', '0x0', '0xFFFFFFFFFFFFFFFFFFFFFFFF', null]) assert.throws(() => walletChain(value));
  assert.equal(walletChain('0x279f'), 10143);
  assert.throws(() => walletAddress(`0x${'0'.repeat(40)}`));
  assert.match(publicWalletError({ code: 'PRF_UNAVAILABLE' }), /browser wallet/);
  assert.match(publicWalletError({ code: 4001 }), /declined/);
});

test('Mera signer expires on success and failure; public metadata alone persists', async () => {
  const { withMeraAccount } = await import('../app/src/lib/mera.js');
  const keys = ['window', 'location', 'navigator', 'localStorage'];
  const previous = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const storage = new Map<string, string>(); let captured: Parameters<Parameters<typeof withMeraAccount>[1]>[0] | undefined;
  const prfCredential = { type: 'public-key', rawId: new Uint8Array([1, 2, 3]).buffer, getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(32).fill(42).buffer } } }) };
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, PublicKeyCredential: {} } });
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'localhost' } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { credentials: { get: async () => prfCredential } } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) } });
    const address = await withMeraAccount(false, async signer => { captured = signer; await signer.signMessage({ message: 'check' }); return signer.address; });
    assert.ok(address); await assert.rejects(captured!.signMessage({ message: 'after session' }), /ended/i);
    await assert.rejects(withMeraAccount(false, async signer => { captured = signer; throw new Error('operation failed'); }), /operation failed/);
    await assert.rejects(captured!.signMessage({ message: 'after error' }), /ended/i);
    assert.deepEqual(JSON.parse(storage.get('pumpcoin.mera.credential.v1')!), { credentialId: 'AQID' });
    assert.equal(storage.size, 1);
  } finally {
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
