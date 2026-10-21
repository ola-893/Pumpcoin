import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedWeightsSource, verifyWeightsPublication } from '../agent-registration/model-publication.js';
import { initialDraft, prepareManifest } from '../app/src/lib/registration.js';
import { privateKeyToAccount } from 'viem/accounts';
const revision = 'c'.repeat(40), digest = 'a'.repeat(64);
const controller = privateKeyToAccount(`0x${'11'.repeat(32)}`), execution = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const source = `https://huggingface.co/publisher/model/resolve/${revision}/model.gguf`;
const p = prepareManifest({ ...initialDraft, name: 'Publication fixture', controller: controller.address, executionKey: execution.address, model: 'fixture', modelSource: source, weightsHash: digest, runtimeHash: 'b'.repeat(64), strategyCodeHash: 'c'.repeat(64), strategy: 'Synthetic publication verification fixture only.', pair: 'WMON / USDC', tradeCap: '10', exposureCap: '50', selfHosted: true });
const metadata = { sha: revision, siblings: [{ rfilename: 'model.gguf', size: 123, lfs: { sha256: digest, size: 123 } }] };
test('Publisher verification requires exact commit, file, LFS SHA-256 and independently measured size; sends no credentials', async () => {
  const result = await verifyWeightsPublication(p, 123, async (url, options) => {
    assert.equal(String(url), `https://huggingface.co/api/models/publisher/model/revision/${revision}?blobs=true`);
    assert.equal(options?.redirect, 'error'); assert.equal((options?.headers as Record<string,string>).Authorization, undefined);
    return Response.json(metadata);
  });
  assert.equal(result.evidence, 'publisher-metadata-digest-matched');
  for (const altered of [{ ...metadata, sha: 'd'.repeat(40) }, { ...metadata, siblings: [] }, { ...metadata, siblings: [metadata.siblings[0], metadata.siblings[0]] }, { ...metadata, siblings: [{ ...metadata.siblings[0], lfs: { sha256: 'b'.repeat(64), size: 123 } }] }]) await assert.rejects(verifyWeightsPublication(p, 123, async () => Response.json(altered)));
  await assert.rejects(verifyWeightsPublication(p, 124, async () => Response.json(metadata)));
  await assert.rejects(verifyWeightsPublication(p, 123, async () => new Response('denied', { status: 401 })));
  await assert.rejects(verifyWeightsPublication(p, 123, async () => new Response('x'.repeat(1048577))), /too large/);
});
test('Publication lookups reject moving revisions, other hosts, credentials, queries and encoded path traversal', () => {
  assert.equal(publishedWeightsSource(source).filename, 'model.gguf');
  for (const value of [source.replace(revision, 'main'), source.replace('huggingface.co', 'evil.example'), source.replace('https://', 'https://user:secret@'), source + '?token=secret', source.replace('model.gguf', 'sub%2Ffile'), source.replace('model.gguf', '%00bad')]) assert.throws(() => publishedWeightsSource(value));
});
