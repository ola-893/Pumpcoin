import test from "node:test";
import assert from "node:assert/strict";
import { decodeAbiParameters, keccak256, stringToHex } from "viem";
import { DAY, deriveEligibility, encodeEligibilityReport, REPORT_ABI, type VerifiedFacts, type PolicyConfig } from "../eligibility/policy.js";

const hash = (s: string) => keccak256(stringToHex(s));
const now = 1_800_000_000;
export const config: PolicyConfig = { chainId: 10143, registry: "0x1111111111111111111111111111111111111111",
  providerId: "fixture", providerVersion: "v1", allowFixtures: true, allowTestMode: true };
export const facts: VerifiedFacts = { evidenceKind: "fixture", subject: "0x2222222222222222222222222222222222222222",
  ...config, sourceId: hash("account"), proofHash: hash("proof"), sessionId: hash("session"),
  observedAt: now, windowStart: now - 90 * DAY, windowEnd: now,
  totalPayoutCents: "150000", currency: "USD", complete: true, testMode: true };

test("tier thresholds, fixed expiry, ceilings, and report ABI contain no raw payouts", () => {
  for (const [amount, tier, ceiling] of [["10000", 1, 50_000_000n], ["99999", 1, 50_000_000n],
    ["100000", 2, 80_000_000n], ["999999", 2, 80_000_000n], ["1000000", 3, 120_000_000n]] as const) {
    const r = deriveEligibility({ ...facts, totalPayoutCents: amount }, config, now);
    assert.equal(r.tier, tier); assert.equal(r.ceiling, ceiling);
    assert.equal(r.expiresAt, BigInt(now + 7 * DAY));
    const [, , decoded] = decodeAbiParameters(REPORT_ABI, encodeEligibilityReport(r, config));
    assert.deepEqual(decoded, r);
    assert.equal("totalPayoutCents" in r, false);
  }
});

test("policy fails closed on untrusted, stale, incomplete, cross-chain or malformed facts", () => {
  const invalid = [
    { evidenceKind: "user-input" }, { providerId: "wrong" }, { providerVersion: "v2" },
    { chainId: 143 }, { registry: "0x3333333333333333333333333333333333333333" },
    { subject: "bad" }, { sourceId: "0x00" }, { sessionId: "0x" + "0".repeat(64) },
    { currency: "EUR" }, { complete: false }, { testMode: "false" },
    { observedAt: now + 1 }, { observedAt: now - DAY - 1 }, { observedAt: now + 0.1 },
    { windowStart: now - 89 * DAY }, { windowEnd: now + 1 },
    { totalPayoutCents: "9999" }, { totalPayoutCents: "1.2" }, { totalPayoutCents: "1e6" },
    { totalPayoutCents: "-10000" }, { totalPayoutCents: 150000 },
  ];
  for (const change of invalid) assert.throws(() => deriveEligibility({ ...facts, ...change }, config, now), JSON.stringify(change));
  assert.throws(() => deriveEligibility(facts, { ...config, allowFixtures: false }, now));
  assert.throws(() => deriveEligibility(facts, { ...config, allowTestMode: false }, now));
  assert.throws(() => deriveEligibility(facts, { ...config, chainId: 143 }, now));
});

test("refresh windows replace total rather than accumulating overlapping payouts", () => {
  const a = deriveEligibility(facts, config, now);
  const b = deriveEligibility({ ...facts, observedAt: now + 1, proofHash: hash("fresh"), sessionId: hash("fresh session") }, config, now + 1);
  assert.equal(a.ceiling, b.ceiling);
  assert.equal(a.sourceId, b.sourceId);
});
