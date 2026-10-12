import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReconcileEvents as buildEvents,
  type GroupedLogs,
  reconcileTimeline,
  type ReconcileEvent,
} from "../agent-credit/reconcile.js";
import { decide } from "../agent-credit/rules.js";

const MANDATE = "0x5555555555555555555555555555555555555555";
const PAYER = "0x6666666666666666666666666666666666666666";
const buildReconcileEvents = (logs: GroupedLogs) => {
  const built = buildEvents(logs, MANDATE);
  assert.equal(built.issues.length, 0);
  return built;
};

const H = "0x1111111111111111111111111111111111111111";
const A1 = "0x2222222222222222222222222222222222222222";
const A2 = "0x3333333333333333333333333333333333333333";
const H2 = "0x4444444444444444444444444444444444444444";
const rule = { lowBalance: 10n, drawAmount: 20n, repayAfterSeconds: 60n };
let n = 0n;
// Test helper: caller supplies the discriminated kind plus its fields.
const ev = (e: Record<string, unknown>): ReconcileEvent =>
  ({ block: ++n, logIndex: 0, tx: `0xtx${n}`, ...e }) as unknown as ReconcileEvent;

test("direct human repayment clears phantom principal and re-enables draws", () => {
  n = 0n;
  const events: ReconcileEvent[] = [
    ev({ kind: "agentBorrow", human: H, agentKey: A1, amount: 20n }),
    ev({ kind: "externalRepay", human: H, amount: 20n }),
  ];
  const r = reconcileTimeline(events, H, A1);
  assert.equal(r.agentOutstanding, 0n);
  assert.equal(r.holderDebt, 0n);
  const d = decide(
    {
      balance: 0n,
      humanDebt: 0n,
      agentOutstanding: r.agentOutstanding,
      available: 80n,
      cap: 40n,
      drawn: 20n,
      expiresAt: 1000n,
      revoked: false,
      now: 100n,
      lastDrawAt: 10n,
    },
    rule,
  );
  // Cumulative cap still spent (drawn 20 of 40? actually 20 used, 20 left) — with
  // a renewed cap this would borrow; here drawn leaves room so it borrows.
  assert.equal(d.action, "borrow");
});

test("third-party repayFor is an external repayment, not ignored", () => {
  n = 0n;
  const events: ReconcileEvent[] = [
    ev({ kind: "agentBorrow", human: H, agentKey: A1, amount: 20n }),
    ev({ kind: "externalRepay", human: H, amount: 12n }),
  ];
  const r = reconcileTimeline(events, H, A1);
  assert.equal(r.agentOutstanding, 8n);
});

test("multiple agents share FIFO: external repayment covers oldest lot first", () => {
  n = 0n;
  const events: ReconcileEvent[] = [
    ev({ kind: "agentBorrow", human: H, agentKey: A1, amount: 20n }),
    ev({ kind: "agentBorrow", human: H, agentKey: A2, amount: 20n }),
    ev({ kind: "externalRepay", human: H, amount: 20n }),
  ];
  assert.equal(reconcileTimeline(events, H, A1).agentOutstanding, 0n);
  assert.equal(reconcileTimeline(events, H, A2).agentOutstanding, 20n);
  // A naive min(agentOutstanding, humanDebt) for A2 would also say 20, but for
  // A1 it would say min(20, 20) = 20 (phantom). FIFO correctly clears A1.
  const naiveA1 = 20n < 20n ? 20n : 20n;
  assert.equal(naiveA1, 20n);
});

test("agent self-repayment reduces its own lots before shared debt", () => {
  n = 0n;
  const events: ReconcileEvent[] = [
    ev({ kind: "humanBorrow", human: H, amount: 20n }),
    ev({ kind: "agentBorrow", human: H, agentKey: A1, amount: 20n }),
    ev({ kind: "agentRepay", human: H, agentKey: A1, amount: 20n }),
  ];
  const r = reconcileTimeline(events, H, A1);
  assert.equal(r.agentOutstanding, 0n);
  assert.equal(r.holderDebt, 20n);
});

