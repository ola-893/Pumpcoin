import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("Envio config uses current compiled event signatures and keeps RPC secrets out of YAML", async () => {
  await mkdir(".local", { recursive: true });
  const fixture = await mkdtemp(resolve(".local/indexer-fixture-"));
  try {
    await mkdir(`${fixture}/indexer`);
    await symlink(resolve("contracts"), `${fixture}/contracts`, "dir");
    const result = spawnSync(process.execPath, ["--import", "tsx", resolve("indexer/write-config.ts")], {
      cwd: fixture, encoding: "utf8", env: { ...process.env,
        ATTESTATION_REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111",
        CREDIT_LINE_ADDRESS: "0x2222222222222222222222222222222222222222",
        REPAYMENT_VAULT_ADDRESS: "0x3333333333333333333333333333333333333333",
        ENVIO_START_BLOCK: "12345", MONAD_TESTNET_RPC_URL: "https://rpc.example/secret-fixture",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const config = await readFile(`${fixture}/indexer/config.yaml`, "utf8");
    assert.match(config, /name: RepaymentVault/);
    assert.match(config, /RepaidOnBehalf\(address indexed borrower, address indexed agentKey, uint256 amount\)/);
    assert.match(config, /AttestationSubmitted\(address indexed subject, uint8 sourceType, uint8 tier, uint64 expiresAt, bytes32 proofHash\)/);
    assert.match(config, /OracleRotated/);
    assert.match(config, /start_block: 12345/);
    assert.match(config, /\$\{MONAD_TESTNET_RPC_URL\}/);
    assert.doesNotMatch(config, /AgentVault|Executed|secret-fixture/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
