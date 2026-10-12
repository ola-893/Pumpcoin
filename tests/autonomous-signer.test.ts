import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, chmod, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { encodeFunctionData, parseAbi, recoverMessageAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ExecutionSignerStore } from '../agent-registration/signer.js';
import { initialDraft, prepareManifest } from '../app/src/lib/registration.js';
import { authorizationMessage } from '../agent-registration/core.js';
import { registrationService } from '../agent-registration/service.js';
import { checkLocalWorker } from '../agent-registration/worker.js';
import { tradeArguments, type AutonomousDeployment, type TradeSnapshot } from '../agent-registration/autonomous.js';
import { sendBrowserVaultTransaction, type WalletBinding } from '../app/src/lib/wallet-core.js';
import type { Detection } from '../local-inference/types.js';

test('Encrypted signer survives restart, authenticates metadata, refuses unsafe files and never exports keys', async () => {
  const root = await mkdtemp(join(tmpdir(), 'autonomy-keystore-'));
  try {
    const password = join(root, 'unlock'), directory = join(root, 'keys');
    await writeFile(password, randomBytes(48), { mode: 0o600 });
    const owner = privateKeyToAccount(generatePrivateKey()), store = await ExecutionSignerStore.load(directory, password);
    const address = await store.provision(owner.address, 'Agent');
    assert.equal(await store.provision(owner.address, 'Agent'), address);
    assert.notEqual(await store.provision(owner.address, 'Other'), address);
    const names = await readdir(directory), path = join(directory, names[0]);
    const before = await readFile(path, 'utf8');
    assert.ok(!before.includes('privateKey')); assert.ok(!before.includes('0x' + '0'.repeat(64)));
    store.close(); await assert.rejects(store.account(owner.address, 'Agent'), /locked/);
    const restarted = await ExecutionSignerStore.load(directory, password);
    assert.equal(await restarted.provision(owner.address, 'Agent'), address);
    const e = JSON.parse(before); e.tag = '0'.repeat(32); await writeFile(path, JSON.stringify(e));
    await assert.rejects(restarted.provision(e.controller, e.name));
    await writeFile(path, before); await chmod(path, 0o644);
    await assert.rejects(restarted.provision(e.controller, JSON.parse(before).name), /private/);
    await chmod(password, 0o644); await assert.rejects(ExecutionSignerStore.load(directory, password), /private/);
    const alias = join(root, 'alias'); await symlink(password, alias); await assert.rejects(ExecutionSignerStore.load(directory, alias));
    await chmod(password, 0o600);
    await chmod(path, 0o600);
    const wrongPassword = join(root, 'wrong-unlock'); await writeFile(wrongPassword, randomBytes(48), { mode: 0o600 });
    const wrong = await ExecutionSignerStore.load(directory, wrongPassword);
    await assert.rejects(wrong.provision(e.controller, e.name));
    assert.equal(await readFile(path, 'utf8'), before, 'wrong password never replaces an existing encrypted key');
    wrong.close(); restarted.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('One controller signature lets backend enroll; wrong owners, roles, sessions and replay are rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'autonomy-enrollment-'));
  try {
    const password = join(root, 'unlock'); await writeFile(password, randomBytes(48), { mode: 0o600 });
    const store = await ExecutionSignerStore.load(join(root, 'keys'), password), owner = privateKeyToAccount(generatePrivateKey()), stranger = privateKeyToAccount(generatePrivateKey());
    const executionKey = await store.provision(owner.address, 'Agent');
    const prepared = prepareManifest({ ...initialDraft, name: 'Agent', controller: owner.address, executionKey, model: 'fixture-local', modelSource: 'https://example.com/weights', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), strategyCodeHash: 'c'.repeat(64), strategy: 'Trade spot within explicit quote limits.', selfHosted: true });
    const detected = { model: 'fixture-local', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), runtimeManifest: { fixture: true } } as unknown as Detection;
    const service = registrationService({ directory: join(root, 'registrations'), signer: async () => store, detect: async () => detected,
      worker: p => checkLocalWorker(p, { detect: async () => detected, infer: async () => ({ action: 'HOLD', quoteUnits: '0' }) }) });
    const origin = 'http://127.0.0.1:5173', c = service.challenge(prepared, origin);
    const ownerSignature = await owner.signMessage({ message: authorizationMessage(c, 'controller') });
    await assert.rejects(service.authorizeExecution(c.id, origin, ownerSignature), /fresh/);
    service.check(c.id, origin);
    while (service.job(c.id, origin).status === 'running') await new Promise(r => setTimeout(r, 1));
    await assert.rejects(service.authorizeExecution(c.id, 'https://evil.example', ownerSignature), /origin/);
    await assert.rejects(service.authorizeExecution(c.id, origin, await stranger.signMessage({ message: authorizationMessage(c, 'controller') })), /Controller/);
    await assert.rejects(store.registrationSignature({ ...c, expiresAt: 1 }, 'Agent', ownerSignature), /expired/);
    const signature = await service.authorizeExecution(c.id, origin, ownerSignature);
    assert.equal(await recoverMessageAddress({ message: authorizationMessage(c, 'execution'), signature }), executionKey);
    await service.commit(c.id, origin, ownerSignature, signature);
    await assert.rejects(service.authorizeExecution(c.id, origin, ownerSignature), /consumed/);
    const next = service.challenge(prepared, origin);
    await assert.rejects(store.registrationSignature(next, 'Agent', ownerSignature), /Controller/);
    store.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Trade construction handles 18-decimal positions, both directions, daily turnover and unavailable inputs', () => {
  const owner = privateKeyToAccount(generatePrivateKey()), execution = privateKeyToAccount(generatePrivateKey());
  const prepared = prepareManifest({ ...initialDraft, name: 'Agent', controller: owner.address, executionKey: execution.address, model: 'fixture', modelSource: 'https://example.com/weights', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), strategyCodeHash: 'c'.repeat(64), strategy: 'Trade one spot pair within limits.', tradeCap: '10', exposureCap: '50', selfHosted: true });
  const c = { quote: owner.address, position: execution.address, venue: owner.address, positionDecimals: 18 } as AutonomousDeployment;
  const s: TradeSnapshot = { blockNumber: 1n, blockHash: `0x${'a'.repeat(64)}`, timestamp: 1800000000n, price: 2000000n, configHash: `0x${'b'.repeat(64)}`, cash: 100000000n, positions: 10n ** 18n,
    permission: [1800001000n, 50, 30000000n, 1n, 1n], spent: 0n, input: { fresh: true, valued: true, cashQuoteUnits: '100000000', positionQuoteUnits: '2000000' } };
  const buy = tradeArguments(prepared, c, s, { action: 'BUY', quoteUnits: '10000000' });
  assert.equal(buy?.[2], 10000000n); assert.equal(buy?.[3], 4975000000000000000n);
  const sell = tradeArguments(prepared, c, s, { action: 'SELL', quoteUnits: '2000000' });
  assert.equal(sell?.[2], 10n ** 18n); assert.equal(sell?.[3], 1990000n);
  assert.equal(tradeArguments(prepared, c, { ...s, spent: 29999999n }, { action: 'BUY', quoteUnits: '10000000' }), undefined);
  assert.equal(tradeArguments(prepared, c, { ...s, input: { ...s.input, fresh: false } }, { action: 'BUY', quoteUnits: '10000000' }), undefined);
  assert.throws(() => tradeArguments(prepared, c, s, { action: 'BUY', quoteUnits: '1', data: '0xmalicious' }), /valid/);
  const overexposed = { ...s, positions: 30n * 10n ** 18n, input: { ...s.input, positionQuoteUnits: '60000000' } };
  assert.ok(tradeArguments(prepared, c, overexposed, { action: 'SELL', quoteUnits: '1000000' }), 'risk-reducing sales remain possible above the exposure cap');
  assert.equal(tradeArguments(prepared, c, overexposed, { action: 'BUY', quoteUnits: '1000000' }), undefined);
});

