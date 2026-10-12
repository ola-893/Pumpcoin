import { encodeAbiParameters, keccak256, type Hex } from "viem";

// Allocation rule for human-backed working-capital debt shared across direct
// human borrowing, multiple agent keys and external (human/third-party) repayment.
//
// Debt is a FIFO queue of borrow lots per current holder. Each lot records its
// original owner (a specific agent key or the human directly). Ordering comes
// from confirmed chain events sorted by (blockNumber, logIndex):
// - agentBorrow pushes a lot owned by that agent key.
// - humanBorrow pushes a lot owned by the human.
// - agentRepay consumes that agent's own oldest lots first; any excess covers
//   the oldest remaining lots overall (an agent may overpay onto shared debt).
// - externalRepay (human `repay` or third-party `repayFor` without a mandate
//   AgentRepaid in the same transaction) consumes the oldest lots overall.
// - migration moves the entire outstanding queue from previous to next holder,
//   preserving original owners and borrow order. The next holder starts empty
//   onchain, so no merge ordering ambiguity exists.
//
// Renewal never clears lots: replaying from a deployment-covering fromBlock
// keeps pre-renewal history, while the onchain gross `drawnWei` counter resets
// for the new cumulative cap. Restart replays the same ordered history, so the
// result is deterministic. `min(agentOutstanding, humanDebt)` alone is NOT used
// because it cannot tell whose lot an external repayment covered.

export type ReconcileEvent =
  | {
      block: bigint;
      logIndex: number;
      tx: string;
      kind: "agentBorrow";
      human: string;
      agentKey: string;
      amount: bigint;
    }
  | {
      block: bigint;
      logIndex: number;
      tx: string;
      kind: "agentRepay";
      human: string;
      agentKey: string;
      amount: bigint;
    }
  | {
      block: bigint;
      logIndex: number;
      tx: string;
      kind: "humanBorrow";
      human: string;
      amount: bigint;
    }
  | {
      block: bigint;
      logIndex: number;
      tx: string;
      kind: "externalRepay";
      human: string;
      amount: bigint;
    }
  | {
      block: bigint;
      logIndex: number;
      tx: string;
      kind: "migrated";
      previous: string;
      next: string;
      debt: bigint;
    };

type Lot = { owner: string; amount: bigint };

const lower = (a: string) => a.toLowerCase();
const HUMAN_OWNER = "__human__";

export function sortTimeline(events: ReconcileEvent[]): ReconcileEvent[] {
  return [...events].sort((a, b) => {
    if (a.block < b.block) return -1;
    if (a.block > b.block) return 1;
    return a.logIndex - b.logIndex;
  });
}

function consumeFifo(queue: Lot[], amount: bigint): bigint {
  let remaining = amount;
  for (const lot of queue) {
    if (remaining <= 0n) break;
    if (lot.amount <= 0n) continue;
    const take = lot.amount < remaining ? lot.amount : remaining;
    lot.amount -= take;
    remaining -= take;
  }
  return remaining;
}

export function reconcileTimeline(
  events: ReconcileEvent[],
  targetHuman: string,
  targetAgent: string,
): {
  agentOutstanding: bigint;
  holderDebt: bigint;
  migratedOut: boolean;
  migratedIn: boolean;
} {
  const queues = new Map<string, Lot[]>();
  const targetLower = lower(targetHuman);
  const agentLower = lower(targetAgent);
  let migratedOut = false;
  let migratedIn = false;
  const queueFor = (human: string): Lot[] => {
    const k = lower(human);
    let q = queues.get(k);
    if (!q) {
      q = [];
      queues.set(k, q);
    }
    return q;
  };
  for (const e of sortTimeline(events)) {
    if (e.kind === "agentBorrow") {
      queueFor(e.human).push({ owner: lower(e.agentKey), amount: e.amount });
    } else if (e.kind === "humanBorrow") {
      queueFor(e.human).push({ owner: HUMAN_OWNER, amount: e.amount });
    } else if (e.kind === "agentRepay") {
      const q = queueFor(e.human);
      let remaining = e.amount;
      // Own oldest lots first.
      for (const lot of q) {
        if (remaining <= 0n) break;
        if (lot.owner !== lower(e.agentKey) || lot.amount <= 0n) continue;
        const take = lot.amount < remaining ? lot.amount : remaining;
        lot.amount -= take;
        remaining -= take;
      }
      // Excess covers the oldest shared lots.
      if (remaining > 0n) remaining = consumeFifo(q, remaining);
      // Prune emptied lots to keep restart replays bounded.
      queues.set(
        lower(e.human),
        q.filter((l) => l.amount > 0n),
      );
    } else if (e.kind === "externalRepay") {
      const q = queueFor(e.human);
      consumeFifo(q, e.amount);
      queues.set(
        lower(e.human),
        q.filter((l) => l.amount > 0n),
      );
    } else {
      const from = queueFor(e.previous);
      const to = queueFor(e.next);
      // Next starts empty onchain; moved (older) lots go first.
      queues.set(lower(e.next), [...from, ...to]);
      queues.set(lower(e.previous), []);
      if (lower(e.previous) === targetLower) migratedOut = true;
      if (lower(e.next) === targetLower) migratedIn = true;
    }
  }
  const finalQueue = queues.get(targetLower) ?? [];
  let agentOutstanding = 0n;
  let holderDebt = 0n;
  for (const lot of finalQueue) {
    holderDebt += lot.amount;
    if (lot.owner === agentLower) agentOutstanding += lot.amount;
  }
  return { agentOutstanding, holderDebt, migratedOut, migratedIn };
}

