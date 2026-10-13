import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, type Snapshot } from "../agent-credit/rules.js";
import { parseConfig } from "../agent-credit/worker.js";
const rule = { lowBalance: 10n, drawAmount: 20n, repayAfterSeconds: 60n };
const base: Snapshot = {
  balance: 0n,
  humanDebt: 0n,
  agentOutstanding: 0n,
  available: 80n,
  cap: 20n,
  drawn: 0n,
  expiresAt: 1000n,
  revoked: false,
  now: 100n,
  lastDrawAt: 0n,
};
test("working-capital threshold draws only within both mandate and human headroom", () => {
  assert.deepEqual(decide(base, rule), { action: "borrow", amount: 20n });
  for (const change of [
    { available: 19n },
    { drawn: 1n },
    { balance: 10n },
    { revoked: true },
    { expiresAt: 100n },
  ])
    assert.equal(decide({ ...base, ...change }, rule).action, "wait");
});
test("spent cumulative cap does not reset when debt returns to zero", () => {
  assert.equal(decide({ ...base, drawn: 20n }, rule).action, "wait");
});
test("worker repays due principal from its own cash and never more than human debt", () => {
  assert.deepEqual(
    decide(
      {
        ...base,
        agentOutstanding: 20n,
        humanDebt: 12n,
        balance: 18n,
        lastDrawAt: 20n,
      },
      rule,
    ),
    { action: "repay", amount: 12n },
  );
  assert.equal(
    decide(
      {
        ...base,
        agentOutstanding: 20n,
        humanDebt: 20n,
        balance: 20n,
        lastDrawAt: 90n,
      },
      rule,
    ).action,
    "wait",
  );
});
test("revoked/expired mandates permit repayment but cannot cause another draw", () => {
  for (const change of [{ revoked: true }, { expiresAt: 99n }])
    assert.deepEqual(
      decide(
        {
          ...base,
          ...change,
          agentOutstanding: 20n,
          humanDebt: 20n,
          balance: 20n,
          lastDrawAt: 99n,
        },
        rule,
      ),
      { action: "repay", amount: 20n },
    );
});
test("insufficient repayment cash waits without drawing more to repay itself", () => {
  assert.equal(
    decide({ ...base, humanDebt: 20n, agentOutstanding: 20n }, rule).action,
    "wait",
  );
});
test("worker rejects mainnet, off-host local chains, zero addresses and rounded quantities", () => {
  const a = "0x1111111111111111111111111111111111111111";
  const config = {
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    human: a,
    creditLine: a,
    loanToken: a,
    mandate: a,
    fromBlock: "0",
    rule: { lowBalance: "10", drawAmount: "20", repayAfterSeconds: "60" },
  };
  assert.equal(parseConfig(config).rule.drawAmount, 20n);
  for (const change of [
    { chainId: 1 },
    { rpcUrl: "http://example.com" },
    { human: "0x" + "0".repeat(40) },
    { rule: { ...config.rule, drawAmount: "1.5" } },
  ])
    assert.throws(() => parseConfig({ ...config, ...change }));
});