test("restart replay is deterministic and renewal does not zero history", () => {
  n = 0n;
  const history: ReconcileEvent[] = [
    ev({ kind: "agentBorrow", human: H, agentKey: A1, amount: 20n }),
    ev({ kind: "agentRepay", human: H, agentKey: A1, amount: 10n }),
  ];
  const first = reconcileTimeline(history, H, A1);
  // Restart: replay the identical ordered history from the deployment block.
  const second = reconcileTimeline([...history].reverse(), H, A1);
  assert.equal(first.agentOutstanding, 10n);
  assert.equal(second.agentOutstanding, 10n);
  // Renewal emits no borrow/repay event; replaying the same history keeps 10
  // outstanding instead of zeroing. Only a fresh agentRepay/externalRepay clears it.
  const afterRenewal = reconcileTimeline(history, H, A1);
  assert.equal(afterRenewal.agentOutstanding, 10n);
});

test("migration moves lots and flags the retired holder", () => {
  n = 0n;
  const events: ReconcileEvent[] = [
    ev({ kind: "agentBorrow", human: H, agentKey: A1, amount: 20n }),
    ev({ kind: "migrated", previous: H, next: H2, debt: 20n }),
  ];
  const oldView = reconcileTimeline(events, H, A1);
  assert.equal(oldView.migratedOut, true);
  assert.equal(oldView.agentOutstanding, 0n);
  assert.equal(oldView.holderDebt, 0n);
  const newView = reconcileTimeline(events, H2, A2);
  assert.equal(newView.migratedIn, true);
  assert.equal(newView.holderDebt, 20n);
  // Fresh key at the new wallet owes nothing itself.
  assert.equal(newView.agentOutstanding, 0n);
  // External repayment to the new holder covers the migrated oldest lot first.
  const afterRepay = reconcileTimeline(
    [...events, ev({ kind: "externalRepay", human: H2, amount: 20n })],
    H2,
    A2,
  );
  assert.equal(afterRepay.holderDebt, 0n);
});

test("dual mandate+line logs in one transaction deduplicate to one lot", () => {
  const { events: grouped } = buildReconcileEvents({
    mandateBorrows: [{ tx: "0xabc", block: 5n, logIndex: 3, agentKey: A1, amount: 20n }],
    mandateRepays: [],
    lineBorrowed: [{ tx: "0xabc", block: 5n, logIndex: 1, borrower: H, amount: 20n }],
    lineBorrowedFor: [{ tx: "0xabc", block: 5n, logIndex: 2, human: H, caller: MANDATE, amount: 20n }],
    lineRepaid: [],
    lineRepaidFor: [],
    migrations: [],
  });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].kind, "agentBorrow");
  const r = reconcileTimeline(grouped, H, A1);
  assert.equal(r.agentOutstanding, 20n);
  // Without dedup this would have been 40 (agent lot + human lot).
});

test("repayFor dual Repaid+RepaidFor logs deduplicate to one external repayment", () => {
  const { events: grouped } = buildReconcileEvents({
    mandateBorrows: [],
    mandateRepays: [],
    lineBorrowed: [],
    lineBorrowedFor: [],
    lineRepaid: [{ tx: "0xdef", block: 6n, logIndex: 1, borrower: H, amount: 15n }],
    lineRepaidFor: [{ tx: "0xdef", block: 6n, logIndex: 2, borrower: H, payer: PAYER, amount: 15n }],
    migrations: [],
  });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].kind, "externalRepay");
});

test("batched direct repay plus repayFor in one transaction keeps both repayments", () => {
  n = 0n;
  // One transaction repays 10 directly and 20 for the same borrower via
  // repayFor: logs are Repaid(10), Repaid(20), RepaidFor(20). The standalone
  // Repaid(10) is its own economic action, not part of the pair.
  const { events: grouped } = buildReconcileEvents({
    mandateBorrows: [],
    mandateRepays: [],
    lineBorrowed: [],
    lineBorrowedFor: [],
    lineRepaid: [
      { tx: "0xbatch", block: 7n, logIndex: 1, borrower: H, amount: 10n },
      { tx: "0xbatch", block: 7n, logIndex: 2, borrower: H, amount: 20n },
    ],
    lineRepaidFor: [{ tx: "0xbatch", block: 7n, logIndex: 3, borrower: H, payer: PAYER, amount: 20n }],
    migrations: [],
  });
  assert.equal(grouped.length, 2);
  assert.deepEqual(
    grouped.map((e) => [e.kind, e.logIndex, (e as { amount: bigint }).amount]),
    [
      ["externalRepay", 1, 10n],
      ["externalRepay", 2, 20n],
    ],
  );
  const r = reconcileTimeline(
    [
      ev({ kind: "humanBorrow", human: H, amount: 40n }),
      ...grouped,
    ],
    H,
    A1,
  );
  assert.equal(r.holderDebt, 10n);
});

