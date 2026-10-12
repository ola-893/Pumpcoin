import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEvidenceChallenge,
  parseEvidenceReceipt,
  receiptStorageKey,
  isReceiptDelivered,
} from "../frontend/legacy-browser/evidence-session.js";
import { parseAgentDeployment } from "../frontend/legacy-browser/agent-deployment.js";

const human = "0x0000000000000000000000000000000000000001";
const registry = "0x0000000000000000000000000000000000000002";
const c = {
  domain: "proofline:wallet-authorization:v1",
  sessionId: "session-1",
  appId: "reviewed-app",
  providerId: "reviewed-provider",
  providerVersion: "1",
  subject: human,
  chainId: 10143,
  registry,
  createdAt: 100,
  expiresAt: 1000,
};
const response = (changes = {}) => ({
  sessionId: "session-1",
  challenge: JSON.stringify({ ...c, ...changes }),
  expiresAt: 1000,
});

test("human signs only the same domain, wallet, registry, session and finite lifetime", () => {
  validateEvidenceChallenge(response(), human, registry, 200);
  for (const changes of [
    { domain: "another-app" },
    { subject: registry },
    { registry: human },
    { chainId: 1 },
    { sessionId: "another-session" },
    { expiresAt: 1001 },
    { createdAt: 201 },
    { createdAt: 99 },
  ]) {
    assert.throws(() =>
      validateEvidenceChallenge(response(changes), human, registry, 200),
    );
  }
  assert.throws(() =>
    validateEvidenceChallenge(response(), human, registry, 1000),
  );
});

test("reload-safe public receipt is wallet and deployment scoped, and old evidence cannot confirm it", () => {
  const proofHash = `0x${"a".repeat(64)}` as const;
  const receipt = parseEvidenceReceipt(
    JSON.parse(JSON.stringify({ receiptId: "session-1", proofHash })),
  );
  assert.equal(isReceiptDelivered(receipt, proofHash), true);
  assert.equal(isReceiptDelivered(receipt, `0x${"b".repeat(64)}`), false);
  assert.notEqual(
    receiptStorageKey(human, registry),
    receiptStorageKey(registry, human),
  );
  assert.throws(() => parseEvidenceReceipt({ receiptId: "session-1" }));
  assert.throws(() =>
    parseEvidenceReceipt({
      receiptId: "session-1",
      proofHash: `0x${"0".repeat(64)}`,
    }),
  );
});

test("agent frontend rejects old, mainnet, aliased and incomplete manifests", () => {
  const manifest = {
    chainId: 10143,
    mode: "evidence",
    fromBlock: "1",
    registry,
    human,
    creditLine: "0x0000000000000000000000000000000000000003",
    loanToken: "0x0000000000000000000000000000000000000004",
    collateralToken: "0x0000000000000000000000000000000000000005",
    mandate: "0x0000000000000000000000000000000000000006",
  };
  assert.equal(parseAgentDeployment(undefined), null);
  assert.equal(parseAgentDeployment(JSON.stringify(manifest))?.fromBlock, 1n);
  for (const changes of [
    { chainId: 1 },
    { mode: "manual" },
    { mandate: manifest.creditLine },
    { registry: "0x0000000000000000000000000000000000000000" },
    { fromBlock: -1 },
  ]) {
    assert.throws(() =>
      parseAgentDeployment(JSON.stringify({ ...manifest, ...changes })),
    );
  }
});
