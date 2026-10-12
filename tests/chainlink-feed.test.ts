import test from 'node:test';
import assert from 'node:assert/strict';
import { chainlinkObservation, readChainlinkFeed } from '../agent-registration/chainlink.js';

test('Chainlink round validation rejects incomplete and unrepresentable observations', () => {
  const at = 1800000000n;
  assert.deepEqual(chainlinkObservation([2n, 200000000n, at, at, 2n], 8), { price: 200000000n, conf: 0n, expo: -8, publishTime: at });
  for (const round of [
    [0n, 1n, at, at, 0n], [2n, 1n, at, at, 1n], [1n, 0n, at, at, 1n],
    [1n, -1n, at, at, 1n], [1n, 1n, 0n, at, 1n], [1n, 1n, at + 1n, at, 1n],
    [1n, 1n, 0n, 0n, 1n], [1n, (1n << 255n) - 1n, at, at, 1n],
  ] as const) assert.throws(() => chainlinkObservation(round, 8), /Invalid/);
  for (const scale of [-1, 19, 1.5, NaN]) assert.throws(() => chainlinkObservation([1n, 1n, at, at, 1n], scale));
});

test('missing testnet MON feed is an explicit blocker and makes no RPC call', async () => {
  const forbidden = async () => { throw new Error('must not be called'); };
  const result = await readChainlinkFeed(null, 'MON', forbidden, forbidden);
  assert.equal(result.observation.price, 0n);
  assert.match(result.blockers[0], /verified Chainlink MON\/USD/);
});