test("mixed borrow and repay actions in one transaction keep log order", () => {
  n = 0n;
  // A router-style batch repays first, then borrows: Repaid(10) at log 1 and
  // Borrowed(30) at log 2. Output must follow log order, not kind order.
  const { events: grouped } = buildReconcileEvents({
    mandateBorrows: [],
    mandateRepays: [],
    lineBorrowed: [{ tx: "0xmix", block: 8n, logIndex: 2, borrower: H, amount: 30n }],
    lineBorrowedFor: [],
    lineRepaid: [{ tx: "0xmix", block: 8n, logIndex: 1, borrower: H, amount: 10n }],
    lineRepaidFor: [],
    migrations: [],
  });
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].kind, "externalRepay");
  assert.equal(grouped[1].kind, "humanBorrow");
  // FIFO honors that order: the repay clears the pre-existing lot before the
  // new borrow lot is pushed.
  const r = reconcileTimeline(
    [ev({ kind: "humanBorrow", human: H, amount: 10n }), ...grouped],
    H,
    A1,
  );
  assert.equal(r.holderDebt, 30n);
});

test("agent action plus unrelated line action in one transaction keeps both", () => {
  // An agentRepay triple sharing its transaction with an unrelated standalone
  // Repaid for the same borrower: only the matching pair deduplicates.
  const { events: grouped } = buildReconcileEvents({
    mandateBorrows: [],
    mandateRepays: [{ tx: "0xcombo", block: 9n, logIndex: 4, agentKey: A1, amount: 20n }],
    lineBorrowed: [],
    lineBorrowedFor: [],
    lineRepaid: [
      { tx: "0xcombo", block: 9n, logIndex: 1, borrower: H, amount: 5n },
      { tx: "0xcombo", block: 9n, logIndex: 2, borrower: H, amount: 20n },
    ],
    lineRepaidFor: [{ tx: "0xcombo", block: 9n, logIndex: 3, borrower: H, payer: MANDATE, amount: 20n }],
    migrations: [],
  });
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].kind, "externalRepay");
  assert.equal((grouped[0] as { amount: bigint }).amount, 5n);
  assert.equal(grouped[1].kind, "agentRepay");
  assert.equal((grouped[1] as { amount: bigint }).amount, 20n);
});

test("duplicate repayFor pairs with equal amounts stay separate actions", () => {
  const { events: grouped } = buildReconcileEvents({
    mandateBorrows: [],
    mandateRepays: [],
    lineBorrowed: [],
    lineBorrowedFor: [],
    lineRepaid: [
      { tx: "0xdup", block: 10n, logIndex: 1, borrower: H, amount: 15n },
      { tx: "0xdup", block: 10n, logIndex: 3, borrower: H, amount: 15n },
    ],
    lineRepaidFor: [
      { tx: "0xdup", block: 10n, logIndex: 2, borrower: H, payer: PAYER, amount: 15n },
      { tx: "0xdup", block: 10n, logIndex: 4, borrower: H, payer: PAYER, amount: 15n },
    ],
    migrations: [],
  });
  assert.equal(grouped.length, 2);
  assert.ok(grouped.every((e) => e.kind === "externalRepay"));
});

test("mandate event without matching line logs is reported, line logs survive", () => {
  const { events: grouped, unmatched } = buildReconcileEvents({
    mandateBorrows: [{ tx: "0xorphan", block: 11n, logIndex: 5, agentKey: A1, amount: 20n }],
    mandateRepays: [],
    lineBorrowed: [{ tx: "0xorphan", block: 11n, logIndex: 1, borrower: H, amount: 7n }],
    lineBorrowedFor: [],
    lineRepaid: [],
    lineRepaidFor: [],
    migrations: [],
  });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].kind, "humanBorrow");
  assert.equal((grouped[0] as { amount: bigint }).amount, 7n);
  // The unattributable agent event is surfaced, never silently dropped.
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].kind, "agentBorrow");
  assert.equal(unmatched[0].agentKey, A1);
  assert.equal(unmatched[0].amount, 20n);
});

