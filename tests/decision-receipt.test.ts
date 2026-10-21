import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, type Hex } from 'viem';
import { initialDraft, prepareManifest } from '../app/src/lib/registration.js';
import { canonical, signDecision, verifyDecision, replayInference } from '../agent-registration/decision-receipt.js';
import { inferenceRequest, LIVE_PURPOSE } from '../agent-registration/worker.js';
import type { AutonomousDeployment, TradeSnapshot } from '../agent-registration/autonomous.js';

const account = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const controller = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const hash = `0x${'a'.repeat(64)}` as Hex, id = `0x${'b'.repeat(64)}` as Hex;
const addr = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`);
const p = prepareManifest({ ...initialDraft, name: 'Receipt fixture', controller: controller.address, executionKey: account.address, model: 'fixture', modelSource: 'https://example.com/weights', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), strategyCodeHash: 'c'.repeat(64), strategy: 'Public fixture declaration', pair: 'WMON / USDC', tradeCap: '10', exposureCap: '50', selfHosted: true });
const c: AutonomousDeployment = { chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', identityRegistry: addr(1), identityCodeHash: hash, quote: addr(2), quoteCodeHash: hash, position: addr(3), positionCodeHash: hash, positionDecimals: 18, vault: addr(4), vaultCodeHash: hash, adapter: addr(5), adapterCodeHash: hash, venue: addr(6), venueCodeHash: hash, source: addr(7), sourceCodeHash: hash };
const snapshot: TradeSnapshot = { blockNumber: 10n, blockHash: hash, timestamp: 100n, price: 1000000n, configHash: hash, input: { fresh: true, valued: true, cashQuoteUnits: '20000000', positionQuoteUnits: '10000000' }, cash: 20000000n, positions: 10000000000000000000n, permission: [1000n, 50, 20000000n, 1n, 1n], spent: 0n };
const inference = (action: 'BUY' | 'SELL' | 'HOLD', quoteUnits: string) => ({ request: inferenceRequest(p, snapshot.input, LIVE_PURPOSE), rawContent: JSON.stringify({ action, quoteUnits }), rawProposal: { action, quoteUnits } });

test('Receipt binds exact request, raw output, guarded action, snapshot and constructed BUY/SELL calldata to execution signature', async () => {
  for (const action of ['BUY', 'SELL', 'HOLD'] as const) {
    const receipt = await signDecision(p, c, id, snapshot, inference(action, action === 'HOLD' ? '0' : '10000000'), account, 1, null);
    assert.deepEqual(await verifyDecision(receipt, p, c, id), snapshot);
    assert.equal(receipt.body.tradeData === null, action === 'HOLD');
    assert.ok(!canonical(receipt).includes(p.privateRuntimeConfig.inferenceBaseURL));
    for (const mutate of [
      (r: typeof receipt) => { r.body.snapshot.cash = '1'; },
      (r: typeof receipt) => { r.body.inference.rawContent = '{"action":"HOLD","quoteUnits":"0"}'; },
      (r: typeof receipt) => { r.body.inference.request.temperature = 1; },
      (r: typeof receipt) => { r.body.strategyDigest = `sha256:${'d'.repeat(64)}`; },
      (r: typeof receipt) => { r.body.guardedProposal.action = 'SELL'; },
      (r: typeof receipt) => { r.body.previousHash = hash; },
      (r: typeof receipt) => { r.signature = `0x${'11'.repeat(65)}`; },
    ]) { const altered = structuredClone(receipt); mutate(altered); if (canonical(altered) !== canonical(receipt)) await assert.rejects(verifyDecision(altered, p, c, id)); }
    await assert.rejects(verifyDecision(receipt, p, { ...c, vault: addr(8) }, id));
  }
});
test('Even a valid operator signature cannot pass replay with a changed prompt, raw output or trade construction', async () => {
  const bad = inference('BUY', '10000000'); bad.request.max_tokens = 999;
  await assert.rejects(verifyDecision(await signDecision(p, c, id, snapshot, bad, account, 1, null), p, c, id), /request/);
  const wrong = inference('BUY', '10000000'); wrong.rawContent = '{"action":"SELL","quoteUnits":"10000000"}';
  await assert.rejects(verifyDecision(await signDecision(p, c, id, snapshot, wrong, account, 1, null), p, c, id), /output/);
  await assert.rejects(verifyDecision(await signDecision(p, c, id, snapshot, inference('BUY', '10000000'), controller, 1, null), p, c, id), /signer/);
});
test('Inference replay uses exact bounded loopback request and reports divergent output without calling it proof', async () => {
  const receipt = await signDecision(p, c, id, snapshot, inference('BUY', '10000000'), account, 1, null);
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(String(url), 'http://127.0.0.1:8080/v1/chat/completions'); assert.equal(options?.redirect, 'error');
    assert.equal(canonical(JSON.parse(options!.body as string)), canonical(receipt.body.inference.request));
    return Response.json({ model: 'fixture', choices: [{ finish_reason: 'stop', message: { content: receipt.body.inference.rawContent } }] });
  };
  assert.equal((await replayInference(receipt, p, fetcher)).matches, true);
  assert.equal((await replayInference(receipt, p, async () => Response.json({ model: 'fixture', choices: [{ finish_reason: 'stop', message: { content: '{"action":"HOLD","quoteUnits":"0"}' } }] }))).matches, false);
  await assert.rejects(replayInference(await signDecision(p, c, id, snapshot, inference('BUY', '10000000'), account, 1, null, true), p, fetcher), /Injected/);
});
test('Canonical receipt encoding tolerates object-key order and rejects non-JSON or ambiguous numerical values', () => {
  assert.equal(canonical({ z: [1, 'a'], a: true }), canonical({ a: true, z: [1, 'a'] }));
  for (const value of [undefined, NaN, Infinity, 1.5, 1n, new Date(), { missing: undefined }]) assert.throws(() => canonical(value));
});
