import { Runner } from "@chainlink/cre-sdk";
import { initWorkflow, type Config } from "./workflow.js";

// Javy entry point must export only parameterless functions.
export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