test('Controller transaction path preserves permission destination and rejects arbitrary vault calls', async () => {
  const owner = privateKeyToAccount(generatePrivateKey()), vault = privateKeyToAccount(generatePrivateKey()).address;
  const binding: WalletBinding = { address: owner.address, chainId: 10143, revision: 1, kind: 'browser', name: 'fixture' };
  const abi = parseAbi(['function revokeTradingPermission()']);
  const tx = { chainId: 10143, from: owner.address, to: vault, value: '0x0' as const, gas: '0x100000' as const, data: encodeFunctionData({ abi, functionName: 'revokeTradingPermission' }) };
  let calls = 0;
  const provider = { request: async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === 'eth_accounts') return [owner.address];
    if (method === 'eth_chainId') return '0x279f';
    calls++; assert.equal(method, 'eth_sendTransaction');
    assert.equal((params?.[0] as { to: string }).to, vault); return `0x${'f'.repeat(64)}`;
  } };
  await sendBrowserVaultTransaction(provider, binding, () => binding, tx); assert.equal(calls, 1);
  await assert.rejects(sendBrowserVaultTransaction(provider, binding, () => binding, { ...tx, data: '0x1234' })); assert.equal(calls, 1);
  await assert.rejects(sendBrowserVaultTransaction(provider, binding, () => ({ ...binding, revision: 2 }), tx)); assert.equal(calls, 1);
});
