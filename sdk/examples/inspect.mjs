// Run from a built package: node sdk/examples/inspect.mjs agent-credit/config.local.json 0xAGENT
import { readFileSync } from "node:fs";
import { createAgentCreditReader } from "@unora/agent-credit";
const [file, agent] = process.argv.slice(2);
if (!file || !agent) throw new Error("Usage: inspect.mjs <worker-config.json> <agent-address>");
const input = JSON.parse(readFileSync(file, "utf8"));
const reader = createAgentCreditReader({
  chainId: input.chainId, creditLine: input.creditLine, mandate: input.mandate,
  loanToken: input.loanToken, human: input.human, agent, fromBlock: BigInt(input.fromBlock),
}, input.rpcUrl);
console.log(JSON.stringify(await reader.readState(), (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
