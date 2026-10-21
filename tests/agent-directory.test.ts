import { checkLocalWorker } from '../agent-registration/worker.js';
import type { Detection } from '../local-inference/types.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, stringToHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { prepareManifest, initialDraft } from '../app/src/lib/registration.js';
import { authorizationMessage, runtimeConfigHash } from '../agent-registration/core.js';
import { readDirectory, filterAgents, quoteAmount } from '../app/src/lib/agent-directory.js';
import type { RegistrationRecord } from '../agent-registration/types.js';

const controller = privateKeyToAccount(('0x' + '11'.repeat(32)) as Hex), execution = privateKeyToAccount(('0x' + '22'.repeat(32)) as Hex);
async function record(n = 1, strategy = 'A real signed paper strategy declaration for this isolated test.'): Promise<RegistrationRecord> {
  const p = prepareManifest({ ...initialDraft, name: 'Signed test agent', controller: controller.address, executionKey: execution.address, model: 'test-local', modelSource: 'https://example.com/weights.gguf', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), strategy, strategyCodeHash: n.toString(16).repeat(64), pair: 'WMON / USDC', tradeCap: '10', exposureCap: '50', selfHosted: true });
  const challenge = { id: n.toString(16).padStart(64, '0'), origin: 'http://localhost:5189', chainId: 10143, commitment: p.commitment, runtimeConfigHash: runtimeConfigHash(p), controller: controller.address, executionKey: execution.address, expiresAt: Date.UTC(2026, 0, n) + 600000 };
  const input = { fresh: false, valued: false, positionQuoteUnits: '0', cashQuoteUnits: '0' }, raw = { action: 'BUY', quoteUnits: '10000000' } as const, output = { action: 'HOLD', quoteUnits: '0' } as const;
  return { version: 'PUMPCOIN-LOCAL-REGISTRATION-v1', id: keccak256(stringToHex(challenge.id)), localAgentId: keccak256(stringToHex(JSON.stringify([10143, controller.address, p.manifest.name]))), registeredAt: new Date(challenge.expiresAt - 1000).toISOString(), manifest: p.manifest, commitment: p.commitment, authorization: { challenge, controllerSignature: await controller.signMessage({ message: authorizationMessage(challenge, 'controller') }), executionSignature: await execution.signMessage({ message: authorizationMessage(challenge, 'execution') }) }, worker: { version: 'PUMPCOIN-LOCAL-WORKER-CHECK-v1', mode: 'synthetic-paper-only', evidence: 'locally-observed-not-attested', model: p.manifest.model.id, weightsDigest: p.manifest.model.weightsDigest, runtimeDigest: p.manifest.model.runtimeDigest, checkedAt: new Date(challenge.expiresAt - 2000).toISOString(), input, rawProposal: raw, guardedProposal: output, receiptHash: keccak256(stringToHex(JSON.stringify({ commitment: p.commitment, input, raw, output }))), scope: 'One synthetic paper inference, not performance.' }, status: 'registered-locally-vault-pending', investmentEligible: false };
}
test('Directory accepts signed historical registrations and a genuinely empty store, not drafts', async () => {
  assert.deepEqual(await readDirectory({ records: [] }), []);
  const r = await record(); const agents = await readDirectory({ records: [r] });
  assert.equal(agents.length, 1); assert.equal(agents[0].latest.commitment, r.commitment);
  await assert.rejects(readDirectory({ records: [r.manifest] }));
  await assert.rejects(readDirectory({ records: 'unavailable' }));
});
test('Edited declarations, substituted signatures and different authorization domains fail closed', async () => {
  const r = await record();
  for (const edit of [
    (x: RegistrationRecord) => { x.manifest.strategy.description = 'Malicious replacement strategy changes the investment claim.'; },
    (x: RegistrationRecord) => { x.authorization.executionSignature = x.authorization.controllerSignature; },
    (x: RegistrationRecord) => { x.authorization.challenge.origin = 'http://localhost:5190'; },
    (x: RegistrationRecord) => { x.localAgentId = ('0x' + 'd'.repeat(64)) as Hex; },
    (x: RegistrationRecord) => { x.authorization.challenge.expiresAt = Number.NaN; },
  ]) { const x = structuredClone(r); edit(x); await assert.rejects(readDirectory({ records: [x] }), /verification/); }
});
test('Malformed records cannot upgrade investment, runtime evidence or paper outcomes', async () => {
  const r = await record();
  for (const edit of [
    (x: any) => { x.investmentEligible = true; },
    (x: any) => { x.worker.evidence = 'attested'; },
    (x: any) => { x.worker.model = 'hosted-model'; },
    (x: any) => { x.worker.guardedProposal = { action: 'BUY', quoteUnits: '10000000' }; },
    (x: any) => { x.worker.receiptHash = '0x' + 'd'.repeat(64); },
    (x: any) => { x.status = 'registered-locally-binding-checked'; },
    (x: any) => { x.registeredAt = 'invalid date'; },
  ]) { const x = structuredClone(r); edit(x); await assert.rejects(readDirectory({ records: [x] })); }
  await assert.rejects(readDirectory({ records: [r, r] }));
});
test('Latest configuration does not inherit an older binding, and strategy history stays intact', async () => {
  const old = await record(1), latest = await record(2, 'A changed signed strategy that keeps the earlier history.');
  old.binding = { status: 'binding-checked-at-block', chainId: 10143, mode: 'monad-testnet', vault: execution.address, identityRegistry: controller.address, agentId: '1', blockNumber: '10', blockHash: old.commitment, configHash: old.commitment, checkedAt: old.registeredAt, investmentEligible: false, evidence: 'point-in-time', scope: 'historical snapshot' }; old.status = 'registered-locally-binding-checked';
  const agents = await readDirectory({ records: [old, latest] });
  assert.equal(agents.length, 1); assert.equal(agents[0].latest.id, latest.id);
  assert.equal(agents[0].latest.binding, undefined); assert.equal(agents[0].versions[1].binding?.agentId, '1');
  assert.equal(filterAgents(agents, '', 'binding').length, 0); assert.equal(filterAgents(agents, '', 'pending').length, 1);
  assert.equal(filterAgents(agents, 'changed signed', 'all').length, 1); assert.equal(filterAgents(agents, 'earlier history', 'all').length, 1);
  assert.equal(filterAgents(agents, 'real signed paper', 'all').length, 0);
});
test('Binding claims reject inconsistent chain, status, block hashes and investment eligibility', async () => {
  const r = await record(); r.status = 'registered-locally-binding-checked';
  r.binding = { status: 'binding-checked-at-block', chainId: 10143, mode: 'monad-testnet', vault: execution.address, identityRegistry: controller.address, agentId: '1', blockNumber: '10', blockHash: r.commitment, configHash: r.commitment, checkedAt: r.registeredAt, investmentEligible: false, evidence: 'snapshot', scope: 'historical' };
  assert.equal((await readDirectory({ records: [r] }))[0].latest.binding?.blockNumber, '10');
  for (const edit of [{ chainId: 1 }, { mode: 'mainnet' }, { investmentEligible: true }, { blockHash: 'garbage' }, { vault: '0x' + '0'.repeat(40) }, { blockNumber: '-1' }]) {
    const x = structuredClone(r); Object.assign(x.binding!, edit); await assert.rejects(readDirectory({ records: [x] }));
  }
});
test('Search uses current model, strategy, pair and role addresses; decimal amounts preserve precision', async () => {
  const agents = await readDirectory({ records: [await record()] });
  for (const query of ['SIGNED TEST', 'test-local', 'WMON', controller.address.toLowerCase(), execution.address, '  paper strategy  ']) assert.equal(filterAgents(agents, query, 'all').length, 1);
  assert.equal(filterAgents(agents, 'unknown', 'all').length, 0);
  assert.equal(quoteAmount('0'), '0'); assert.equal(quoteAmount('10000001'), '10.000001');
  assert.equal(quoteAmount('9999999999999999999'), '9999999999999.999999');
});

