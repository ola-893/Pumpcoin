import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { keccak256, stringToHex } from "viem";
import { DAY } from "../eligibility/policy.js";
import { parseSavedReport } from "../cre/local-report.js";

// Mock normalized facts test the CLI boundary; this does NOT verify Reclaim evidence.
test("report CLI uses configured endpoint, saves immutable bytes, and rejects fixtures", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "proofline-report-tool-"));
  const token = "synthetic-test-token-at-least-32-characters";
  let evidenceKind = "reclaim";
  const now = Math.floor(Date.now() / 1000);
  const hash = (x: string) => keccak256(stringToHex(x));
  const registry = "0x1111111111111111111111111111111111111111";
  const server = createServer((req, res) => {
    assert.equal(req.url, "/facts/receipt-test");
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ evidenceKind, subject: "0x2222222222222222222222222222222222222222",
      chainId: 31337, registry, sourceId: hash("account"), proofHash: hash("proof"), sessionId: hash("session"),
      providerId: "MOCK_PROVIDER", providerVersion: "v1", observedAt: now, windowStart: now - 90 * DAY,
      windowEnd: now, totalPayoutCents: "150000", currency: "USD", complete: true, testMode: true }));
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  mkdirSync(join(scratch, "cre/eligibility"), { recursive: true });
  writeFileSync(join(scratch, "cre/eligibility/config.localexec.local.json"), JSON.stringify({
    chainId: 31337, registry, providerId: "MOCK_PROVIDER", providerVersion: "v1", allowFixtures: false,
    allowTestMode: true, verifierUrl: `http://127.0.0.1:${port}`,
  }));
  const tool = resolve("cre/report-local.ts");
  const tsx = resolve("node_modules/tsx/dist/loader.mjs");
  const out = join(scratch, "report.json");
  async function run() {
    const env: NodeJS.ProcessEnv = { ...process.env, VERIFIER_API_TOKEN: token, RECEIPT_ID: "receipt-test" };
    delete env.CONFIG_PATH;
    delete env.VERIFIER_URL;
    return await new Promise<{ code: number | null; stdout: string; stderr: string }>((r, reject) => {
      const child = spawn(process.execPath, ["--import", tsx, tool, "--out", out], { cwd: scratch, env, timeout: 10_000 });
      let stdout = "", stderr = "";
      child.stdout.on("data", x => stdout += x);
      child.stderr.on("data", x => stderr += x);
      child.on("error", reject);
      child.on("close", code => r({ code, stdout, stderr }));
    });
  }
  try {
    const first = await run();
    assert.equal(first.code, 0, first.stderr);
    const original = readFileSync(out, "utf8");
    const saved = parseSavedReport(original);
    assert.equal(saved.report.ceiling, 80_000_000n);
    assert.equal(JSON.parse(first.stdout).mode, "REPORT_ONLY_LOCAL");
    const overwrite = await run();
    assert.notEqual(overwrite.code, 0);
    assert.equal(readFileSync(out, "utf8"), original);
    evidenceKind = "fixture";
    const fixture = await run();
    assert.notEqual(fixture.code, 0);
    assert.match(fixture.stderr, /Unverified evidence/);
    assert.equal(readFileSync(out, "utf8"), original);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    rmSync(scratch, { recursive: true, force: true });
  }
});
