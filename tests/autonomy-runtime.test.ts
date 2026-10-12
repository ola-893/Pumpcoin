import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { autonomyRuntime } from '../agent-registration/autonomy-runtime.js';
import type { WorkerConfig, WorkerObservation } from '../agent-registration/run-autonomous.js';

const registrationId = `0x${'1'.repeat(64)}` as const, other = `0x${'2'.repeat(64)}`;
const network = JSON.parse(readFileSync(new URL('../deployments/pumpcoin-vault-network.json', import.meta.url), 'utf8'));
const config: WorkerConfig = { registrationId, deployment: { ...network,
  vault: network.quote, vaultCodeHash: network.quoteCodeHash, adapter: network.quote, adapterCodeHash: network.quoteCodeHash,
  venue: network.quote, venueCodeHash: network.quoteCodeHash, source: network.position, sourceCodeHash: network.positionCodeHash,
  dependencies: [{ address: network.position, codeHash: network.positionCodeHash }] } };
async function fixture(fn: (file: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'runtime-control-'));
  try { const file = join(dir, 'reviewed.json'); await writeFile(file, JSON.stringify(config)); await fn(file); } finally { await rm(dir, { recursive: true, force: true }); }
}
test('runtime only starts the server-pinned Monad registration and keeps concurrent starts idempotent', async () => fixture(async file => {
  let starts = 0, observe: ((e: WorkerObservation) => void) | undefined;
  const runtime = autonomyRuntime({ configFile: file, run: async (c, options) => {
    starts++; assert.equal(c.registrationId, registrationId); observe = options!.observe;
    await new Promise<void>(resolve => options!.signal!.addEventListener('abort', () => resolve(), { once: true }));
  } });
  try {
    await assert.rejects(runtime.start(other), /another registration/);
    const results = await Promise.all([runtime.start(registrationId), runtime.start(registrationId)]);
    assert.ok(results.every(r => r.running)); assert.equal(starts, 1);
    observe!({ state: 'success', hash: registrationId });
    assert.equal((await runtime.status(registrationId)).transactionHash, registrationId);
    assert.equal((await runtime.status(registrationId)).state, 'success');
    await writeFile(file, 'invalid replaced configuration');
    assert.equal((await runtime.status(registrationId)).running, true);
    assert.equal((await runtime.stop(registrationId)).state, 'stopping');
  } finally { await runtime.close(); }
  await writeFile(file, JSON.stringify(config));
  assert.equal((await runtime.status(registrationId)).running, false);
  assert.equal((await runtime.status(registrationId)).state, 'stopped');
}));
test('unconfigured runtime reports setup required and cannot start a trader', async () => {
  const runtime = autonomyRuntime();
  assert.equal((await runtime.status(registrationId)).configured, false);
  await assert.rejects(runtime.start(registrationId), /reviewed trading deployment/);
  await assert.rejects(runtime.status('../../private'), /identifier/);
});
test('runtime rejects local simulation and missing dependency pins before launching', async () => fixture(async file => {
  let starts = 0; const runtime = autonomyRuntime({ configFile: file, run: async () => { starts++; } });
  await writeFile(file, JSON.stringify({ ...config, deployment: { ...config.deployment, chainId: 31337 } }));
  await assert.rejects(runtime.start(registrationId), /Monad testnet/);
  await writeFile(file, JSON.stringify({ ...config, deployment: { ...config.deployment, dependencies: [] } }));
  await assert.rejects(runtime.start(registrationId), /dependencies/); assert.equal(starts, 0);
}));
test('runtime strips private startup errors and can restart only after its task finishes', async () => fixture(async file => {
  let starts = 0;
  const runtime = autonomyRuntime({ configFile: file, run: async () => { starts++; throw new Error('PRIVATE_KEY /Users/operator/secrets request=private-model-prompt'); } });
  await runtime.start(registrationId); await runtime.close();
  const status = await runtime.status(registrationId);
  assert.equal(status.state, 'error'); assert.equal(status.running, false);
  assert.doesNotMatch(JSON.stringify(status), /PRIVATE_KEY|\/Users\/|private-model-prompt/);
  await runtime.start(registrationId); await runtime.close(); assert.equal(starts, 2);
}));
