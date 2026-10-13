import { synchronize } from "./core.js";
import { loadConfig, withState } from "./config.js";

try {
  const config = loadConfig();
  const result = await withState(config, (state, save) => synchronize(config, state, save, process.argv.includes("--broadcast")));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // SDK/RPC errors may contain request URLs. Do not dump keys or RPC configuration.
  const message = error instanceof Error ? error.message : "Oracle identity command failed.";
  console.error(message.replace(/https?:\/\/\S+/g, "[URL]").replace(/0x[a-fA-F0-9]{64}/g, "[redacted digest]"));
  process.exitCode = 1;
}
