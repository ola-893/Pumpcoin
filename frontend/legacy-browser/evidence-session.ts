import { isAddress, type Address, type Hash } from "viem";

export type EvidenceReceipt = { receiptId: string; proofHash: Hash };

/** Validate the exact message before asking a human wallet to sign it. */
export function validateEvidenceChallenge(
  response: { sessionId: string; challenge: string; expiresAt: number },
  human: Address,
  registry: Address,
  now: number,
) {
  const c = JSON.parse(response.challenge);
  if (
    c.domain !== "proofline:wallet-authorization:v1" ||
    c.sessionId !== response.sessionId ||
    typeof c.appId !== "string" ||
    !c.appId ||
    typeof c.providerId !== "string" ||
    !c.providerId ||
    typeof c.providerVersion !== "string" ||
    !c.providerVersion ||
    !isAddress(c.subject) ||
    c.subject.toLowerCase() !== human.toLowerCase() ||
    c.chainId !== 10143 ||
    !isAddress(c.registry) ||
    c.registry.toLowerCase() !== registry.toLowerCase() ||
    !Number.isSafeInteger(c.createdAt) ||
    c.createdAt > now ||
    !Number.isSafeInteger(c.expiresAt) ||
    c.expiresAt !== response.expiresAt ||
    c.expiresAt <= now ||
    c.expiresAt <= c.createdAt ||
    c.expiresAt - c.createdAt > 900
  ) {
    throw new Error("Evidence challenge binding or lifetime mismatch");
  }
}

export function parseEvidenceReceipt(value: unknown): EvidenceReceipt {
  const r = value as Record<string, unknown>;
  if (
    !r ||
    typeof r.receiptId !== "string" ||
    !/^[a-zA-Z0-9-]{1,128}$/.test(r.receiptId) ||
    typeof r.proofHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(r.proofHash) ||
    /^0x0{64}$/i.test(r.proofHash)
  ) {
    throw new Error("Invalid public evidence receipt");
  }
  return { receiptId: r.receiptId, proofHash: r.proofHash as Hash };
}

export function receiptStorageKey(human: Address, registry: Address) {
  return `unora.evidence.receipt.v1:10143:${registry.toLowerCase()}:${human.toLowerCase()}`;
}

export function isReceiptDelivered(
  receipt: EvidenceReceipt,
  chainProofHash: Hash,
) {
  return receipt.proofHash.toLowerCase() === chainProofHash.toLowerCase();
}
