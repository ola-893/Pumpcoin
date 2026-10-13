import { createReclaimRequest, verifyReclaimPayouts } from "./reclaim.js";

// SDK diagnostics can include proof/provider details. IPC carries results; stdout/stderr
// are discarded by the parent so restarting with an SDK default log level cannot leak them.
process.once("message", async (job: any) => {
  try {
    const result = job.operation === "create"
      ? await createReclaimRequest(job.session, job.config)
      : await verifyReclaimPayouts(job.proof, job.session, job.config, job.now);
    process.send?.({ ok: true, result });
  } catch { process.send?.({ ok: false }); }
});
