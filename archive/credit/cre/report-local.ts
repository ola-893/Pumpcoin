import assert from "node:assert/strict";
import { isAddress, keccak256, type Address } from "viem";
import { deriveEligibility, encodeEligibilityReport, type PolicyConfig } from "../eligibility/policy.js";

// Fully LOCAL report generation: no CRE CLI, no login, no API key for CRE, no
// DON. Fetches immutable verified facts from the local verifier over loopback
// with the verifier's bearer token, runs the shared payout policy in Node,
// and prints the exact encoded report plus its keccak256 digest for the
// operator approval step. Proof validation happens in the verifier before this
// step; fixtures stay rejected when the config disables them.
//
// Usage:
//   VERIFIER_URL=http://127.0.0.1:8787 VERIFIER_API_TOKEN=... RECEIPT_ID=... \
//     node --import tsx cre/report-local.ts
//   (uses the configured config.localexec.local.json unless --config is supplied)
import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.VERIFIER_API_TOKEN;
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const receiptId = arg("--receipt") ?? process.env.RECEIPT_ID;
assert.ok(token && token.length > 0, "Set VERIFIER_API_TOKEN (the verifier's bearer token)");
assert.ok(receiptId && /^[A-Za-z0-9-]{1,80}$/.test(receiptId), "Set RECEIPT_ID to the verifier receipt ID");
const configPath = arg("--config") ?? process.env.CONFIG_PATH ?? "cre/eligibility/config.localexec.local.json";
const raw = JSON.parse(readFileSync(configPath, "utf8"));
const verifierUrl = process.env.VERIFIER_URL ?? raw.verifierUrl;
assert.ok(typeof verifierUrl === "string" && (verifierUrl.startsWith("https://")
  || /^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/.test(verifierUrl)), "Use HTTPS or loopback verifier");
assert.ok(isAddress(raw.registry) && !/^0x0{40}$/i.test(raw.registry), "Configure registry");
assert.ok(typeof raw.providerId === "string" && raw.providerId && !raw.providerId.startsWith("REPLACE")
  && typeof raw.providerVersion === "string" && raw.providerVersion && !raw.providerVersion.startsWith("REPLACE"), "Configure reviewed provider");
const config: PolicyConfig & { receiver: Address } = {
  chainId: raw.chainId, registry: raw.registry, providerId: raw.providerId, providerVersion: raw.providerVersion,
  allowFixtures: raw.allowFixtures, allowTestMode: raw.allowTestMode,
  receiver: raw.receiver,
};
assert.equal(config.allowFixtures, false, "Local execution never enables fixtures");
const res = await fetch(`${verifierUrl}/facts/${receiptId}`, {
  headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000), redirect: "error",
});
assert.equal(res.status, 200, `Verifier rejected receipt (HTTP ${res.status})`);
const chunks: Buffer[] = [];
let size = 0;
for await (const chunk of res.body!) {
  size += chunk.length;
  assert.ok(size < 16_384, "Verifier response too large");
  chunks.push(Buffer.from(chunk));
}
const facts = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const now = Math.floor(Date.now() / 1000);
const report = deriveEligibility(facts, config, now);
const encoded = encodeEligibilityReport(report, { chainId: config.chainId, registry: config.registry });
const output = JSON.stringify({ mode: "REPORT_ONLY_LOCAL", report: encoded, reportDigest: keccak256(encoded),
  subject: report.subject, tier: report.tier, ceiling: report.ceiling.toString() });
// Refuse to overwrite an existing approval artifact. Subsequent steps use these
// saved bytes, rather than fetching/deriving a potentially different report.
const out = arg("--out");
if (out) writeFileSync(out, output + "\n", { mode: 0o600, flag: "wx" });
console.log(output);
