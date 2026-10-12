import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keccak256, stringToHex } from "viem";
import { deriveEligibility, type PolicyConfig, type VerifiedFacts } from "../eligibility/policy.js";

// Regression coverage for the explicit local-execution configuration used with
// authentic Stripe test-mode proofs: test mode allowed in BOTH verifier and
// workflow, fixtures disabled, proof validation preserved.
const workflowConfig = JSON.parse(readFileSync("cre/eligibility/config.localexec.example.json", "utf8"));
const broadcastConfig = JSON.parse(readFileSync("cre/eligibility/config.localexec.broadcast.example.json", "utf8"));
const verifierEnv = readFileSync("eligibility/localexec.env.example", "utf8");
const creEnv = readFileSync("cre/localexec.env.example", "utf8");
const workflowYaml = readFileSync("cre/eligibility/workflow.yaml", "utf8");

test("local-execution workflow configs allow test mode and forbid fixtures", () => {
  for (const [name, cfg, writeReport] of [["localexec", workflowConfig, false], ["localexec-broadcast", broadcastConfig, true]] as const) {
    assert.equal(cfg.allowFixtures, false, `${name}: fixtures must be disabled`);
    assert.equal(cfg.allowTestMode, true, `${name}: test mode must be allowed`);
    assert.equal(cfg.writeReport, writeReport, `${name}: writeReport must be ${writeReport}`);
    assert.equal(cfg.chainId, 10143, `${name}: Monad testnet only`);
    assert.match(cfg.verifierUrl, /^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$|^https:\/\//, `${name}: loopback or HTTPS verifier`);
  }
  assert.ok(workflowYaml.includes("localexec:") && workflowYaml.includes("localexec-broadcast:"), "workflow.yaml must define both localexec targets");
});

test("local-execution verifier env allows test mode with fixtures disabled", () => {
  assert.match(verifierEnv, /^ALLOW_RECLAIM_TEST_MODE=true$/m, "verifier must allow test mode");
  assert.ok(!/^ALLOW_FIXTURES=true$/m.test(verifierEnv), "verifier must not enable fixtures");
  assert.ok(creEnv.includes("VERIFIER_API_TOKEN="), "CRE env must supply the verifier token");
  assert.ok(creEnv.includes("CRE_ETH_PRIVATE_KEY="), "CRE broadcast signer must be configured");
  const project = readFileSync("project.yaml", "utf8");
  for (const target of ["fixture", "localexec"])
    assert.ok(project.includes(`${target}:\n  rpcs:\n    - chain-name: monad-testnet\n      url: \${MONAD_TESTNET_RPC_URL}`),
      `${target}: CLI v1.37 requires an RPC even for HTTP-only runs`);
  assert.match(project, /localexec-broadcast:\s+rpcs:\s+- chain-name: monad-testnet\s+url: \$\{MONAD_TESTNET_RPC_URL\}/,
    "CRE broadcast target must register its EVM capability with an RPC");
});

test("local-execution policy accepts test-mode reclaim facts, rejects fixtures and tampering", () => {
  const hash = (s: string) => keccak256(stringToHex(s));
  const now = 1_800_000_000;
  const cfg: PolicyConfig = { chainId: 10143, registry: "0x1111111111111111111111111111111111111111",
    providerId: "stripe-test", providerVersion: "v1", allowFixtures: false, allowTestMode: true };
  const base: VerifiedFacts = { evidenceKind: "reclaim", subject: "0x2222222222222222222222222222222222222222",
    chainId: 10143, registry: cfg.registry, sourceId: hash("a"), proofHash: hash("p"), sessionId: hash("s"),
    providerId: "stripe-test", providerVersion: "v1", observedAt: now, windowStart: now - 90 * 86400, windowEnd: now,
    totalPayoutCents: "150000", currency: "USD", complete: true, testMode: true };
  assert.equal(deriveEligibility(base, cfg, now).tier, 2, "authentic test-mode reclaim facts accepted");
  assert.equal(deriveEligibility({ ...base, testMode: false }, cfg, now).tier, 2, "live-mode facts still accepted");
  assert.throws(() => deriveEligibility({ ...base, evidenceKind: "fixture" }, cfg, now), /Unverified evidence/);
  assert.throws(() => deriveEligibility(base, { ...cfg, allowTestMode: false }, now), /Test-mode evidence rejected/);
  assert.throws(() => deriveEligibility({ ...base, providerId: "other" }, cfg, now), /Provider mismatch/);
  assert.throws(() => deriveEligibility({ ...base, providerVersion: "v9" }, cfg, now), /Provider mismatch/);
  assert.throws(() => deriveEligibility({ ...base, testMode: "true" }, cfg, now), /Test-mode evidence rejected/);
  assert.throws(() => deriveEligibility({ ...base, totalPayoutCents: "1" }, cfg, now), /Below minimum/);
});
