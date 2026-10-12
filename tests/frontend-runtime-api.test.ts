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
    const response = await post('/trader-status', { id }); assert.equal(response.status, 200);
    const result = await response.json() as any; assert.equal(result.runtime.state, 'unconfigured'); assert.equal(result.runtime.running, false);
    assert.equal((await post('/trader-start', { id })).status, 400);
    assert.equal((await post('/live-vault', { id, chainId: 31337 })).status, 400);
    assert.equal((await post('/live-vault', { id })).status, 400);
    assert.equal((await post('/sign', { id, data: '0x00' })).status, 400);
  } finally {
    await new Promise<void>(done => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
    if (previous === undefined) delete process.env.PUMPCOIN_AUTONOMY_CONFIG; else process.env.PUMPCOIN_AUTONOMY_CONFIG = previous;
  }
});
