import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { hostedApi, sessionToken, validSession } from '../hosting/api.js';

test('hosted sessions survive instances but reject expiry, changes and another host', () => {
  const now = Date.now(), secret = 'a'.repeat(64), token = sessionToken('pumpcoin.vercel.app', now + 60000, secret);
  assert.equal(validSession(token, 'pumpcoin.vercel.app', secret, now), true);
  assert.equal(validSession(token, 'evil.test', secret, now), false);
  assert.equal(validSession(token, 'pumpcoin.vercel.app', 'b'.repeat(64), now), false);
  assert.equal(validSession(token, 'pumpcoin.vercel.app', secret, now + 60001), false);
  assert.equal(validSession(sessionToken('pumpcoin.vercel.app', now + 7200000, secret), 'pumpcoin.vercel.app', secret, now), false);
});

test('public API serves signed records while keeping operator capabilities private', async () => {
  process.env.PUMPCOIN_HOSTED_SESSION_SECRET = 'test-secret-'.repeat(6);
  const server = createServer((req, res) => { void hostedApi(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(base + '/api/health').then(r => r.json()) as any;
    assert.equal(health.ok, true); assert.ok(health.records > 0); assert.equal(health.operatorRuntime, 'local');
    const blocked = await fetch(base + '/api/agent-registration/records'); assert.equal(blocked.status, 403);
    const session = await fetch(base + '/api/agent-registration/status').then(r => r.json()) as any;
    assert.equal(session.hosted, true); assert.equal(session.executionSignerConfigured, false);
    const headers = { 'X-PumpCoin-Registration-Token': session.token, 'Content-Type': 'application/json' };
    const records = await fetch(base + '/api/agent-registration/records', { headers }).then(r => r.json()) as any;
    assert.equal(records.records.length, health.records);
    assert.ok(records.records.every((r: any) => !('private' in r) && !('privateRuntimeConfig' in r)));
    const origin = await fetch(base + '/api/agent-registration/records', { headers: { ...headers, Origin: 'https://evil.test' } }); assert.equal(origin.status, 403);
    for (const route of ['trader-start', 'trader-stop', 'execution-wallet', 'challenge', 'research-start']) {
      const result = await fetch(base + '/api/agent-registration/' + route, { method: 'POST', headers, body: '{}' }); assert.equal(result.status, 409);
    }
    const local = await fetch(base + '/api/local-inference/detect', { method: 'POST', headers, body: '{}' }); assert.equal(local.status, 409);
    const research = await fetch(base + '/api/agent-registration/research-state', { method: 'POST', headers, body: JSON.stringify({ id: records.records[0].id }) });
    assert.equal(research.status, 200);
    const view = (await research.json() as any).research;
    assert.equal(view.hosted, true); assert.deepEqual(view.sessions, []); assert.deepEqual(view.latest, []);
    const forged = await fetch(base + '/api/agent-registration/research-publish', { method: 'POST', headers, body: JSON.stringify({ id: records.records[0].id, checkpoint: {} }) });
    assert.equal(forged.status, 400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
