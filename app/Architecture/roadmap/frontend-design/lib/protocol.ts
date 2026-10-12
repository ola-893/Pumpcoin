/**
 * Protocol state for Unora.
 *
 * Everything here is MOCK DATA. It is deliberately centralised in one module so that
 * swapping in the real backend is a single-file change: replace these constants with
 * the `/api/score/:wallet` and `ScoreRegistry.getScore()` reads described in
 * FRONTEND-SPEC.md. Do not scatter new magic numbers into components — add them here.
 */

/** Borrowing terms. In production these come from `ScoreRegistry` + `LendingPool`. */
export const PROTOCOL = {
  /** Share of the loan the borrower must lock. Driven by score — never 0, never 100. */
  collateralRatio: 0.35,
  /** Max outstanding principal for this wallet. `ScoreRegistry.getLoanCeiling()`. */
  loanCeiling: 12_400,
  /** Interest rate, tiered by score. Worse score -> higher rate. */
  apr: 0.042,
  /** Repayment term, in days. */
  termDays: 90,
  /** Smallest loan the pool will write. */
  minLoan: 100,
} as const;

/** The connected wallet's credit profile. `ScoreRegistry.getScore()`. */
export const SCORE = {
  value: 72,
  percentile: 'Top 28% of borrowers',
  repaymentRate: 0.94,
  historyMonths: 18,
  liquidations: 0,
  /** Soulbound NFT token ID. */
  nftId: 1247,
} as const;

/** Collateral asset the borrower locks. */
export const COLLATERAL_TOKEN = {
  symbol: 'USDC',
  name: 'USD Coin',
  /** Wallet balance available to lock. */
  balance: 4_250,
  decimals: 6,
} as const;

/** Collateral required to open a loan of `amount`. */
export function collateralFor(amount: number): number {
  return amount * PROTOCOL.collateralRatio;
}

/**
 * Simple interest over the term. The real protocol accrues per stream tick.
 * `apr` defaults to the wallet's score-tiered rate; pass a market's `baseApr`
 * when the loan is written against a specific reserve.
 */
export function interestFor(amount: number, apr: number = PROTOCOL.apr): number {
  return amount * apr * (PROTOCOL.termDays / 365);
}

/** Total to be repaid: principal + interest. */
export function totalRepayable(amount: number, apr: number = PROTOCOL.apr): number {
  return amount + interestFor(amount, apr);
}

/** Per-second repayment rate, since the stream runs continuously. */
export function streamRatePerSecond(amount: number, apr: number = PROTOCOL.apr): number {
  return totalRepayable(amount, apr) / (PROTOCOL.termDays * 86_400);
}

export function formatUsd(value: number, maximumFractionDigits = 0): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}
