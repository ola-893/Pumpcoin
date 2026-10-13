import { clientFor, registryAbi, synchronize } from "./core.js";
import { loadConfig, withState } from "./config.js";

const config = loadConfig();
const client = clientFor(config);
const broadcast = process.argv.includes("--broadcast");
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
let fromBlock = process.env.ORACLE_FROM_BLOCK ? BigInt(process.env.ORACLE_FROM_BLOCK) : await client.getBlockNumber();
let initial = true;
while (!stopping) {
  try {
    const head = await client.getBlockNumber();
    if (fromBlock > head) fromBlock = head;
    const events = await client.getContractEvents({ address: config.attestationRegistry, abi: registryAbi,
      eventName: "OracleRotated", fromBlock, toBlock: head });
    // Reconcile on every pass as well: retries complete interrupted updates and detect stale cards.
    const result = await withState(config, (state, save) => synchronize(config, state, save, broadcast));
    if (initial || events.length || !result.synchronized || ("walletProofPending" in result && result.walletProofPending)) {
      console.log(JSON.stringify({ ...result, transaction: undefined, rotationEvents: events.length, checkedBlock: head.toString() }));
    }
    initial = false;
    fromBlock = head + 1n;
  } catch {
    // Keep the cursor on failure; a later pass retries without minting a new identity.
    console.error("Identity synchronization failed. Inspect with npm run oracle; watcher will retry.");
  }
  if (!stopping) await new Promise(resolve => setTimeout(resolve, 15_000));
}