test('V2 admission evidence replays funded scenarios and exact guard challenges while preserving v1 history', async () => {
  const r = await record();
  const p = { manifest: r.manifest, commitment: r.commitment, privateRuntimeConfig: { inferenceBaseURL: 'http://127.0.0.1:8080' } };
  const detected = { model: r.manifest.model.id, weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), runtimeManifest: { fixture: true }, checkedAt: r.worker.checkedAt } as unknown as Detection;
  r.worker = await checkLocalWorker(p, { detect: async () => detected, infer: async (_p, input) => ({ action: input.fresh ? input.cashQuoteUnits === '0' ? 'SELL' : 'BUY' : 'HOLD', quoteUnits: input.fresh ? '10000000' : '0' }) });
  assert.equal((await readDirectory({ records: [r] }))[0].latest.worker.version, 'PUMPCOIN-LOCAL-WORKER-CHECK-v2');
  for (const edit of [
    (x: RegistrationRecord) => { x.worker.scenarios![0].guardedProposal.action = 'HOLD'; },
    (x: RegistrationRecord) => { x.worker.guardChallenges!.pop(); },
    (x: RegistrationRecord) => { x.worker.guardChallenges![0].expected.action = 'HOLD'; },
    (x: RegistrationRecord) => { x.worker.scenarios![1].input.fresh = false; },
  ]) { const altered = structuredClone(r); edit(altered); await assert.rejects(readDirectory({ records: [altered] })); }
});
