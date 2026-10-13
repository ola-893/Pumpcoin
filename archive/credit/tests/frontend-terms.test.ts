import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredCollateral, withdrawableCollateral } from '../frontend/legacy-browser/protocol.js';
import { parseAmount, PROTOCOL_ADDRESSES, PROTOCOL_CHAIN_ID } from '../frontend/legacy-browser/onchain.js';
import manifest from '../deployments/monad-testnet.json' with { type: 'json' };

test('collateral rounding never leaves debt above the contract floor limit', () => {
  for (const ltv of [5000n, 8000n]) {
    for (let debt = 0n; debt < 1000n; debt += 1n) {
      const collateral = requiredCollateral(debt, ltv);
      assert.ok((collateral * ltv) / 10000n >= debt);
      if (collateral > 0n) assert.ok(((collateral - 1n) * ltv) / 10000n < debt);
    }
  }
  assert.equal(requiredCollateral(80_000_000n, 8000n), 100_000_000n);
  assert.equal(requiredCollateral(50_000_000n, 5000n), 100_000_000n);
});

test('expiry downgrade retains debt and blocks unsafe collateral withdrawal', () => {
  assert.equal(withdrawableCollateral(100_000_000n, 80_000_000n, 8000n), 0n);
  assert.equal(withdrawableCollateral(100_000_000n, 80_000_000n, 5000n), 0n);
  assert.equal(withdrawableCollateral(100_000_000n, 0n, 5000n), 100_000_000n);
  assert.equal(withdrawableCollateral(100_000_000n, 40_000_000n, 5000n), 20_000_000n);
});

test('amount input preserves integer token precision and rejects rounded or malformed writes', () => {
  assert.equal(parseAmount('0.000001', 6), 1n);
  assert.equal(parseAmount('12345678901234567890.123456', 6), 12345678901234567890123456n);
  for (const value of [
    '',
    '0',
    '0.000000',
    '0.0000001',
    '-1',
    '+1',
    '1e6',
    'NaN',
    'Infinity',
    '1.',
    '.1',
    ' 1',
    '01',
  ]) {
    assert.equal(parseAmount(value, 6), null, value);
  }
});

test('browser manifest preserves the legacy deployment rather than inventing evidence-mode addresses', () => {
  assert.equal(PROTOCOL_CHAIN_ID, manifest.chainId);
  for (const [key, address] of Object.entries(manifest.contracts)) {
    assert.equal(
      PROTOCOL_ADDRESSES[key as keyof typeof PROTOCOL_ADDRESSES].toLowerCase(),
      address.toLowerCase(),
    );
  }
});
