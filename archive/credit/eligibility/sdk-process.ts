import { fork } from "node:child_process";
import type { Proof } from "@reclaimprotocol/js-sdk";
import type { Session, VerifierConfig } from "./reclaim.js";

export function sdkOperation<T>(job: {
  operation: "create" | "verify"; session: Session; config: VerifierConfig; proof?: Proof; now?: number;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = fork(new URL("./sdk-worker.ts", import.meta.url), [], {
      execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Verifier timed out")); }, 25_000);
    child.once("error", () => { clearTimeout(timer); reject(new Error("Verifier unavailable")); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("Verifier stopped")); });
    child.once("message", (message: any) => {
      clearTimeout(timer); child.kill();
      if (message.ok) resolve(message.result as T);
      else reject(new Error("Proof verification failed"));
    });
    child.send(job);
  });
}
