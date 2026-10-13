import test from "node:test";
import assert from "node:assert/strict";
import { enableAutoRepay, type RepaymentActions } from "../frontend/lib/auto-repay.js";
const borrower = "0x0000000000000000000000000000000000000001";
const agent = "0x0000000000000000000000000000000000000002";
function actions(balance = 0n, allowance = 0n) {
  const calls: string[] = [];
  const api: RepaymentActions = {
    budgetBalance: async () => balance, allowance: async () => allowance,
    delegationBorrower: async () => "0x0000000000000000000000000000000000000000",
    approve: async value => { calls.push(`approve:${value}`); },
    deposit: async value => { calls.push(`deposit:${value}`); },
    delegate: async () => { calls.push("delegate"); },
  };
  return { calls, api };
}
test("approval and confirmed deposit precede delegation", async () => {
  const { api, calls } = actions(3n);
  await enableAutoRepay(api, borrower, agent, 10n, 999n);
  assert.deepEqual(calls, ["approve:7", "deposit:7", "delegate"]);
});
test("failed deposit never authorizes a delegate", async () => {
  const { api, calls } = actions(0n, 100n);
  api.deposit = async () => { throw new Error("reverted"); };
  await assert.rejects(enableAutoRepay(api, borrower, agent, 10n, 999n));
  assert.deepEqual(calls, []);
});
test("renewal uses existing balance instead of funding twice", async () => {
  const { api, calls } = actions(10n);
  await enableAutoRepay(api, borrower, agent, 10n, 999n);
  assert.deepEqual(calls, ["delegate"]);
});
test("another borrower's delegate is rejected before token approval", async () => {
  const { api, calls } = actions(); api.delegationBorrower = async () => agent;
  await assert.rejects(enableAutoRepay(api, borrower, agent, 10n, 999n), /another borrower/);
  assert.deepEqual(calls, []);
});
test("a zero delegate is rejected before moving borrower funds", async () => {
  const { api, calls } = actions();
  await assert.rejects(enableAutoRepay(api, borrower, "0x0000000000000000000000000000000000000000", 10n, 999n), /nonzero/);
  assert.deepEqual(calls, []);
});
