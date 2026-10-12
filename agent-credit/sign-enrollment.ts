import { readFileSync } from "node:fs";
import { createPublicClient, defineChain, getAddress, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mandateAbi } from "./abi.js";
import { enrollmentInnerHash } from "./reconcile.js";

// Offchain enrollment signer for the independent agent key. The agent
// authorizes a human/contract/chain/nonce/expiry binding without spending gas;
// the human submits the signature in `grantMandate`.
//
// Usage:
//   AGENT_PRIVATE_KEY=0x... node --import tsx agent-credit/sign-enrollment.ts \
//     <mandate> <human> [<nonce>] <enrollmentExpiryUnixSeconds>
//
// With three arguments the nonce is omitted and retrieved from the mandate's
// onchain enrollmentNonce for the agent key; with four arguments the nonce is
// explicit. Expiry is always last. Config RPC/chain via AGENT_CONFIG_FILE
// (same shape as worker config) or RPC_URL/CHAIN_ID env.

const args = process.argv.slice(2);
if (args.length !== 3 && args.length !== 4) {
  console.error(
    "Usage: sign-enrollment.ts <mandate> <human> [<nonce>] <enrollmentExpiryUnix>",
  );
  process.exit(1);
}
const [mandateRaw, humanRaw, ...tail] = args;
let nonceRaw: string | undefined;
let expiryRaw: string;
if (tail.length === 1) {
  [expiryRaw] = tail;
} else {
  [nonceRaw, expiryRaw] = tail;
}
if (!/^0x[0-9a-fA-F]{40}$/.test(mandateRaw) || !/^0x[0-9a-fA-F]{40}$/.test(humanRaw)) {
  console.error("Mandate and human must be 0x addresses");
  process.exit(1);
}
if (!/^\d+$/.test(expiryRaw) || BigInt(expiryRaw) <= 0n) {
  console.error("Expiry must be a positive integer Unix timestamp");
  process.exit(1);
}
if (nonceRaw !== undefined && !/^\d+$/.test(nonceRaw)) {
  console.error("Nonce must be a non-negative integer");
  process.exit(1);
}
const key = process.env.AGENT_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Set AGENT_PRIVATE_KEY");
const account = privateKeyToAccount(key as Hex);
let rpc = process.env.RPC_URL ?? "";
let chainId = Number(process.env.CHAIN_ID ?? "");
try {
  const cfgPath = process.env.AGENT_CONFIG_FILE;
  if (cfgPath) {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as {
      rpcUrl?: string;
      chainId?: number;
    };
    rpc = rpc || String(cfg.rpcUrl ?? "");
    chainId = Number.isFinite(chainId) && chainId > 0 ? chainId : Number(cfg.chainId ?? "");
  }
} catch {
  // Fall through to explicit env.
}
if (!rpc || ![10143, 31337].includes(chainId)) throw new Error("Configure RPC_URL/CHAIN_ID or AGENT_CONFIG_FILE");
const chain = defineChain({
  id: chainId,
  name: "enrollment-signer",
  nativeCurrency: { name: "Test gas", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain, transport: http(rpc) });
const mandate = getAddress(mandateRaw);
const human = getAddress(humanRaw);
const enrollmentExpiry = BigInt(expiryRaw);
const nonce = nonceRaw
  ? BigInt(nonceRaw)
  : ((await client.readContract({
      address: mandate,
      abi: mandateAbi,
      functionName: "enrollmentNonce",
      args: [account.address],
    })) as bigint);
const inner = enrollmentInnerHash({
  chainId: BigInt(chainId),
  mandate,
  human,
  agentKey: account.address,
  nonce,
  enrollmentExpiry,
});
const signature = await account.signMessage({ message: { raw: inner as Hex } });
console.log(
  JSON.stringify(
    {
      agentKey: account.address,
      human,
      mandate,
      chainId,
      nonce: nonce.toString(),
      enrollmentExpiry: enrollmentExpiry.toString(),
      innerHash: inner,
      signature,
    },
    null,
    2,
  ),
);
