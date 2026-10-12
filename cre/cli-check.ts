import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ACTUAL CRE CLI EXECUTION (not mocked SDK tests): runs the real `cre`
// binary and records version, authentication, chain support, local build and
// simulation results. Auth-dependent steps report BLOCKED instead of claiming
// success. Run: npx tsx cre/cli-check.ts
type Step = { name: string; command: string[]; needsAuth: boolean };
const steps: Step[] = [
  { name: "version", command: ["version"], needsAuth: false },
  { name: "whoami", command: ["whoami"], needsAuth: true },
  { name: "supported-chains", command: ["workflow", "supported-chains", "--output", "json"], needsAuth: true },
  { name: "build", command: ["workflow", "build", "./cre/eligibility", "--target", "fixture", "--output", ".local/eligibility.wasm"], needsAuth: false },
  { name: "simulate-fixture", command: ["workflow", "simulate", "./cre/eligibility", "--target", "fixture",
    "--env", "./cre/fixture.env", "--non-interactive", "--trigger-index", "0",
    "--http-payload", "./cre/eligibility/trigger.fixture.json"], needsAuth: true },
];
console.log("ACTUAL CLI EXECUTION (real `cre` binary; separate from mocked SDK tests)");
const fallback = join(homedir(), ".cre", "bin", "cre");
const probe = spawnSync("cre", ["version"], { encoding: "utf8", timeout: 30_000 });
const binary = probe.error && existsSync(fallback) ? fallback : "cre";
if (probe.error && !existsSync(fallback)) {
  console.log(`cre binary missing: ${String(probe.error.message).split("\n")[0]}`);
  process.exit(2);
}
console.log(`binary: ${binary === "cre" ? "cre (PATH)" : fallback}`);
mkdirSync(".local", { recursive: true, mode: 0o700 });
let failed = false;
let blocked = false;
for (const step of steps) {
  const r = spawnSync(binary, step.command, { encoding: "utf8", timeout: 55_000 });
  const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-6).join("\n");
  const unauthenticated = /not logged in|no CRE_API_KEY|Authentication required|authentication required/i.test(tail);
  const label = r.error ? "ERROR" : r.status === 0 ? "OK" : unauthenticated && step.needsAuth ? "BLOCKED(no auth)" : "FAIL";
  if (label === "FAIL" || label === "ERROR") failed = true;
  if (label === "BLOCKED(no auth)") blocked = true;
  console.log(`--- ${step.name}: ${label} (exit ${r.status})`);
  console.log(tail);
}
if (failed) {
  console.log("RESULT: a non-auth CLI step failed (see FAIL above).");
  process.exit(1);
}
console.log("RESULT: recorded. OK = executed; BLOCKED(no auth) = requires `cre login` or CRE_API_KEY; nothing here proves DON delivery.");
if (blocked) process.exitCode = 2;
