import { createServer } from "node:http";
import { keccak256, stringToHex, type Address } from "viem";
import { DAY, type VerifiedFacts } from "./policy.js";

// Separate executable. The real verifier has no fixture toggle or unsigned-facts endpoint.
const observedAt = Math.floor(Date.now() / 1000);
const facts: VerifiedFacts = {
  evidenceKind: "fixture", subject: "0x2222222222222222222222222222222222222222",
  chainId: 10143, registry: (process.env.FIXTURE_REGISTRY ?? "0x1111111111111111111111111111111111111111") as Address,
  sourceId: keccak256(stringToHex("SYNTHETIC-account")), proofHash: keccak256(stringToHex(`SYNTHETIC-proof-${observedAt}`)),
  sessionId: keccak256(stringToHex(`SYNTHETIC-session-${observedAt}`)),
  providerId: "SYNTHETIC-NOT-RECLAIM", providerVersion: "fixture-v1", observedAt,
  windowStart: observedAt - 90 * DAY, windowEnd: observedAt,
  totalPayoutCents: "150000", currency: "USD", complete: true, testMode: true,
};
createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url !== "/facts/fixture-demo" || req.headers.authorization !== "Bearer fixture-only-not-a-secret") {
    res.statusCode = 404; res.end("{}"); return;
  }
  res.end(JSON.stringify(facts));
}).listen(8788, "127.0.0.1", () => console.log("SYNTHETIC fixture server on 127.0.0.1:8788. NOT Reclaim verification."));
