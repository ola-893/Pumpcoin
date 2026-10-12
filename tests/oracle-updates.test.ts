import test from 'node:test';
import assert from 'node:assert/strict';
import { pythUpdates, supraMonProof } from '../agent-registration/oracle-updates.js';
const id = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
test('Pyth key stays in the server authorization header and request selects only permitted USDC', async () => {
  const key = 'private-test-secret';
  const result = await pythUpdates([id], key, (async (url: any, options: any) => {
    assert.equal(new URL(url).origin, 'https://pyth.dourolabs.app');
    assert.deepEqual(new URL(url).searchParams.getAll('ids[]'), [id]);
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(String(url).includes(key), false);
    assert.equal(options.redirect, 'error');
    return Response.json({ binary: { encoding: 'hex', data: ['aabb'] } });
  }) as typeof fetch);
  assert.deepEqual(result, ['0xaabb']);
});
test('upstream errors and exceptions never echo a private key', async () => {
  for (const status of [401, 403, 500]) await assert.rejects(pythUpdates([id], 'secret', (async () => new Response('secret', { status })) as typeof fetch), e => e instanceof Error && !e.message.includes('secret'));
  await assert.rejects(pythUpdates([id], 'secret', (async () => { throw new Error('secret'); }) as typeof fetch), /request failed/);
  await assert.rejects(pythUpdates([id], undefined), /root .env/);
});
test('malformed, oversized and empty oracle responses are rejected', async () => {
  for (const value of [{ binary: { encoding: 'base64', data: ['aa'] } }, { binary: { encoding: 'hex', data: [] } }, { binary: { encoding: 'hex', data: ['0x11'] } }]) await assert.rejects(pythUpdates([id], 'key', (async () => Response.json(value)) as typeof fetch), /Invalid Pyth/);
  await assert.rejects(pythUpdates([id], 'key', (async () => new Response('x'.repeat(262145))) as typeof fetch), /too large/);
});
test('Supra requests the fixed MON/USDT and USDT/USD pair IDs without credentials', async () => {
  const proof = await supraMonProof((async (url: any, options: any) => {
    assert.equal(url, 'https://rpc-testnet-dora-2.supra.com/get_proof');
    assert.deepEqual(JSON.parse(options.body), { pair_indexes: [569, 48], chain_type: 'evm' });
    assert.equal(options.headers.Authorization, undefined);
    return Response.json({ proof_bytes: 'aabb' });
  }) as typeof fetch);
  assert.equal(proof, '0xaabb');
  await assert.rejects(supraMonProof((async () => Response.json({ proof_bytes: 'garbage' })) as typeof fetch), /Invalid Supra/);
});
