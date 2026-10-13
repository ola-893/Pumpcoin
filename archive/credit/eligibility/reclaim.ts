import { createHmac } from "node:crypto";
import { ReclaimProofRequest, verifyProof, getIdentifierFromClaimInfo, type Proof } from "@reclaimprotocol/js-sdk";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { isDigest, requireCondition, type VerifiedFacts } from "./policy.js";

export type Session = {
  id: string; subject: Address; chainId: number; registry: Address;
  createdAt: number; expiresAt: number; reclaimSessionId?: string;
};
export type VerifierConfig = {
  appId: string; appSecret: string; providerId: string; providerVersion: string;
  sourceKey: string; providerHashes: Hex[];
};

export function challenge(s: Session, c: Pick<VerifierConfig, "appId" | "providerId" | "providerVersion">): string {
  return JSON.stringify({ domain: "proofline:wallet-authorization:v1", appId: c.appId,
    providerId: c.providerId, providerVersion: c.providerVersion, sessionId: s.id,
    subject: s.subject.toLowerCase(), chainId: s.chainId, registry: s.registry.toLowerCase(),
    createdAt: s.createdAt, expiresAt: s.expiresAt });
}

export async function createReclaimRequest(s: Session, c: VerifierConfig) {
  const request = await ReclaimProofRequest.init(c.appId, c.appSecret, c.providerId, {
    providerVersion: c.providerVersion, acceptAiProviders: false, log: false, acceptTeeAttestation: true,
  });
  const pinned = request.getProviderVersion();
  requireCondition(pinned.providerId === c.providerId && pinned.providerVersion === c.providerVersion, "Provider version changed");
  request.setContext(s.subject.toLowerCase(), challenge(s, c));
  return { reclaimSessionId: request.getSessionId(), request: request.toJsonString(), requestUrl: await request.getRequestUrl() };
}

/** Required custom provider schema, NOT an assertion that a compatible Stripe provider exists.
 * All fields MUST be extracted from authenticated responses by the reviewed, pinned provider.
 * The provider must prove complete pagination or a trusted server-computed 90-day aggregate.
 */
export function normalizeVerifiedPayouts(
  parameters: Record<string, string>, proof: Proof, s: Session, c: VerifierConfig,
): VerifiedFacts {
  const p = parameters;
  requireCondition(/^acct_[A-Za-z0-9]+$/.test(p.accountId ?? ""), "Missing authenticated account ID");
  requireCondition(p.currency === "USD" && p.complete === "true" && p.status === "paid", "Incomplete payout evidence");
  requireCondition(p.testMode === "true" || p.testMode === "false", "Missing mode");
  for (const key of ["windowStart", "windowEnd"]) {
    requireCondition(/^[0-9]{1,12}$/.test(p[key] ?? ""), "Invalid window");
  }
  requireCondition(isDigest(proof.claimData.identifier), "Missing canonical claim ID");
  const canonicalId = getIdentifierFromClaimInfo(proof.claimData);
  requireCondition(proof.claimData.identifier.toLowerCase() === canonicalId, "Noncanonical claim ID");
  // Stable across proof refreshes, provider versions and wallets. Persist this key securely:
  // changing it forks identities; raw account IDs and this secret never enter CRE reports.
  requireCondition(c.sourceKey.length >= 64, "Source key must have at least 256 bits of random entropy");
  const sourceId = `0x${createHmac("sha256", c.sourceKey).update(JSON.stringify([
    "proofline:source:v1", c.appId, "stripe", p.testMode, p.accountId,
  ])).digest("hex")}` as Hex;
  return {
    evidenceKind: "reclaim", subject: s.subject, chainId: s.chainId, registry: s.registry,
    sourceId, proofHash: keccak256(stringToHex(JSON.stringify(["proofline:claim:v1", canonicalId]))),
    sessionId: keccak256(stringToHex(`proofline:session:v1:${s.id}`)), providerId: c.providerId,
    providerVersion: c.providerVersion, observedAt: proof.claimData.timestampS,
    windowStart: Number(p.windowStart), windowEnd: Number(p.windowEnd),
    totalPayoutCents: p.totalPayoutCents, currency: "USD", complete: true, testMode: p.testMode === "true",
  };
}

export async function verifyReclaimPayouts(proof: Proof, s: Session, c: VerifierConfig, now: number): Promise<VerifiedFacts> {
  requireCondition(now < s.expiresAt && s.reclaimSessionId, "Session expired or unauthorized");
  requireCondition(c.providerHashes.length > 0 && c.providerHashes.every(isDigest), "Reviewed provider hashes required");
  const result = await verifyProof(proof, {
    // Exact reviewed content hashes prevent SDK provider-version patch resolution from
    // silently expanding the accepted extraction rules.
    hashes: c.providerHashes,
    teeAttestation: { appSecret: c.appSecret },
  });
  requireCondition(result.isVerified && result.isTeeAttestationVerified === true && result.data.length === 1, "Proof verification failed");
  const verified = result.data[0];
  assertReclaimBinding(proof, verified.context, s, c, now);
  return normalizeVerifiedPayouts(verified.extractedParameters, proof, s, c);
}

/** Called only after cryptographic/content/TEE verification; exported for negative binding tests. */
export function assertReclaimBinding(proof: Proof, context: Record<string, unknown>, s: Session, c: VerifierConfig, now: number) {
  requireCondition(now < s.expiresAt && s.reclaimSessionId, "Session expired or unauthorized");
  // SDK v5.8.2 returns the signed context with extractedParameters removed.
  const raw = JSON.parse(proof.claimData.context) as Record<string, unknown>;
  requireCondition(context.contextAddress === s.subject.toLowerCase() && context.contextMessage === challenge(s, c), "Wallet/context mismatch");
  requireCondition(raw.reclaimSessionId === s.reclaimSessionId, "Reclaim session mismatch");
  const nonce = raw.attestationNonceData as { applicationId?: string; sessionId?: string } | undefined;
  requireCondition(nonce?.applicationId === c.appId && nonce.sessionId === s.reclaimSessionId, "Application mismatch");
  requireCondition(Number.isSafeInteger(proof.claimData.timestampS) && proof.claimData.timestampS >= s.createdAt
    && proof.claimData.timestampS <= now, "Proof timestamp outside session");
}
