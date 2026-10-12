import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmSuccessfulTransaction } from '../frontend/legacy-browser/confirmation.js';

const submitted = `0x${'01'.repeat(32)}` as const;
const replacement = `0x${'02'.repeat(32)}` as const;

test('confirmation stays pending until a successful receipt and returns its actual hash', async () => {
  let settle!: (value: { status: 'success'; transactionHash: typeof replacement }) => void;
  let finished = false;
  const confirmation = confirmSuccessfulTransaction(submitted, (hash) => {
    assert.equal(hash, submitted);
    return new Promise((resolve) => {
      settle = resolve;
    });
  }).then((hash) => {
    finished = true;
    return hash;
  });
  await Promise.resolve();
  assert.equal(finished, false);
  settle({ status: 'success', transactionHash: replacement });
  assert.equal(await confirmation, replacement);
});

test('reverted and failed receipt waits reject rather than showing success', async () => {
  await assert.rejects(
    confirmSuccessfulTransaction(submitted, async () => ({
      status: 'reverted',
      transactionHash: submitted,
    })),
    /reverted/,
  );
  await assert.rejects(
    confirmSuccessfulTransaction(submitted, async () => {
      throw new Error('RPC timeout');
    }),
    /RPC timeout/,
  );
});
