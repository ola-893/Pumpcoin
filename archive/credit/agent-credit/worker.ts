import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  isAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { lineAbi, mandateAbi, registryAbi, tokenAbi } from "./abi.js";
import { collectHistory } from "./history.js";
import { decide, type Rule } from "./rules.js";
import {
  buildReconcileEvents,
  reconcileTimeline,
} from "./reconcile.js";

export type WorkerConfig = {
  chainId: 10143 | 31337;
  rpcUrl: string;
  human: Address;
  creditLine: Address;
  loanToken: Address;
  mandate: Address;
  fromBlock: bigint;
  pollMs: number;
  rule: Rule;
};
export function parseConfig(input: unknown): WorkerConfig {
  const x = input as Record<string, unknown>;
  if (!x || ![10143, 31337].includes(Number(x.chainId)))
    throw new Error("Only local/Monad testnet chains supported");
  const rpc = new URL(String(x.rpcUrl));
  if (
    (Number(x.chainId) === 31337 &&
      !["127.0.0.1", "localhost"].includes(rpc.hostname)) ||
    !["https:", "http:"].includes(rpc.protocol) ||
    (rpc.protocol === "http:" &&
      !["127.0.0.1", "localhost"].includes(rpc.hostname))
  )
    throw new Error("Use HTTPS or a loopback RPC");
  const addresses = ["human", "creditLine", "loanToken", "mandate"] as const;
  for (const k of addresses)
    if (!isAddress(String(x[k])) || /^0x0{40}$/i.test(String(x[k])))
      throw new Error(`Invalid ${k}`);
  const integer = (value: unknown) => {
    if (!/^\d+$/.test(String(value)))
      throw new Error("Use unsigned integer token units/seconds/blocks");
    return BigInt(String(value));
  };
  const r = x.rule as Record<string, unknown>;
  if (!r) throw new Error("Missing rule");
  const rule = {
    lowBalance: integer(r.lowBalance),
    drawAmount: integer(r.drawAmount),
    repayAfterSeconds: integer(r.repayAfterSeconds),
  };
  if (
    rule.lowBalance === 0n ||
    rule.drawAmount === 0n ||
    rule.repayAfterSeconds === 0n
  )
    throw new Error("Invalid rule");
  const pollMs = Number(x.pollMs ?? 5000);
  if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60000)
    throw new Error("Invalid poll interval");
  return {
    chainId: Number(x.chainId) as 10143 | 31337,
    rpcUrl: rpc.href,
    human: getAddress(String(x.human)),
    creditLine: getAddress(String(x.creditLine)),
    loanToken: getAddress(String(x.loanToken)),
    mandate: getAddress(String(x.mandate)),
    fromBlock: integer(x.fromBlock),
    pollMs,
    rule,
  };
}

