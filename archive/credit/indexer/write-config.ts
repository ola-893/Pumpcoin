import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { getAddress, type AbiEvent } from "viem";

if (existsSync(".env")) process.loadEnvFile(".env");
const start = process.env.ENVIO_START_BLOCK;
if (!start || !/^\d+$/.test(start) || !Number.isSafeInteger(Number(start))) throw new Error("Set ENVIO_START_BLOCK to the earliest deployment receipt block.");
const contracts = [
  ["AttestationRegistry", "ATTESTATION_REGISTRY_ADDRESS", ["AttestationSubmitted", "AttestationRevoked", "OracleRotated"]],
  ["CreditLine", "CREDIT_LINE_ADDRESS", ["Deposited", "Borrowed", "Repaid", "Withdrawn", "RepaidFor"]],
  ["RepaymentVault", "REPAYMENT_VAULT_ADDRESS", ["BudgetDeposited", "BudgetWithdrawn", "Delegated", "Revoked", "RepaidOnBehalf"]],
] as const;
let definitions = "";
let addresses = "";
for (const [name, envName, names] of contracts) {
  const address = getAddress(process.env[envName] ?? "");
  const artifact = JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`, "utf8"));
  definitions += `  - name: ${name}\n    events:\n`;
  for (const eventName of names) {
    const event = artifact.abi.find((a: AbiEvent) => a.type === "event" && a.name === eventName) as AbiEvent | undefined;
    if (!event) throw new Error(`${name}.${eventName} missing from compiled ABI`);
    const signature = `${event.name}(${event.inputs.map(i => `${i.type}${i.indexed ? " indexed" : ""} ${i.name}`).join(", ")})`;
    definitions += `      - event: ${JSON.stringify(signature)}\n`;
  }
  addresses += `      - name: ${name}\n        address: ${JSON.stringify(address)}\n`;
}
// Keep RPC credentials in the runtime environment, not generated YAML.
const output = `# Generated from compiled ABIs. Re-run after contract changes.\nname: proofline\ndescription: ProofLine testnet events\ncontracts:\n${definitions}chains:\n  - id: 10143\n    start_block: ${start}\n    rpc: \${MONAD_TESTNET_RPC_URL}\n    contracts:\n${addresses}`;
await writeFile("indexer/config.yaml", output);
console.log("Wrote indexer/config.yaml for Monad testnet. Run Envio codegen when connecting the indexer milestone.");