// Raw decoded logs grouped by source. buildReconcileEvents matches the dual
// emissions of an agent flow (mandate AgentBorrowed/AgentRepaid plus line
// Borrowed/Repaid in the same transaction) into single economic events by
// matching pairs, and keeps every other log as its own ordered action.
// Line-only transactions are human-direct or third-party flows.
export type GroupedLogs = {
  mandateBorrows: Array<{
    tx: string;
    block: bigint;
    logIndex: number;
    agentKey: string;
    amount: bigint;
  }>;
  mandateRepays: Array<{
    tx: string;
    block: bigint;
    logIndex: number;
    agentKey: string;
    amount: bigint;
  }>;
  lineBorrowed: Array<{
    tx: string;
    block: bigint;
    logIndex: number;
    borrower: string;
    amount: bigint;
  }>;
  lineBorrowedFor: Array<{
    tx: string;
    block: bigint;
    logIndex: number;
    human: string;
    caller: string;
    amount: bigint;
  }>;
  lineRepaid: Array<{
    tx: string;
    block: bigint;
    logIndex: number;
    borrower: string;
    amount: bigint;
  }>;
  lineRepaidFor: Array<{
    tx: string;
    block: bigint;
    logIndex: number;
    payer: string;
    borrower: string;
    amount: bigint;
  }>;
  migrations: Array<{
    tx: string;
    block: bigint;
    logIndex: number;
    previous: string;
    next: string;
    debt: bigint;
  }>;
};

// Decode the exact emission order of the pinned CreditLine/mandate contracts.
// CreditLine emits Borrowed/Repaid immediately followed by its For event.
// The mandate emits its agent event after that pair (token transfers may emit
// intervening logs). No other financial action can interleave: both contracts
// are nonReentrant. We walk source logs in order, never search by amount.
// Invalid or incomplete groups make the entire reconstruction unsafe for writes.
export type UnmatchedMandateEvent = {
  tx: string;
  block: bigint;
  logIndex: number;
  kind: "agentBorrow" | "agentRepay";
  agentKey: string;
  amount: bigint;
};
export type ReconcileIssue = {
  tx: string;
  block: bigint;
  logIndex: number;
  reason: string;
};

type OrderedLog =
  | (GroupedLogs["lineBorrowed"][number] & { kind: "borrowed" })
  | (GroupedLogs["lineBorrowedFor"][number] & { kind: "borrowedFor" })
  | (GroupedLogs["lineRepaid"][number] & { kind: "repaid" })
  | (GroupedLogs["lineRepaidFor"][number] & { kind: "repaidFor" })
  | (GroupedLogs["mandateBorrows"][number] & { kind: "agentBorrow" })
  | (GroupedLogs["mandateRepays"][number] & { kind: "agentRepay" })
  | (GroupedLogs["migrations"][number] & { kind: "migrated" });