export async function runWorker(
  config: WorkerConfig,
  privateKey: Hex,
  options: { once?: boolean; probeAmount?: bigint } = {},
) {
  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() === config.human.toLowerCase())
    throw new Error("Agent key must differ from human");
  const chain = defineChain({
    id: config.chainId,
    name:
      config.chainId === 31337 ? "SYNTHETIC local agent demo" : "Monad Testnet",
    nativeCurrency: { name: "Test gas", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const client = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });
  const log = (data: Record<string, unknown>) =>
    console.log(
      JSON.stringify(
        { chainId: config.chainId, agent: account.address, ...data },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
      ),
    );
  const read = async <T>(
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
    blockNumber?: bigint,
  ) => client.readContract({ address, abi, functionName, args, blockNumber }) as Promise<T>;
  if ((await client.getChainId()) !== config.chainId)
    throw new Error("RPC chain mismatch");
  const [line, token, pinned, lineToken, registry] = await Promise.all([
    read<Address>(config.mandate, mandateAbi, "creditLine"),
    read<Address>(config.mandate, mandateAbi, "loanToken"),
    read<Address>(config.creditLine, lineAbi, "agentCreditMandate"),
    read<Address>(config.creditLine, lineAbi, "loanToken"),
    read<Address>(config.creditLine, lineAbi, "registry"),
  ]);
  const eq = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();
  if (
    !eq(line, config.creditLine) ||
    !eq(token, config.loanToken) ||
    !eq(pinned, config.mandate) ||
    !eq(lineToken, token)
  )
    throw new Error("Mandate/credit-line/token wiring mismatch");
  if (
    !(await read<boolean>(registry, registryAbi, "evidenceMode")) ||
    !eq(
      await read<Address>(registry, registryAbi, "positionController"),
      config.creditLine,
    )
  )
    throw new Error(
      "This worker requires the correctly pinned evidence-mode stack",
    );
  const decimals = await read<number>(token, tokenAbi, "decimals");
  if (decimals !== 6)
    throw new Error("Working-capital demo requires six-decimal test tokens");
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const send = async (
    functionName: "agentBorrow" | "agentRepay",
    amount: bigint,
    diagnostic = false,
  ) => {
    const hash = await wallet.writeContract({
      address: config.mandate,
      abi: mandateAbi,
      functionName,
      args: [amount],
      gas: diagnostic ? 400_000n : undefined,
    });
    log({ event: "submitted", action: functionName, amount, hash, diagnostic });
    const receipt = await client.waitForTransactionReceipt({ hash });
    const tx = await client.getTransaction({ hash: receipt.transactionHash });
    if (!eq(tx.from, account.address) || !tx.to || !eq(tx.to, config.mandate))
      throw new Error("Unexpected transaction provenance");
    log({
      event: receipt.status === "success" ? "confirmed" : "reverted",
      action: functionName,
      amount,
      hash: receipt.transactionHash,
      signer: tx.from,
      human: config.human,
      block: receipt.blockNumber,
      diagnostic,
    });
    if (receipt.status !== "success" && !diagnostic)
      throw new Error("Agent transaction reverted");
    return receipt.status;
  };
  try {
    log({
      event: "started",
      mode:
        config.chainId === 31337
          ? "SYNTHETIC_LOCAL_NOT_RECLAIM_OR_CRE"
          : "TESTNET",
      human: config.human,
      rule: config.rule,
    });
    do {
      const block = await client.getBlock({
        blockNumber: await client.getBlockNumber({ cacheTime: 0 }),
      });
      const readAt = <T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) =>
        read<T>(address, abi, functionName, args, block.number);
      const owner = await readAt<Address>(
        config.mandate,
        mandateAbi,
        "mandateOwner",
        [account.address],
      );
      if (!eq(owner, config.human))
        throw new Error("Agent key is not bound to configured human");
      if (options.probeAmount !== undefined) {
        const status = await send("agentBorrow", options.probeAmount, true);
        if (status !== "reverted")
          throw new Error("Expected diagnostic draw to revert");
        break;
      }
      const [grant, balance, humanDebt, available] = await Promise.all([
        readAt<readonly [bigint, bigint, bigint, boolean]>(
          config.mandate,
          mandateAbi,
          "mandates",
          [account.address],
        ),
        readAt<bigint>(token, tokenAbi, "balanceOf", [account.address]),
        readAt<bigint>(config.creditLine, lineAbi, "borrowedOf", [config.human]),
        readAt<bigint>(config.creditLine, lineAbi, "availableToBorrow", [
          config.human,
        ]),
      ]);
      // Reconstruct principal from ordered confirmed chain events on every
      // run/restart. The contract counter is gross draws, not principal owed.
      // Renewal must not lose pre-renewal borrow/repay history, so fromBlock
      // must cover the mandate deployment plus every human/agent/migration
      // event. Allocation is FIFO across human-direct, multi-agent and
      // external-repayment lots (see reconcile.ts); min(outstanding, debt)
      // alone cannot attribute external repayments.
      const { grouped, lastDrawAt } = await collectHistory(
        client, config.creditLine, config.mandate, account.address,
        config.fromBlock, block.number,
      );
      const built = buildReconcileEvents(grouped, config.mandate);
      if (built.unmatched.length > 0) {
        // Partial attribution is never an input to a financial decision.
        log({
          event: "unmatched-mandate-events",
          count: built.unmatched.length,
          sample: built.unmatched.slice(0, 5),
        });
      }
      const reconciled = reconcileTimeline(
        built.events,
        config.human,
        account.address,
      );
      const agentOutstanding = reconciled.agentOutstanding;
      const [cap, drawn, expiresAt, revoked] = grant;
      const snapshotStillCanonical = (await client.getBlock({ blockNumber: block.number })).hash === block.hash;
      const historyUnsafe = built.unmatched.length > 0 || built.issues.length > 0 ||
        reconciled.holderDebt !== humanDebt || !snapshotStillCanonical;
      if (historyUnsafe) log({
        event: "reconciliation-blocked", block: block.number,
        unmatched: built.unmatched.length, issues: built.issues.slice(0, 5),
        holderDebt: reconciled.holderDebt, humanDebt, snapshotStillCanonical,
      });
      const decision = historyUnsafe
        ? ({ action: "wait", reason: "Incomplete or inconsistent confirmed history; retry before any financial action" } as const)
        : reconciled.migratedOut
        ? ({
            action: "wait",
            reason: "Human migrated; settle and use a fresh key at the new wallet",
          } as const)
        : decide(
            {
              balance,
              humanDebt,
              available,
              cap,
              drawn,
              expiresAt,
              revoked,
              agentOutstanding,
              lastDrawAt,
              now: block.timestamp,
            },
            config.rule,
          );
      log({
        event: "decision",
        balance,
        humanDebt,
        cap,
        drawn,
        agentOutstanding,
        holderDebt: reconciled.holderDebt,
        migratedOut: reconciled.migratedOut,
        migratedIn: reconciled.migratedIn,
        ...decision,
      });
      if (decision.action === "borrow")
        await send("agentBorrow", decision.amount);
      else if (decision.action === "repay") {
        const allowance = await read<bigint>(token, tokenAbi, "allowance", [
          account.address,
          config.mandate,
        ]);
        if (allowance < decision.amount) {
          const hash = await wallet.writeContract({
            address: token,
            abi: tokenAbi,
            functionName: "approve",
            args: [config.mandate, decision.amount],
          });
          const receipt = await client.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success")
            throw new Error("Agent token approval reverted");
          log({
            event: "approval-confirmed",
            hash: receipt.transactionHash,
            spender: config.mandate,
            amount: decision.amount,
          });
        }
        await send("agentRepay", decision.amount);
      }
      if (!options.once && !stopped) await delay(config.pollMs);
    } while (!options.once && !stopped);
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const path = process.env.AGENT_CONFIG_FILE;
    const key = process.env.AGENT_PRIVATE_KEY;
    if (!path || !key || !/^0x[0-9a-fA-F]{64}$/.test(key))
      throw new Error(
        "Configure AGENT_CONFIG_FILE and a dedicated AGENT_PRIVATE_KEY locally",
      );
    const probe = process.env.AGENT_REVERT_PROBE_WEI;
    if (probe && !/^[1-9]\d*$/.test(probe))
      throw new Error("Invalid explicit revert probe amount");
    await runWorker(
      parseConfig(JSON.parse(readFileSync(path, "utf8"))),
      key as Hex,
      {
        once: process.argv.includes("--once"),
        probeAmount: probe ? BigInt(probe) : undefined,
      },
    );
  } catch {
    console.error(
      "Agent stopped: invalid configuration, RPC/read failure or unconfirmed transaction. No private values logged.",
    );
    process.exitCode = 1;
  }
}
