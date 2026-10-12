import { readFileSync } from "node:fs";
import { decodeAbiParameters, isAddress, keccak256, type Hex } from "viem";
import { DAY, POLICY_VERSION, REPORT_ABI, encodeEligibilityReport, isDigest, requireCondition } from "../eligibility/policy.js";

/** Parses exact saved bytes; this is NOT verification of the underlying Reclaim proof. */
export function parseSavedReport(text: string) {
  let encoded: unknown = text.trim();
  if ((encoded as string).startsWith("{")) {
    const saved = JSON.parse(encoded as string);
    encoded = saved.report;
    requireCondition(typeof encoded === "string" && saved.reportDigest === keccak256(encoded as Hex), "Saved report digest mismatch");
  }
  requireCondition(typeof encoded === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(encoded), "Expected exact report hex or report-tool JSON");
  const [chainId, registry, report] = decodeAbiParameters(REPORT_ABI, encoded as Hex);
  requireCondition(chainId === 31337n || chainId === 10143n, "Test chains only");
  requireCondition(isAddress(registry) && !/^0x0{40}$/i.test(registry)
    && isAddress(report.subject) && !/^0x0{40}$/i.test(report.subject), "Invalid report destination or subject");
  requireCondition([report.sourceId, report.proofHash, report.sessionId].every(isDigest), "Invalid evidence identifiers");
  requireCondition(report.policyVersion === POLICY_VERSION && report.tier >= 1 && report.tier <= 3
    && report.ceiling === [0n, 50_000_000n, 80_000_000n, 120_000_000n][report.tier], "Unexpected report policy");
  requireCondition(report.expiresAt === report.observedAt + BigInt(7 * DAY), "Unexpected report lifetime");
  requireCondition(encodeEligibilityReport(report, { chainId: Number(chainId), registry }).toLowerCase() === encoded.toLowerCase(), "Noncanonical report bytes");
  return { encoded: encoded as Hex, digest: keccak256(encoded as Hex), chainId: Number(chainId), registry, report };
}

export function readSavedReport(path: string) {
  const text = readFileSync(path, "utf8");
  requireCondition(Buffer.byteLength(text) < 16_384, "Saved report too large");
  return parseSavedReport(text);
}
