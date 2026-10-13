import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { isAddress, verifyMessage, type Address, type Hex } from "viem";
import { challenge, type Session } from "./reclaim.js";
import { deriveEligibility, isDigest, requireCondition, type VerifiedFacts } from "./policy.js";
import { EvidenceStore } from "./store.js";
import { sdkOperation } from "./sdk-process.js";

function env(name: string) {
  const value = process.env[name];
  requireCondition(value && !value.startsWith("REPLACE"), `Configure ${name}`);
  return value;
}
const config = { appId: env("RECLAIM_APP_ID"), appSecret: env("RECLAIM_APP_SECRET"),
  providerId: env("RECLAIM_PROVIDER_ID"), providerVersion: env("RECLAIM_PROVIDER_VERSION"),
  sourceKey: env("SOURCE_ID_KEY"), providerHashes: JSON.parse(env("RECLAIM_PROVIDER_HASHES")) as Hex[] };
requireCondition(Array.isArray(config.providerHashes) && config.providerHashes.length > 0
  && config.providerHashes.every(isDigest), "Configure reviewed provider content hashes");
requireCondition(/^[a-fA-F0-9]{64}$/.test(config.sourceKey), "SOURCE_ID_KEY must be 32 random bytes as hex");
const token = env("VERIFIER_API_TOKEN");
requireCondition(token.length >= 32, "Use a random API token of at least 32 characters");
const registry = env("ELIGIBILITY_REGISTRY") as Address;
requireCondition(isAddress(registry), "Invalid registry");
const policy = { registry, chainId: Number(env("ELIGIBILITY_CHAIN_ID")),
  providerId: config.providerId, providerVersion: config.providerVersion,
  allowFixtures: false, allowTestMode: process.env.ALLOW_RECLAIM_TEST_MODE === "true" };
requireCondition([10143, 31337].includes(policy.chainId), "Only test chains supported");
mkdirSync(".local", { recursive: true, mode: 0o700 });
const store = new EvidenceStore(".local/evidence.sqlite");
const now = () => Math.floor(Date.now() / 1000);

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  try {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method === "GET" && pathname.startsWith("/facts/")) {
      const supplied = Buffer.from(req.headers.authorization ?? "");
      const expected = Buffer.from(`Bearer ${token}`);
      requireCondition(supplied.length === expected.length && timingSafeEqual(supplied, expected), "Unauthorized");
      res.end(JSON.stringify(store.receipt(pathname.slice(7))));
      return;
    }
    requireCondition(req.method === "POST", "Unknown route");
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      requireCondition(Buffer.byteLength(body) <= 512_000, "Payload too large");
    }
    const input = JSON.parse(body);
    if (pathname === "/sessions") {
      requireCondition(typeof input.subject === "string" && isAddress(input.subject), "Invalid wallet");
      const createdAt = now();
      const s: Session = { id: randomUUID(), subject: input.subject.toLowerCase() as Address,
        chainId: policy.chainId, registry, createdAt, expiresAt: createdAt + 900 };
      store.create(s);
      res.end(JSON.stringify({ sessionId: s.id, challenge: challenge(s, config), expiresAt: s.expiresAt }));
      return;
    }
    const match = /^\/sessions\/([a-zA-Z0-9-]+)\/(authorize|proof)$/.exec(pathname);
    requireCondition(match, "Unknown route");
    const { session: s, authorized, consumed } = store.get(match[1]);
    requireCondition(!consumed && now() < s.expiresAt, "Session expired or consumed");
    if (match[2] === "authorize") {
      requireCondition(!authorized && typeof input.signature === "string", "Already authorized or missing signature");
      requireCondition(await verifyMessage({ address: s.subject, message: challenge(s, config), signature: input.signature as Hex }), "Invalid wallet signature");
      const created = await sdkOperation<{ reclaimSessionId: string; request: string; requestUrl: string }>({ operation: "create", session: s, config });
      s.reclaimSessionId = created.reclaimSessionId;
      store.authorize(s);
      res.end(JSON.stringify({ request: JSON.parse(created.request), requestUrl: created.requestUrl }));
      return;
    }
    requireCondition(authorized, "Wallet authorization required");
    const facts = await sdkOperation<VerifiedFacts>({ operation: "verify", proof: input.proof, session: s, config, now: now() });
    deriveEligibility(facts, policy, now());
    store.consume(s.id, facts);
    // Public digest lets the frontend match this receipt to registry state without exposing facts.
    res.end(JSON.stringify({ receiptId: s.id, proofHash: facts.proofHash, status: "verified" }));
  } catch {
    // SDK/proof errors may contain private financial data. Never return or log them.
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Request rejected" }));
  }
});
server.requestTimeout = 30_000;
server.listen(Number(process.env.PORT ?? 8787), "127.0.0.1", () => {
  console.log("ProofLine verifier listening on loopback; no raw proof logging. Not a production public API.");
});
