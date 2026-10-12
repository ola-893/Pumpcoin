import test from "node:test";
import assert from "node:assert/strict";
import { keccak256, stringToHex } from "viem";
import { DAY, POLICY_VERSION, encodeEligibilityReport } from "../eligibility/policy.js";
import { parseSavedReport } from "../cre/local-report.js";

const hash = (x: string) => keccak256(stringToHex(x));
const config = { chainId: 31337, registry: "0x1111111111111111111111111111111111111111" as const };
const report = { subject: "0x2222222222222222222222222222222222222222" as const,
  sourceId: hash("account"), proofHash: hash("proof"), sessionId: hash("session"), policyVersion: POLICY_VERSION,
  tier: 2, observedAt: 1_800_000_000n, expiresAt: 1_800_000_000n + BigInt(7 * DAY), ceiling: 80_000_000n };
const encoded = encodeEligibilityReport(report, config);

test("approval and delivery parse the exact same saved JSON or hex report", () => {
  const a = parseSavedReport(encoded);
  const b = parseSavedReport(JSON.stringify({ report: encoded, reportDigest: keccak256(encoded) }));
  assert.deepEqual(a, b);
  assert.deepEqual(a.report, report);
});

test("saved reports reject tampering, mainnet, trailing bytes, foreign policy and inflated credit", () => {
  assert.throws(() => parseSavedReport(JSON.stringify({ report: encoded, reportDigest: hash("wrong") })), /digest mismatch/);
  assert.throws(() => parseSavedReport(encoded + "00"), /Noncanonical/);
  assert.throws(() => parseSavedReport(encodeEligibilityReport(report, { ...config, chainId: 1 })), /Test chains only/);
  for (const change of [{ policyVersion: hash("unknown") }, { ceiling: 81_000_000n }, { tier: 0 },
    { expiresAt: report.expiresAt + 1n }, { sourceId: `0x${"00".repeat(32)}` as const }])
    assert.throws(() => parseSavedReport(encodeEligibilityReport({ ...report, ...change }, config)));
});
