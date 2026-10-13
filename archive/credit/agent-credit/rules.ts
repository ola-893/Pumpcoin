export type Snapshot = {
  balance: bigint;
  humanDebt: bigint;
  agentOutstanding: bigint;
  available: bigint;
  cap: bigint;
  drawn: bigint;
  expiresAt: bigint;
  revoked: boolean;
  now: bigint;
  lastDrawAt: bigint;
};
export type Rule = {
  lowBalance: bigint;
  drawAmount: bigint;
  repayAfterSeconds: bigint;
};
export type Decision =
  | { action: "borrow" | "repay"; amount: bigint }
  | { action: "wait"; reason: string };

export function decide(s: Snapshot, rule: Rule): Decision {
  if (
    rule.lowBalance <= 0n ||
    rule.drawAmount <= 0n ||
    rule.repayAfterSeconds < 1n
  )
    throw new Error("Invalid working-capital rule");
  if (
    s.balance < 0n ||
    s.drawn < 0n ||
    s.cap < s.drawn ||
    s.agentOutstanding < 0n
  )
    throw new Error("Invalid contract snapshot");
  // Outstanding draws are reconstructed from this agent's confirmed contract events.
  // Do not borrow repeatedly just because prior draws have been spent.
  if (s.agentOutstanding > 0n) {
    const due =
      s.revoked ||
      s.expiresAt <= s.now ||
      s.now >= s.lastDrawAt + rule.repayAfterSeconds;
    const amount = [s.agentOutstanding, s.humanDebt, s.balance].reduce(
      (a, b) => (a < b ? a : b),
    );
    return due && amount > 0n
      ? { action: "repay", amount }
      : {
          action: "wait",
          reason: due
            ? "Repayment funds or bound debt unavailable"
            : "Repayment interval pending",
        };
  }
  if (s.revoked || s.expiresAt <= s.now)
    return { action: "wait", reason: "Mandate inactive" };
  if (s.balance >= rule.lowBalance)
    return { action: "wait", reason: "Working-capital balance sufficient" };
  if (rule.drawAmount > s.cap - s.drawn)
    return { action: "wait", reason: "Cumulative mandate cap exhausted" };
  if (rule.drawAmount > s.available)
    return {
      action: "wait",
      reason: "Human eligibility, collateral or liquidity insufficient",
    };
  return { action: "borrow", amount: rule.drawAmount };
}
