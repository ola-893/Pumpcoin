import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvidenceStore } from "../eligibility/store.js";
import { assertReclaimBinding, challenge, normalizeVerifiedPayouts, type Session } from "../eligibility/reclaim.js";
import { getIdentifierFromClaimInfo, type Proof } from "@reclaimprotocol/js-sdk";

const config = { appId: "test", appSecret: "not-a-real-secret", providerId: "test", providerVersion: "1.0.0", sourceKey: "a".repeat(64), providerHashes: [] };
const session: Session = { id: "session", subject: "0x2222222222222222222222222222222222222222", chainId: 10143,
  registry: "0x1111111111111111111111111111111111111111", createdAt: 1000, expiresAt: 2000, reclaimSessionId: "reclaim-test" };
// Synthetic data for normalization only. This is NOT accepted by verifyReclaimPayouts.
const claim = { provider: "http", parameters: "{}", context: "{}" };
const proof = { claimData: { ...claim, identifier: getIdentifierFromClaimInfo(claim), timestampS: 1000 } } as Proof;
const params = { accountId: "acct_Test", currency: "USD", complete: "true", status: "paid", testMode: "true",
  windowStart: "0", windowEnd: "7776000", totalPayoutCents: "100000" };

test("source pseudonym stable across wallets, proofs and provider versions; mode separated", () => {
  const a = normalizeVerifiedPayouts(params, proof, session, config);
  const b = normalizeVerifiedPayouts(params, proof, { ...session, subject: "0x3333333333333333333333333333333333333333" }, { ...config, providerVersion: "2.0.0" });
  assert.equal(a.sourceId, b.sourceId);
  assert.notEqual(a.sourceId, normalizeVerifiedPayouts({ ...params, testMode: "false" }, proof, session, config).sourceId);
  assert.equal(JSON.stringify(a).includes("acct_Test"), false);
  assert.notEqual(challenge(session, config), challenge({ ...session, chainId: 31337 }, config));
  assert.throws(() => normalizeVerifiedPayouts({ ...params, complete: "false" }, proof, session, config));
});

test("verified context binds wallet, destination, provider, application and session", () => {
  const raw = { reclaimSessionId: session.reclaimSessionId,
    attestationNonceData: { applicationId: config.appId, sessionId: session.reclaimSessionId } };
  const bound = { ...proof, claimData: { ...proof.claimData, context: JSON.stringify(raw) } };
  const context = { contextAddress: session.subject.toLowerCase(), contextMessage: challenge(session, config) };
  assert.doesNotThrow(() => assertReclaimBinding(bound, context, session, config, 1001));
  for (const changed of [
    { ...session, subject: "0x3333333333333333333333333333333333333333" as const },
    { ...session, chainId: 31337 }, { ...session, id: "stolen-session" },
    { ...session, registry: "0x3333333333333333333333333333333333333333" as const },
    { ...session, reclaimSessionId: "wrong" },
  ]) assert.throws(() => assertReclaimBinding(bound, context, changed, config, 1001));
  assert.throws(() => assertReclaimBinding(bound, context, session, { ...config, providerVersion: "changed" }, 1001));
  assert.throws(() => assertReclaimBinding(bound, context, session, config, 2000));
  assert.throws(() => assertReclaimBinding(bound, context, session, config, 999));
  const wrongApp = { ...bound, claimData: { ...bound.claimData,
    context: JSON.stringify({ ...raw, attestationNonceData: { ...raw.attestationNonceData, applicationId: "wrong" } }) } };
  assert.throws(() => assertReclaimBinding(wrongApp, context, session, config, 1001));
});

test("consumption persists across restarts, duplicate claims rollback atomically, reads are retryable", () => {
  const dir = mkdtempSync(join(tmpdir(), "proofline-store-"));
  const path = join(dir, "test.sqlite");
  let store = new EvidenceStore(path);
  try {
    const facts = normalizeVerifiedPayouts(params, proof, session, config);
    store.create(session);
    assert.throws(() => store.consume(session.id, facts));
    store.authorize(session);
    store.consume(session.id, facts);
    assert.throws(() => store.consume(session.id, facts));
    assert.deepEqual(store.receipt(session.id), store.receipt(session.id));
    store.db.close(); store = new EvidenceStore(path);
    assert.equal(store.get(session.id).consumed, true);
    const second = { ...session, id: "second" };
    store.create(second); store.authorize(second);
    assert.throws(() => store.consume(second.id, facts));
    assert.equal(store.get(second.id).consumed, false);
  } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
});
