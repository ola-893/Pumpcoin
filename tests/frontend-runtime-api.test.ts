import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registrationService } from '../agent-registration/service.js';
import { registrationPlugin, REGISTRATION_API } from '../agent-registration/vite.js';

test('frontend runtime endpoints retain origin/session protection and reject browser-supplied signing configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frontend-runtime-api-'));
  const previous = process.env.PUMPCOIN_AUTONOMY_CONFIG; delete process.env.PUMPCOIN_AUTONOMY_CONFIG;
  const plugin = registrationPlugin(registrationService({ directory }));
  let handler: any; plugin.configureServer({ middlewares: { use(h) { handler = h; } } });
  const server = createServer((req, res) => handler(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const { token } = await (await fetch(base + REGISTRATION_API + '/status')).json() as { token: string };
    const id = `0x${'a'.repeat(64)}`;
    const post = (route: string, body: unknown, session = token, origin = base) => fetch(base + REGISTRATION_API + route, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PumpCoin-Registration-Token': session, Origin: origin }, body: JSON.stringify(body),
    });
    assert.equal((await post('/trader-start', { id }, 'bad')).status, 403);
    assert.equal((await post('/trader-stop', { id }, token, 'https://evil.test')).status, 403);
    for (const field of ['privateKey', 'rpcUrl', 'configFile', 'deployment']) assert.equal((await post('/trader-start', { id, [field]: 'untrusted' })).status, 400);
    for (const action of ['deploy', 'deploy-valuation-guard', 'unknown']) {
      const blocked = await post('/trading-plan', { id, action, account: '0x1111111111111111111111111111111111111111', amount: '0' });
      assert.equal(blocked.status, 400); assert.match((await blocked.json() as any).error, /operator CLI/);
    }
    for (const [route, action, amount] of [['/native-plan','deploy-native','0'], ['/pool-plan','deploy-pool-funder',undefined]] as const) {
      const blocked = await post(route, { id, action, account: '0x1111111111111111111111111111111111111111', ...(amount ? {amount} : {}) });
      assert.equal(blocked.status, 400); assert.match((await blocked.json() as any).error, /operator CLI/);
    }
    const response = await post('/trader-status', { id }); assert.equal(response.status, 200);
    const result = await response.json() as any; assert.equal(result.runtime.state, 'unconfigured'); assert.equal(result.runtime.running, false);
    assert.equal((await post('/trader-start', { id })).status, 400);
    assert.equal((await post('/agent-state-refresh', { id }, 'bad')).status, 403);
    assert.equal((await post('/agent-state-refresh', { id, force: true })).status, 400);
    assert.equal((await post('/agent-state-refresh', { id })).status, 400);
    assert.equal((await post('/agent-state', { id, chainId: 31337 })).status, 400);
    assert.equal((await post('/agent-state', { id }, 'bad')).status, 403);
    assert.equal((await post('/agent-state', { id })).status, 400);
    assert.equal((await post('/live-vault', { id, chainId: 31337 })).status, 400);
    assert.equal((await post('/live-vault', { id })).status, 400);
    assert.equal((await post('/sign', { id, data: '0x00' })).status, 400);
    assert.equal((await post('/research-state', { id }, 'bad')).status, 403);
    assert.equal((await post('/research-start', { id, sessionId: 'unknown' }, token, 'https://evil.test')).status, 403);
    assert.equal((await post('/research-state', { id, privateKey: 'untrusted' })).status, 400);
    assert.equal((await post('/research-challenge', { id, policy: {}, rpcUrl: 'untrusted' })).status, 400);
    assert.equal((await post('/research-state', { id })).status, 400);
    assert.equal((await post('/research-sources', { id, symbol: 'ETH' }, 'bad')).status, 403);
    assert.equal((await post('/research-sources', { id, symbol: 'ETH' }, token, 'https://evil.test')).status, 403);
    assert.equal((await post('/research-sources', { id, symbol: 'ETH', apiKey: 'untrusted' })).status, 400);
    assert.equal((await post('/research-sources', { id, symbol: 'ETH' })).status, 400);
  } finally {
    await new Promise<void>(done => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
    if (previous === undefined) delete process.env.PUMPCOIN_AUTONOMY_CONFIG; else process.env.PUMPCOIN_AUTONOMY_CONFIG = previous;
  }
});
