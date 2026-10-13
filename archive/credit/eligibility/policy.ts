import { encodeAbiParameters, isAddress, keccak256, parseAbiParameters, stringToHex, type Address, type Hex } from "viem";

export const POLICY_VERSION = keccak256(stringToHex("proofline:payout-policy:v1:test-tokens"));
export const DAY = 86400;
export type VerifiedFacts = {
  evidenceKind: "reclaim" | "fixture";
  subject: Address;
  chainId: number;
  registry: Address;
  sourceId: Hex;
  proofHash: Hex;
  sessionId: Hex;
  providerId: string;
  providerVersion: string;
  observedAt: number;
  windowStart: number;
  windowEnd: number;
  totalPayoutCents: string;
  currency: "USD";
  complete: true;
  testMode: boolean;
};
export type PolicyConfig = {
  chainId: number;
  registry: Address;
  providerId: string;
  providerVersion: string;
  allowFixtures: boolean;
  allowTestMode: boolean;
};
export type Eligibility = {
  subject: Address;
  sourceId: Hex;
  proofHash: Hex;
  sessionId: Hex;
  policyVersion: Hex;
  tier: number;
  observedAt: bigint;
  expiresAt: bigint;
  ceiling: bigint;
};

export function requireCondition(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
export function isDigest(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0+$/.test(value);
}

/** Shared deterministic policy: runs in CRE, Node tests, and the local demo. */
export function deriveEligibility(input: unknown, config: PolicyConfig, now: number): Eligibility {
  requireCondition(input && typeof input === "object", "Invalid facts");
  const f = input as VerifiedFacts;
  requireCondition(typeof config.allowFixtures === "boolean" && typeof config.allowTestMode === "boolean", "Invalid policy flags");
  requireCondition([31337, 10143].includes(config.chainId), "Test chains only");
  requireCondition(f.evidenceKind === "reclaim" || (f.evidenceKind === "fixture" && config.allowFixtures), "Unverified evidence");
  requireCondition(f.providerId === config.providerId && f.providerVersion === config.providerVersion, "Provider mismatch");
  requireCondition(isAddress(f.subject) && isAddress(f.registry) && f.subject !== "0x0000000000000000000000000000000000000000", "Invalid address");
  requireCondition(f.chainId === config.chainId && f.registry.toLowerCase() === config.registry.toLowerCase(), "Wrong destination");
  requireCondition(isDigest(f.sourceId) && isDigest(f.proofHash) && isDigest(f.sessionId), "Invalid evidence identifiers");
  requireCondition(Number.isSafeInteger(now) && [f.observedAt, f.windowStart, f.windowEnd].every(Number.isSafeInteger), "Invalid timestamp");
  requireCondition(f.windowStart >= 0 && f.observedAt <= now && now - f.observedAt <= DAY, "Stale or future evidence");
  requireCondition(f.windowEnd - f.windowStart === 90 * DAY && f.windowEnd <= f.observedAt
    && f.observedAt - f.windowEnd <= DAY, "Incomplete or stale payout window");
  requireCondition(f.currency === "USD" && f.complete === true, "Unsupported or incomplete payouts");
  requireCondition(typeof f.testMode === "boolean" && (!f.testMode || config.allowTestMode), "Test-mode evidence rejected");
  requireCondition(typeof f.totalPayoutCents === "string" && /^(0|[1-9][0-9]{0,14})$/.test(f.totalPayoutCents), "Invalid minor-unit total");
  const amount = BigInt(f.totalPayoutCents);
  requireCondition(amount >= 10000n, "Below minimum demo tier");
  const tier = amount >= 1000000n ? 3 : amount >= 100000n ? 2 : 1;
  return {
    subject: f.subject, sourceId: f.sourceId, proofHash: f.proofHash, sessionId: f.sessionId,
    policyVersion: POLICY_VERSION, tier, observedAt: BigInt(f.observedAt),
    expiresAt: BigInt(f.observedAt + 7 * DAY), ceiling: [0n, 50_000_000n, 80_000_000n, 120_000_000n][tier],
  };
}

export const REPORT_ABI = parseAbiParameters("uint256 chainId, address registry, (address subject, bytes32 sourceId, bytes32 proofHash, bytes32 sessionId, bytes32 policyVersion, uint8 tier, uint64 observedAt, uint64 expiresAt, uint256 ceiling) eligibility");
export function encodeEligibilityReport(r: Eligibility, config: Pick<PolicyConfig, "chainId" | "registry">): Hex {
  return encodeAbiParameters(REPORT_ABI, [BigInt(config.chainId), config.registry, r]);
}