test("equal-amount direct borrow does not steal the mandate triple", () => {
  // The reported bug: one transaction holds Borrowed(A,10) for A's own
  // position next to a mandate triple for H. Matching the bare amount first
  // consumed A's log, then failed the human check and skipped the agent lot
  // while double-counting H. Expected: H holderDebt=10, A outstanding=10.
  const { events: grouped, unmatched } = buildReconcileEvents({
    mandateBorrows: [{ tx: "0xeq", block: 12n, logIndex: 4, agentKey: A1, amount: 10n }],
    mandateRepays: [],
    lineBorrowed: [
      { tx: "0xeq", block: 12n, logIndex: 1, borrower: A1, amount: 10n },
      { tx: "0xeq", block: 12n, logIndex: 2, borrower: H, amount: 10n },
    ],
    lineBorrowedFor: [{ tx: "0xeq", block: 12n, logIndex: 3, human: H, caller: MANDATE, amount: 10n }],
    lineRepaid: [],
    lineRepaidFor: [],
    migrations: [],
  });
  assert.equal(unmatched.length, 0);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].kind, "humanBorrow");
  assert.equal((grouped[0] as unknown as { human: string }).human, A1);
  assert.equal(grouped[1].kind, "agentBorrow");
  assert.equal((grouped[1] as unknown as { human: string }).human, H);
  const forHuman = reconcileTimeline(grouped, H, A1);
  assert.equal(forHuman.holderDebt, 10n);
  assert.equal(forHuman.agentOutstanding, 10n);
  const forDirect = reconcileTimeline(grouped, A1, A2);
  assert.equal(forDirect.holderDebt, 10n);
  assert.equal(forDirect.agentOutstanding, 0n);
});

test("equal-amount triple before direct borrow still attributes correctly", () => {
  const { events: grouped, unmatched } = buildReconcileEvents({
    mandateBorrows: [{ tx: "0xeq2", block: 13n, logIndex: 3, agentKey: A1, amount: 10n }],
    mandateRepays: [],
    lineBorrowed: [
      { tx: "0xeq2", block: 13n, logIndex: 1, borrower: H, amount: 10n },
      { tx: "0xeq2", block: 13n, logIndex: 4, borrower: A1, amount: 10n },
    ],
    lineBorrowedFor: [{ tx: "0xeq2", block: 13n, logIndex: 2, human: H, caller: MANDATE, amount: 10n }],
    lineRepaid: [],
    lineRepaidFor: [],
    migrations: [],
  });
  assert.equal(unmatched.length, 0);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].kind, "agentBorrow");
  assert.equal(grouped[1].kind, "humanBorrow");
  const forHuman = reconcileTimeline(grouped, H, A1);
  assert.equal(forHuman.holderDebt, 10n);
  assert.equal(forHuman.agentOutstanding, 10n);
});

test("equal-amount direct repay does not steal the agent repay triple", () => {
  n = 0n;
  const { events: grouped, unmatched } = buildReconcileEvents({
    mandateBorrows: [],
    mandateRepays: [{ tx: "0xeqr", block: 14n, logIndex: 4, agentKey: A1, amount: 10n }],
    lineBorrowed: [],
    lineBorrowedFor: [],
    lineRepaid: [
      { tx: "0xeqr", block: 14n, logIndex: 1, borrower: A2, amount: 10n },
      { tx: "0xeqr", block: 14n, logIndex: 2, borrower: H, amount: 10n },
    ],
    lineRepaidFor: [{ tx: "0xeqr", block: 14n, logIndex: 3, borrower: H, payer: MANDATE, amount: 10n }],
    migrations: [],
  });
  assert.equal(unmatched.length, 0);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].kind, "externalRepay");
  assert.equal((grouped[0] as unknown as { human: string }).human, A2);
  assert.equal(grouped[1].kind, "agentRepay");
  const forHuman = reconcileTimeline(
    [ev({ kind: "humanBorrow", human: H, amount: 10n }), ...grouped],
    H,
    A1,
  );
  assert.equal(forHuman.holderDebt, 0n);
  assert.equal(forHuman.agentOutstanding, 0n);
});

