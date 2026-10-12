import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialDraft, validateDraft, prepareManifest, localEndpoint, quoteUnits } from '../app/src/lib/registration.js';
import { readDemo, simulatedShares } from '../app/src/lib/evidence.js';
import { parseMarkets } from '../app/src/lib/markets.js';
const complete = { ...initialDraft, name: 'Local agent', model: 'test-local-model', modelSource: 'https://example.com/weights.gguf', controller: '0x1111111111111111111111111111111111111111', executionKey: '0x2222222222222222222222222222222222222222', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), strategyCodeHash: 'c'.repeat(64), strategy: 'Trade one spot pair within declared exposure limits.', selfHosted: true };
test('Registration draft rejects hosted, credential-bearing and deceptive local endpoints', () => {
  for (const x of ['https://api.openai.com/v1', 'https://localhost.example.com/v1', 'http://127.0.0.1@remote.example/v1', 'http://localhost/v1?key=secret', 'http://user:secret@localhost/v1', 'file:///tmp/model', 'http://192.168.1.5/v1']) assert.throws(() => localEndpoint(x));
  for (const x of ['http://127.0.0.1:8080/v1', 'http://localhost:8080/v1', 'http://[::1]:8080/v1']) assert.ok(localEndpoint(x));
  assert.ok(validateDraft({ ...complete, endpoint: 'https://hosted.example/v1' }).endpoint);
});
test('Self-hosted declaration and exact artifact commitments are required, not a model name', () => {
  assert.ok(validateDraft({ ...complete, selfHosted: false }).selfHosted);
  for (const key of ['weightsHash', 'runtimeHash', 'strategyCodeHash'] as const) assert.ok(validateDraft({ ...complete, [key]: '0'.repeat(64) })[key]);
  assert.equal(Object.keys(validateDraft(complete)).length, 0);
  assert.throws(() => prepareManifest({ ...complete, weightsHash: 'Qwen3.8' }));
});
test('Trading-key isolation, amount precision and mandate bounds fail closed', () => {
  assert.ok(validateDraft({ ...complete, executionKey: complete.controller }).executionKey);
  assert.ok(validateDraft({ ...complete, tradeCap: '501', exposureCap: '500' }).tradeCap);
  for (const value of ['1e3', '0', '-1', '1.0000001', 'NaN', '1.']) assert.throws(() => quoteUnits(value));
  assert.equal(quoteUnits('100.000001'), 100000001n);
  assert.ok(validateDraft({ ...complete, slippageBps: '501' }).slippageBps);
});
test('Public commitment excludes the endpoint and never claims signature or registration verification', () => {
  const a = prepareManifest(complete), b = prepareManifest({ ...complete, endpoint: 'http://localhost:9090/v1' });
  assert.equal(a.commitment, b.commitment);
  assert.equal(a.manifest.registrationStatus, 'unpublished-draft');
  assert.equal(a.manifest.evidenceLevel, 'operator-declared');
  assert.equal(a.manifest.inferencePolicy, 'PUMPCOIN-SELF-HOSTED-v1');
  assert.ok(!JSON.stringify(a.manifest).includes('8080'));
  assert.notEqual(prepareManifest({ ...complete, weightsHash: 'd'.repeat(64) }).commitment, a.commitment);
});
test('Archived frontend metrics retain the actual loss, redemption and capital-flow separation', () => {
  const text = readFileSync('app/public/evidence/vault-local-evidence.json', 'utf8'), d = readDemo(text);
  assert.equal(d.report.netPnl, -110000000n);
  assert.equal(d.report.withdrawals, 90727272n);
  assert.equal(d.nav, 907272728n);
  assert.equal(d.report.deposits, 1108000000n);
  assert.equal(d.nav + d.report.withdrawals - d.report.deposits, d.report.netPnl);
  const fake = JSON.parse(text); fake.bundle.events.splice(0, 1);
  assert.throws(() => readDemo(JSON.stringify(fake)), /reconcile/);
  fake.environment = 'funded'; assert.throws(() => readDemo(JSON.stringify(fake)), /environment/);
});
test('Pump token illustration uses integer virtual-share math and refuses unavailable valuation', () => {
  assert.equal(simulatedShares(100000000n, 907272728n, 1000000000007407n), 100000000n * 1000000001007407n / 907272729n);
  assert.throws(() => simulatedShares(100n, 0n, 0n));
});
test('Market records require Monad identifiers, handle v4 pool IDs and preserve missing prices', () => {
  const record = { id: 'monad_0x' + 'a'.repeat(64), attributes: { name: 'MON / USDC', address: '0x' + 'a'.repeat(64), base_token_price_usd: null, reserve_in_usd: '1000', volume_usd: { h24: 'Infinity' }, price_change_percentage: { h24: '-2' } } };
  const r = parseMarkets({ data: [record] });
  assert.equal(r.length, 1); assert.equal(r[0].price, null); assert.equal(r[0].volume, null); assert.equal(r[0].change, -2);
  assert.ok(r[0].url.startsWith('https://www.geckoterminal.com/monad/pools/'));
  assert.equal(parseMarkets({ data: [{ ...record, id: 'eth_x' }, { ...record, attributes: { name: 'x', address: 'javascript:alert(1)' } }] }).length, 0);
  assert.throws(() => parseMarkets({ error: 'Rate limit' }));
});