export function buildReconcileEvents(logs: GroupedLogs, mandate: string): {
  events: ReconcileEvent[];
  unmatched: UnmatchedMandateEvent[];
  issues: ReconcileIssue[];
} {
  const transactions = new Map<string, OrderedLog[]>();
  const ordered: OrderedLog[] = [
    ...logs.lineBorrowed.map(l => ({ ...l, kind: "borrowed" as const })),
    ...logs.lineBorrowedFor.map(l => ({ ...l, kind: "borrowedFor" as const })),
    ...logs.lineRepaid.map(l => ({ ...l, kind: "repaid" as const })),
    ...logs.lineRepaidFor.map(l => ({ ...l, kind: "repaidFor" as const })),
    ...logs.mandateBorrows.map(l => ({ ...l, kind: "agentBorrow" as const })),
    ...logs.mandateRepays.map(l => ({ ...l, kind: "agentRepay" as const })),
    ...logs.migrations.map(l => ({ ...l, kind: "migrated" as const })),
  ];
  for (const l of ordered) {
    const tx = lower(l.tx);
    const bucket = transactions.get(tx) ?? [];
    bucket.push({ ...l, tx });
    transactions.set(tx, bucket);
  }
  const events: ReconcileEvent[] = [];
  const unmatched: UnmatchedMandateEvent[] = [];
  const issues: ReconcileIssue[] = [];
  const issue = (l: OrderedLog, reason: string) => {
    issues.push({ tx: l.tx, block: l.block, logIndex: l.logIndex, reason });
  };
  for (const bucket of transactions.values()) {
    bucket.sort((a, b) => a.logIndex - b.logIndex);
    if (bucket.some((l, i) => l.block !== bucket[0].block ||
        !Number.isSafeInteger(l.logIndex) || l.logIndex < 0 ||
        (i > 0 && l.logIndex === bucket[i - 1].logIndex))) {
      issue(bucket[0], "Duplicate log position or inconsistent transaction block");
      continue;
    }
    for (let i = 0; i < bucket.length; i++) {
      const l = bucket[i];
      if (l.kind === "agentBorrow" || l.kind === "agentRepay") {
        unmatched.push(l);
        continue;
      }
      if (l.kind === "migrated") {
        events.push(l);
        continue;
      }
      if (l.kind === "borrowedFor" || l.kind === "repaidFor") {
        issue(l, "Companion event is missing its immediately preceding line event");
        continue;
      }
      const next = bucket[i + 1];
      const companion = (l.kind === "borrowed" && next?.kind === "borrowedFor") ||
        (l.kind === "repaid" && next?.kind === "repaidFor") ? next : undefined;
      if (!companion || (companion.kind !== "borrowedFor" && companion.kind !== "repaidFor")) {
        events.push({ tx: l.tx, block: l.block, logIndex: l.logIndex,
          kind: l.kind === "borrowed" ? "humanBorrow" : "externalRepay",
          human: l.borrower, amount: l.amount });
        continue;
      }
      // Consecutive *actual* log positions bind the two CreditLine emissions;
      // matching the nearest equal amount could steal a different batch action.
      const human = companion.kind === "borrowedFor" ? companion.human : companion.borrower;
      if (companion.logIndex !== l.logIndex + 1 || companion.amount !== l.amount ||
          lower(human) !== lower(l.borrower)) {
        issue(companion, "Line/companion order, borrower or amount mismatch");
        i++;
        continue;
      }
      const actor = companion.kind === "borrowedFor" ? companion.caller : companion.payer;
      if (lower(actor) !== lower(mandate)) {
        if (l.kind === "borrowed") issue(companion, "BorrowedFor caller is not the pinned mandate");
        else events.push({ tx: l.tx, block: l.block, logIndex: l.logIndex,
          kind: "externalRepay", human, amount: l.amount });
        i++;
        continue;
      }
      const agent = bucket[i + 2];
      const expectedKind = l.kind === "borrowed" ? "agentBorrow" : "agentRepay";
      if (!agent || (agent.kind !== "agentBorrow" && agent.kind !== "agentRepay") ||
          agent.kind !== expectedKind || agent.amount !== l.amount) {
        issue(companion, "Mandate line action is missing its next matching agent event");
        i++;
        continue;
      }
      events.push({ tx: agent.tx, block: agent.block, logIndex: agent.logIndex,
        kind: agent.kind, human, agentKey: agent.agentKey, amount: agent.amount });
      i += 2;
    }
  }
  return { events: sortTimeline(events), unmatched, issues };
}

// EIP-191 enrollment inner hash bound to chain/contract/human/key/nonce/expiry.
// The agent signs these raw bytes via `signMessage({ message: { raw } })`; the
// contract recomputes the same inner hash and verifies the eth-signed digest.
export function enrollmentInnerHash(input: {
  chainId: bigint;
  mandate: string;
  human: string;
  agentKey: string;
  nonce: bigint;
  enrollmentExpiry: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint64" },
      ],
      [
        input.chainId,
        input.mandate as `0x${string}`,
        input.human as `0x${string}`,
        input.agentKey as `0x${string}`,
        input.nonce,
        input.enrollmentExpiry,
      ],
    ),
  );
}