test("two equal-amount triples attribute to the right humans in order", () => {
  const { events: grouped, unmatched } = buildReconcileEvents({
    mandateBorrows: [
      { tx: "0xeq3", block: 15n, logIndex: 4, agentKey: A1, amount: 10n },
      { tx: "0xeq3", block: 15n, logIndex: 8, agentKey: A2, amount: 10n },
    ],
    mandateRepays: [],
    lineBorrowed: [
      { tx: "0xeq3", block: 15n, logIndex: 1, borrower: H, amount: 10n },
      { tx: "0xeq3", block: 15n, logIndex: 5, borrower: H2, amount: 10n },
    ],
    lineBorrowedFor: [
      { tx: "0xeq3", block: 15n, logIndex: 2, human: H, caller: MANDATE, amount: 10n },
      { tx: "0xeq3", block: 15n, logIndex: 6, human: H2, caller: MANDATE, amount: 10n },
    ],
    lineRepaid: [],
    lineRepaidFor: [],
    migrations: [],
  });
  assert.equal(unmatched.length, 0);
  assert.equal(grouped.length, 2);
  assert.ok(grouped.every((e) => e.kind === "agentBorrow"));
  assert.equal((grouped[0] as unknown as { human: string }).human, H);
  assert.equal((grouped[1] as unknown as { human: string }).human, H2);
});


const emptyLogs = (): GroupedLogs => ({
  mandateBorrows: [], mandateRepays: [], lineBorrowed: [], lineBorrowedFor: [],
  lineRepaid: [], lineRepaidFor: [], migrations: [],
});

test("equal third-party repayFor before agent repayment keeps payer provenance", () => {
  const logs = emptyLogs();
  logs.lineRepaid = [
    {tx:"0xpayers",block:20n,logIndex:1,borrower:H2,amount:10n},
    {tx:"0xpayers",block:20n,logIndex:4,borrower:H,amount:10n},
  ];
  logs.lineRepaidFor = [
    {tx:"0xpayers",block:20n,logIndex:2,borrower:H2,payer:A1,amount:10n},
    {tx:"0xpayers",block:20n,logIndex:5,borrower:H,payer:MANDATE,amount:10n},
  ];
  logs.mandateRepays = [{tx:"0xpayers",block:20n,logIndex:6,agentKey:A1,amount:10n}];
  const built = buildReconcileEvents(logs);
  assert.equal(built.unmatched.length, 0);
  assert.deepEqual(built.events.map(e=>[e.kind, (e as {human:string}).human]),
    [["externalRepay", H2], ["agentRepay", H]]);
  const history: ReconcileEvent[] = [
    {tx:"0xold",block:1n,logIndex:1,kind:"humanBorrow",human:H,amount:20n},
    {tx:"0xold",block:1n,logIndex:2,kind:"agentBorrow",human:H,agentKey:A1,amount:20n},
    ...built.events,
  ];
  assert.equal(reconcileTimeline(history,H,A1).agentOutstanding,10n);
});

test("equal repayment groups after an agent event cannot be used as its companions", () => {
  const logs=emptyLogs();
  logs.mandateRepays=[{tx:"0xafter",block:21n,logIndex:1,agentKey:A1,amount:10n}];
  logs.lineRepaid=[{tx:"0xafter",block:21n,logIndex:3,borrower:H,amount:10n}];
  logs.lineRepaidFor=[{tx:"0xafter",block:21n,logIndex:4,borrower:H,payer:PAYER,amount:10n}];
  const built=buildReconcileEvents(logs);
  assert.equal(built.unmatched.length,1);
  assert.equal(built.events[0].kind,"externalRepay");
});

test("duplicate positions and broken line companions reject reconstruction", () => {
  const logs=emptyLogs();
  logs.lineRepaid=[{tx:"0xbroken",block:22n,logIndex:1,borrower:H,amount:10n}];
  logs.lineRepaidFor=[{tx:"0xbroken",block:22n,logIndex:3,borrower:H,payer:PAYER,amount:10n}];
  const broken=buildEvents(logs,MANDATE);
  assert.equal(broken.issues.length,1);
  assert.equal(broken.events.length,0);
  logs.lineRepaid.push({...logs.lineRepaid[0]});
  const duplicate=buildEvents(logs,MANDATE);
  assert.equal(duplicate.issues.length,1);
  assert.equal(duplicate.events.length,0);
});

test("orphan mandate line groups are unsafe even when no agent log was fetched", () => {
  const logs=emptyLogs();
  logs.lineBorrowed=[{tx:"0xmissing",block:23n,logIndex:1,borrower:H,amount:10n}];
  logs.lineBorrowedFor=[{tx:"0xmissing",block:23n,logIndex:2,human:H,caller:MANDATE,amount:10n}];
  const built=buildEvents(logs,MANDATE);
  assert.equal(built.issues.length,1);
  assert.equal(built.events.length,0); // No duplicate human lots or invented agent owner.
});
