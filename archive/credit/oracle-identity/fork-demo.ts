import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { createPublicClient, createWalletClient, createTestClient, http, parseAbi, zeroAddress, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { synchronize, type IdentityConfig, type IdentityState } from "./core.js";

// All signing is confined to a disposable localhost fork with publicly known Anvil keys.
const server = createServer();
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
await new Promise<void>(resolve => server.close(() => resolve()));
const anvil = spawn("anvil", ["--silent", "--port", String(port), "--chain-id", "31337", "--fork-url", process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz"], { stdio: "ignore" });
try {
  const transport = http(`http://127.0.0.1:${port}`, { timeout: 30_000 });
  const client = createPublicClient({ transport, pollingInterval: 100, cacheTime: 0 });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { assert.equal(await client.getChainId(), 31337); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.ok(ready, "Local fork did not start");
  const root = mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex: 101 });
  const next = mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex: 102 });
  await createTestClient({ transport, mode: "anvil" }).setBalance({ address: root.address, value: 100n * 10n ** 18n });
  const wallet = createWalletClient({ account: root, transport });
  assert.equal(await client.getBytecode({ address: root.address }) ?? "0x", "0x", "Fork demo requires a clean EOA root");
  const artifact = JSON.parse(await readFile("contracts/out/AttestationRegistry.sol/AttestationRegistry.json", "utf8"));
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object as Hex, args: [root.address, root.address], chain: null });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  const config: IdentityConfig = {
    chainId: 31337, rpcUrl: `http://127.0.0.1:${port}`, attestationRegistry: receipt.contractAddress!,
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e", reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    statusEndpoint: "http://localhost/oracle", signer: { privateKey: `0x${Buffer.from(root.getHdKey().privateKey!).toString("hex")}` },
  };
  const state: IdentityState = { chainId: 31337, attestationRegistry: config.attestationRegistry, identityRegistry: config.identityRegistry };
  const saved: IdentityState[] = [];
  const save = async (value: IdentityState) => { saved.push(structuredClone(value)); };
  const first = await synchronize(config, state, save, true);
  assert.ok(first.synchronized); assert.equal(first.verifiedPaymentWallet.toLowerCase(), root.address.toLowerCase());
  const agentId = state.agentId;
  assert.ok(saved.some(s => s.pendingRegistration), "Mint transaction must be journaled");
  const recovered: IdentityState = structuredClone(saved.find(s => s.pendingRegistration)!);
  await synchronize(config, recovered, async () => {}, false);
  assert.equal(recovered.agentId, agentId);
  const rotate = async (address: typeof root.address) => {
    const hash = await wallet.writeContract({ address: config.attestationRegistry, abi: parseAbi(["function rotateOracle(address)"]), functionName: "rotateOracle", args: [address], chain: null });
    assert.equal((await client.waitForTransactionReceipt({ hash })).status, "success");
  };
  await rotate(next.address);
  const pending = await synchronize(config, state, save, true);
  assert.equal(pending.verifiedPaymentWallet, zeroAddress); assert.equal(pending.walletProofPending, true);
  config.newWalletPrivateKey = `0x${Buffer.from(next.getHdKey().privateKey!).toString("hex")}`;
  const rotated = await synchronize(config, state, save, true);
  assert.equal(rotated.verifiedPaymentWallet.toLowerCase(), next.address.toLowerCase()); assert.equal(state.agentId, agentId);
  await rotate(zeroAddress);
  const revoked = await synchronize(config, state, save, true);
  assert.equal(revoked.verifiedPaymentWallet, zeroAddress); assert.equal(state.agentId, agentId);
  assert.ok((await synchronize(config, state, save, false)).synchronized);
  await mkdir("deployments", { recursive: true });
  await writeFile("deployments/oracle-fork.json", JSON.stringify({ network: "Disposable localhost fork of Monad testnet; NOT a live registration", chainId: 31337, agentId, verified: ["register", "recover pending mint", "clear stale wallet when proof missing", "rotate same identity with wallet consent", "revoke and clear wallet", "idempotent reconciliation"], rpcRunningAfterScript: false }, null, 2) + "\n");
  console.log("PASS: ERC-8004 registration, recovery, rotation, consent, revocation and reconciliation on local fork.");
} finally { anvil.kill("SIGTERM"); }
