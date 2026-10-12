import type { Address } from 'viem';

export interface RepaymentActions {
  budgetBalance(): Promise<bigint>;
  allowance(): Promise<bigint>;
  delegationBorrower(agent: Address): Promise<Address>;
  // Each mutation resolves only after a successful receipt, not just a transaction hash.
  approve(amount: bigint): Promise<void>;
  deposit(amount: bigint): Promise<void>;
  delegate(agent: Address, budget: bigint, expiry: bigint): Promise<void>;
}

export async function enableAutoRepay(
  actions: RepaymentActions,
  borrower: Address,
  agent: Address,
  budget: bigint,
  expiry: bigint,
) {
  if (budget <= 0n) throw new Error('Enter a positive repayment budget.');
  if (agent === '0x0000000000000000000000000000000000000000')
    throw new Error('Enter a nonzero repayment key.');
  const owner = await actions.delegationBorrower(agent);
  if (
    owner !== '0x0000000000000000000000000000000000000000' &&
    owner.toLowerCase() !== borrower.toLowerCase()
  ) {
    throw new Error('This delegate key belongs to another borrower. Use a dedicated key.');
  }
  const current = await actions.budgetBalance();
  const topUp = budget > current ? budget - current : 0n;
  if (topUp > 0n) {
    if ((await actions.allowance()) < topUp) await actions.approve(topUp);
    await actions.deposit(topUp);
  }
  await actions.delegate(agent, budget, expiry);
}
