import type { Address, PublicClient } from "viem";
import { lineAbi, mandateAbi } from "./abi.js";
import type { GroupedLogs } from "./reconcile.js";

/** Replay every economic event, including other agents and direct human actions.
 * RPC completeness and a deployment-covering start block remain trust assumptions.
 */
export async function collectHistory(client: PublicClient, creditLine: Address,
  mandate: Address, agent: Address, fromBlockStart: bigint, toBlockEnd: bigint) {
  if (fromBlockStart < 0n || fromBlockStart > toBlockEnd)
    throw new Error("History start must precede the observed block");
  let lastDrawAt = 0n;
  const grouped: GroupedLogs = {
    mandateBorrows: [],
    mandateRepays: [],
    lineBorrowed: [],
    lineBorrowedFor: [],
    lineRepaid: [],
    lineRepaidFor: [],
    migrations: [],
  };
  for (
    let fromBlock = fromBlockStart;
    fromBlock <= toBlockEnd;
    fromBlock += 1000n
  ) {
    const toBlock =
      fromBlock + 999n < toBlockEnd ? fromBlock + 999n : toBlockEnd;
    const [mandateLogs, borrowedLogs, borrowedForLogs, repaidLogs, repaidForLogs, migratedLogs] =
      await Promise.all([
        client.getContractEvents({
          address: mandate,
          abi: mandateAbi,
          fromBlock,
          toBlock,
          strict: true,
        }),
        client.getContractEvents({
          address: creditLine,
          abi: lineAbi,
          eventName: "Borrowed",
          fromBlock,
          toBlock,
          strict: true,
        }),
        client.getContractEvents({
          address: creditLine,
          abi: lineAbi,
          eventName: "BorrowedFor",
          fromBlock,
          toBlock,
          strict: true,
        }),
        client.getContractEvents({
          address: creditLine,
          abi: lineAbi,
          eventName: "Repaid",
          fromBlock,
          toBlock,
          strict: true,
        }),
        client.getContractEvents({
          address: creditLine,
          abi: lineAbi,
          eventName: "RepaidFor",
          fromBlock,
          toBlock,
          strict: true,
        }),
        client.getContractEvents({
          address: creditLine,
          abi: lineAbi,
          eventName: "PositionMigrated",
          fromBlock,
          toBlock,
          strict: true,
        }),
      ]);
    for (const event of mandateLogs) {
      if (event.eventName === "AgentBorrowed") {
        grouped.mandateBorrows.push({
          tx: event.transactionHash!,
          block: event.blockNumber,
          logIndex: event.logIndex,
          agentKey: event.args.agentKey,
          amount: event.args.amount,
        });
        if (
          event.args.agentKey.toLowerCase() ===
          agent.toLowerCase()
        ) {
          lastDrawAt = (
            await client.getBlock({ blockNumber: event.blockNumber })
          ).timestamp;
        }
      } else if (event.eventName === "AgentRepaid") {
        grouped.mandateRepays.push({
          tx: event.transactionHash!,
          block: event.blockNumber,
          logIndex: event.logIndex,
          agentKey: event.args.agentKey,
          amount: event.args.amount,
        });
      }
    }
    for (const event of borrowedLogs) {
      grouped.lineBorrowed.push({
        tx: event.transactionHash!,
        block: event.blockNumber,
        logIndex: event.logIndex,
        borrower: (event.args as { borrower: string }).borrower,
        amount: (event.args as { amount: bigint }).amount,
      });
    }
    for (const event of borrowedForLogs) {
      grouped.lineBorrowedFor.push({
        tx: event.transactionHash!,
        block: event.blockNumber,
        logIndex: event.logIndex,
        human: (event.args as { human: string }).human,
        caller: (event.args as { caller: string }).caller,
        amount: (event.args as { amount: bigint }).amount,
      });
    }
    for (const event of repaidLogs) {
      grouped.lineRepaid.push({
        tx: event.transactionHash!,
        block: event.blockNumber,
        logIndex: event.logIndex,
        borrower: (event.args as { borrower: string }).borrower,
        amount: (event.args as { amount: bigint }).amount,
      });
    }
    for (const event of repaidForLogs) {
      grouped.lineRepaidFor.push({
        tx: event.transactionHash!,
        block: event.blockNumber,
        logIndex: event.logIndex,
        borrower: (event.args as { borrower: string }).borrower,
        payer: (event.args as { payer: string }).payer,
        amount: (event.args as { amount: bigint }).amount,
      });
    }
    for (const event of migratedLogs) {
      grouped.migrations.push({
        tx: event.transactionHash!,
        block: event.blockNumber,
        logIndex: event.logIndex,
        previous: (event.args as { previous: string }).previous,
        next: (event.args as { next: string }).next,
        debt: (event.args as { debt: bigint }).debt,
      });
    }
  }
  return { grouped, lastDrawAt };
}
