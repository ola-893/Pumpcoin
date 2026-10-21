export type EconomyPolicy = { maxTransactionGasWei: string; maxDailyGasWei: string; gasReserveWei: string; minimumTradeIntervalMs: number; maxTradesPerDay: number };
export type GasDay = { day: string; spentWei: string; trades: number };
export type BudgetReason = 'cooldown' | 'daily-limit' | 'gas-reserve' | 'fee-cap';
export class BudgetLimitError extends Error {
  public reason: BudgetReason;
  constructor(reason: BudgetReason) { super(`Faucet budget: ${reason}.`); this.reason = reason; }
}
export function economyPolicy(value?: EconomyPolicy) {
  if (!value) return undefined;
  for (const key of ['maxTransactionGasWei','maxDailyGasWei','gasReserveWei'] as const)
    if (!/^(0|[1-9]\d{0,24})$/.test(value[key])) throw new Error('Invalid faucet gas budget.');
  if (BigInt(value.maxTransactionGasWei) <= 0n || BigInt(value.maxDailyGasWei) < BigInt(value.maxTransactionGasWei)
      || !Number.isSafeInteger(value.minimumTradeIntervalMs) || value.minimumTradeIntervalMs < 0 || value.minimumTradeIntervalMs > 86400000
      || !Number.isSafeInteger(value.maxTradesPerDay) || value.maxTradesPerDay < 1 || value.maxTradesPerDay > 288) throw new Error('Invalid faucet activity budget.');
  return value;
}
export function gasDay(previous: GasDay | undefined, timestamp: bigint): GasDay {
  const day = String(timestamp / 86400n);
  if (!previous) return { day, spentWei: '0', trades: 0 };
  if (!/^\d+$/.test(previous.day) || !/^\d+$/.test(previous.spentWei) || !Number.isSafeInteger(previous.trades) || previous.trades < 0 || BigInt(previous.day) > BigInt(day)) throw new Error('Invalid faucet budget journal.');
  return previous.day === day ? previous : { day, spentWei: '0', trades: 0 };
}
export function requireActivityBudget(policy: EconomyPolicy, day: GasDay, timestamp: bigint, lastTradeTimestamp?: string) {
  if (day.trades >= policy.maxTradesPerDay || BigInt(day.spentWei) >= BigInt(policy.maxDailyGasWei)) throw new BudgetLimitError('daily-limit');
  if (lastTradeTimestamp !== undefined) {
    if (!/^\d+$/.test(lastTradeTimestamp) || BigInt(lastTradeTimestamp) > timestamp) throw new Error('Invalid trade timestamp journal.');
    if ((timestamp - BigInt(lastTradeTimestamp)) * 1000n < BigInt(policy.minimumTradeIntervalMs)) throw new BudgetLimitError('cooldown');
  }
}
export function requireGasBudget(policy: EconomyPolicy, balance: bigint, gas: bigint, feePerGas: bigint, spent: bigint) {
  if (gas <= 0n || feePerGas <= 0n || spent < 0n) throw new Error('Invalid fee estimate.');
  const ceiling = gas * feePerGas;
  if (ceiling > BigInt(policy.maxTransactionGasWei)) throw new BudgetLimitError('fee-cap');
  if (spent + ceiling > BigInt(policy.maxDailyGasWei)) throw new BudgetLimitError('daily-limit');
  if (balance < ceiling + BigInt(policy.gasReserveWei)) throw new BudgetLimitError('gas-reserve');
  return ceiling;
}
