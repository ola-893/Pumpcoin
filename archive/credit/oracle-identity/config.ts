import { existsSync } from "node:fs";
import { readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { getAddress, type Hex } from "viem";
import type { IdentityConfig, IdentityState } from "./core.js";

export function loadConfig(): IdentityConfig {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const required = (key: string) => { const v = process.env[key]; if (!v) throw new Error(`Set ${key} in your local .env.`); return v; };
  return {
    chainId: 10143,
    rpcUrl: process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz",
    attestationRegistry: getAddress(required("ATTESTATION_REGISTRY_ADDRESS")),
    identityRegistry: getAddress(process.env.ERC8004_IDENTITY_REGISTRY ?? "0x8004A818BFB912233c491871b3d84c89A494BD9e"),
    reputationRegistry: getAddress(process.env.ERC8004_REPUTATION_REGISTRY ?? "0x8004B663056A597Dffe9eCcC1965A193B7388713"),
    statusEndpoint: required("ORACLE_STATUS_ENDPOINT"),
    signer: process.env.ORACLE_IDENTITY_OWNER_PRIVATE_KEY ? { privateKey: process.env.ORACLE_IDENTITY_OWNER_PRIVATE_KEY } : undefined,
    newWalletPrivateKey: process.env.ORACLE_WALLET_PRIVATE_KEY as Hex | undefined,
    walletSignature: process.env.ORACLE_WALLET_SIGNATURE as Hex | undefined,
    walletSignatureDeadline: process.env.ORACLE_WALLET_SIGNATURE_DEADLINE ? Number(process.env.ORACLE_WALLET_SIGNATURE_DEADLINE) : undefined,
  };
}

export async function withState<T>(config: IdentityConfig, action: (state: IdentityState, save: (s: IdentityState) => Promise<void>) => Promise<T>) {
  const path = resolve(process.env.ORACLE_IDENTITY_STATE_FILE ?? "deployments/oracle-identity.json");
  await mkdir(dirname(path), { recursive: true });
  const lock = await open(`${path}.lock`, "wx").catch(() => { throw new Error("Another identity command is running, or a stale lock needs review."); });
  try {
    const state: IdentityState = existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {
      chainId: config.chainId, attestationRegistry: config.attestationRegistry, identityRegistry: config.identityRegistry,
      agentId: process.env.ORACLE_AGENT_ID || undefined,
    };
    const save = async (value: IdentityState) => {
      await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
      await rename(`${path}.tmp`, path);
    };
    return await action(state, save);
  } finally { await lock.close(); await unlink(`${path}.lock`); }
}
