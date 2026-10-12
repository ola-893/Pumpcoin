/**
 * Wallet position — MOCK.
 *
 * Two independent things a wallet can have:
 *   - a `ScoreRegistry` NFT (it has been scored, and can borrow)
 *   - a `LendingPool` deposit (it is a lender, and earns yield)
 *
 * They are not mutually exclusive, so the dashboard renders each on its own merits.
 * This module is also the single source for the wallet's own money — deposits, debt,
 * escrowed collateral, idle balance — so nothing on the dashboard can disagree about how
 * much the wallet holds.
 *
 * In production this becomes `ScoreRegistry.getScore()`, a `LendingPool` position read,
 * and the loan's terms from the pool. The `?state=` override exists so every branch can be
 * demoed and tested without a wallet.
 */

import { MARKETS, POOLS, supplyApy, utilizationOf, type PoolId } from '@/lib/markets';

/* -------------------------------------------------------------------------- */
/*  Borrow side                                                               */
/* -------------------------------------------------------------------------- */

export interface BorrowPosition {
  loanId: number;
  /** Outstanding principal. */
  drawn: number;
  apr: number;
  /** USDC escrowed against the loan. */
  collateralLocked: number;
  /** collateralLocked / drawn. */
  collateralRatio: number;
  /** Interest paid to date, which nets against yield earned. */
  interestPaid: number;
}

export const BORROW_POSITION: BorrowPosition = {
  loanId: 12,
  drawn: 5_000,
  apr: 0.042,
  collateralLocked: 1_750,
  collateralRatio: 0.35,
  interestPaid: 88.4,
};

/** USDC sitting in the wallet, unencumbered and not earning. */
export const IDLE_BALANCE = 2_500;

/** Capacity delegated out to sponsored wallets. Committed, but still the wallet's capital. */
export const DELEGATED_OUT = 6_500;

/* -------------------------------------------------------------------------- */
/*  Lend side                                                                 */
/* -------------------------------------------------------------------------- */

export interface PoolHolding {
  pool: PoolId;
  /** Principal still in the tranche. */
  deposited: number;
  /** Current value, i.e. principal plus accrued yield. */
  value: number;
  apy: number;
}

export interface LendingPosition {
  holdings: PoolHolding[];
  /** Yield accrued to date across every tranche. */
  accruedYield: number;
  /** Yield earned in the last 30 days — drives the trend indicator. */
  yieldLast30d: number;
  health: { utilization: number; reserveBuffer: number };
}

export interface WalletPosition {
  /** True when the wallet holds a soulbound score and can borrow. */
  scored: boolean;
  /** Null when there is no active deposit. */
  lending: LendingPosition | null;
}

/**
 * Cumulative yield by month, oldest first. Ends on `accruedYield` so the chart and the
 * card cannot disagree.
 */
export const YIELD_SERIES = [60, 128, 195, 262, 320, 380, 440, 500];

/**
 * Supply APY for a tranche.
 *
 * Live tranches derive it from the borrow rate and utilization, so the deposit side can
 * never drift from the borrow side. A tranche that holds deposits before its borrow market
 * opens carries the rate the protocol intends to pay instead — there is no utilization to
 * derive from yet.
 */
const TARGET_APY: Record<PoolId, number> = {
  main: 0,
  bluechip: 0.041,
  sponsored: 0.032,
};

export function poolSupplyApy(pool: PoolId): number {
  const live = MARKETS.filter((m) => m.pool === pool && m.status === 'live');
  const deposits = live.reduce((sum, m) => sum + m.totalBorrows + m.liquidity, 0);
  if (deposits === 0) return TARGET_APY[pool];
  return live.reduce((sum, m) => sum + supplyApy(m) * (m.totalBorrows + m.liquidity), 0) / deposits;
}

/**
 * Utilization and reserve buffer for a tranche, derived from its live markets.
 *
 * A tranche with deposits but no open borrow market is genuinely 0% utilized — nothing is
 * out on loan, so every cent is available to withdraw. That falls out of the arithmetic
 * rather than needing a special case.
 */
function poolHealth(pool: PoolId): { utilization: number; reserveBuffer: number } {
  const live = MARKETS.filter((m) => m.pool === pool && m.status === 'live');
  const borrows = live.reduce((sum, m) => sum + m.totalBorrows, 0);
  const deposits = live.reduce((sum, m) => sum + m.totalBorrows + m.liquidity, 0);
  if (deposits === 0) return { utilization: 0, reserveBuffer: 1 };
  return { utilization: borrows / deposits, reserveBuffer: 1 - borrows / deposits };
}

/**
 * Deposits are tranches of the same USDC market — a risk tier you choose, not a different
 * asset — so holding several is consistent with USDC being the only deployed reserve.
 */
function makeLending(holdings: PoolHolding[]): LendingPosition {
  const value = holdings.reduce((sum, h) => sum + h.value, 0);
  const deposited = holdings.reduce((sum, h) => sum + h.deposited, 0);

  // Utilization is reported per tranche; weight it by holding so the headline figure
  // reflects where the money actually is.
  const utilization =
    value > 0
      ? holdings.reduce((sum, h) => sum + poolHealth(h.pool).utilization * h.value, 0) / value
      : 0;

  return {
    holdings,
    accruedYield: value - deposited,
    yieldLast30d: YIELD_SERIES[YIELD_SERIES.length - 1] - YIELD_SERIES[YIELD_SERIES.length - 2],
    health: { utilization, reserveBuffer: 1 - utilization },
  };
}

function holding(pool: PoolId, deposited: number, yieldShare: number): PoolHolding {
  return { pool, deposited, value: deposited + yieldShare, apy: poolSupplyApy(pool) };
}

const SINGLE_POOL: PoolHolding[] = [holding('main', 12_000, 500)];

const MULTI_POOL: PoolHolding[] = [holding('main', 8_000, 340), holding('bluechip', 4_000, 160)];

/* -------------------------------------------------------------------------- */
/*  Net position                                                              */
/* -------------------------------------------------------------------------- */

export interface NetSummary {
  /** Everything the wallet owns: escrowed collateral, idle cash, supplied deposits. */
  assets: number;
  /** Outstanding principal. */
  debt: number;
  /** assets - debt. */
  net: number;
  /** Interest earned per year across the deposit position. */
  annualYield: number;
  /** Interest paid per year on the loan. */
  annualInterest: number;
  /**
   * Yield earned less interest paid, as a rate on net position. Null when net position is
   * zero or negative — a rate on nothing is undefined, and rendering it as 0.00% would be
   * a fabricated number rather than a missing one.
   */
  netApy: number | null;
  /** Yield accrued to date minus interest paid to date. */
  netInterestToDate: number;
}

/**
 * Nets the two sides into one set of figures.
 *
 * This is what lets a single dashboard serve a wallet that both lends and borrows: rather
 * than reading a Borrowing half and a Lending half and subtracting them yourself, the
 * headline already answers "how am I doing overall".
 */
export function netSummary(position: WalletPosition): NetSummary {
  const deposits = position.lending ? positionValue(position.lending) : 0;
  const debt = position.scored ? BORROW_POSITION.drawn : 0;
  const collateral = position.scored ? BORROW_POSITION.collateralLocked : 0;

  const assets = collateral + IDLE_BALANCE + deposits;
  const net = assets - debt;

  const annualYield = position.lending
    ? position.lending.holdings.reduce((sum, h) => sum + h.value * h.apy, 0)
    : 0;
  const annualInterest = debt * BORROW_POSITION.apr;

  return {
    assets,
    debt,
    net,
    annualYield,
    annualInterest,
    netApy: net > 0 ? (annualYield - annualInterest) / net : null,
    netInterestToDate:
      (position.lending?.accruedYield ?? 0) - (position.scored ? BORROW_POSITION.interestPaid : 0),
  };
}

/**
 * How far the score can fall before the wallet drops a tier — the figure that actually
 * measures risk here.
 *
 * Collateral is locked at exactly the ratio the tier requires, so unlike Aave there is no
 * over-collateralisation buffer to report. The real exposure is a score downgrade, which
 * would raise the ratio demanded against the same loan.
 */
export function tierBuffer(score: number): { rung: TierRung; points: number } | null {
  const floor = [...TIER_LADDER]
    .filter((tier) => tier.minScore <= score)
    .sort((a, b) => b.minScore - a.minScore)[0];
  return floor ? { rung: floor, points: score - floor.minScore } : null;
}

/* -------------------------------------------------------------------------- */
/*  Tier ladder — reference data, shown on the Borrow page                     */
/* -------------------------------------------------------------------------- */

export type TierState = 'current' | 'cleared' | 'locked';

export interface TierRung {
  name: string;
  /** Score needed to reach this rung. */
  minScore: number;
  ratio: string;
  ceiling: string;
  color: string;
  fill: string;
  state: TierState;
}

export const TIER_LADDER: TierRung[] = [
  {
    name: 'Prime',
    minScore: 80,
    ratio: '20%',
    ceiling: '$25,000',
    color: '#639922',
    fill: '#E3E8D5',
    state: 'locked',
  },
  {
    name: 'Established',
    minScore: 65,
    ratio: '35%',
    ceiling: '$12,400',
    color: '#7C3AED',
    fill: '#E7DBF1',
    state: 'current',
  },
  {
    name: 'Building',
    minScore: 50,
    ratio: '55%',
    ceiling: '$6,200',
    color: '#BA7517',
    fill: '#EFE3D3',
    state: 'cleared',
  },
];

/** Points still needed for the next rung up, or null if already at the top. */
export function pointsToNextTier(score: number): { rung: TierRung; gap: number } | null {
  const next = [...TIER_LADDER]
    .filter((tier) => tier.minScore > score)
    .sort((a, b) => a.minScore - b.minScore)[0];
  return next ? { rung: next, gap: next.minScore - score } : null;
}

/* -------------------------------------------------------------------------- */
/*  Wallet states                                                             */
/* -------------------------------------------------------------------------- */

/** Named wallet states, so the conditional rendering can be exercised end to end. */
export const WALLET_STATES = {
  /** Brand new wallet: no score, no deposit. */
  new: { scored: false, lending: null },
  /** Has been scored but has never deposited. */
  borrower: { scored: true, lending: null },
  /** Lends only — has never borrowed. */
  lender: { scored: false, lending: makeLending(SINGLE_POOL) },
  /** Lends across more than one tranche, which is what reveals the pool donut. */
  'lender-multi': { scored: false, lending: makeLending(MULTI_POOL) },
  /** Has done both — the two sections stack. */
  both: { scored: true, lending: makeLending(SINGLE_POOL) },
  'both-multi': { scored: true, lending: makeLending(MULTI_POOL) },
} satisfies Record<string, WalletPosition>;

export type WalletStateKey = keyof typeof WALLET_STATES;

export const DEFAULT_WALLET_STATE: WalletStateKey = 'both-multi';

/** Reads `?state=` off the URL, falling back to the default. */
export function resolveWalletState(search: string): {
  key: WalletStateKey;
  position: WalletPosition;
} {
  const requested = new URLSearchParams(search).get('state');
  const key = (
    requested && requested in WALLET_STATES ? requested : DEFAULT_WALLET_STATE
  ) as WalletStateKey;
  return { key, position: WALLET_STATES[key] };
}

/* -------------------------------------------------------------------------- */
/*  Derived figures                                                           */
/* -------------------------------------------------------------------------- */

/** Weighted APY across tranches — what the position is actually earning. */
export function blendedApy(lending: LendingPosition): number {
  const value = lending.holdings.reduce((sum, h) => sum + h.value, 0);
  if (value === 0) return 0;
  return lending.holdings.reduce((sum, h) => sum + h.apy * h.value, 0) / value;
}

/** Total principal plus accrued yield. */
export function positionValue(lending: LendingPosition): number {
  return lending.holdings.reduce((sum, h) => sum + h.value, 0);
}

/** Total principal deposited. */
export function positionDeposited(lending: LendingPosition): number {
  return lending.holdings.reduce((sum, h) => sum + h.deposited, 0);
}

/**
 * Card palette for a wallet's positions. Purple is identity, green is money coming in, amber
 * is money owed. Shared so the landing hero's card backs match the dashboard's deck.
 */
export const POSITION_TONES = {
  score: { color: '#7C3AED', fill: '#E7DBF1' },
  borrow: { color: '#BA7517', fill: '#EFE3D3' },
  deposit: { color: '#639922', fill: '#E3E8D5' },
} as const;

export function poolName(pool: PoolId): string {
  return POOLS.find((p) => p.id === pool)?.name ?? pool;
}

/** Weighted live-market utilization for a tranche. */
export function poolUtilization(pool: PoolId): number {
  const live = MARKETS.filter((m) => m.pool === pool && m.status === 'live');
  const deposits = live.reduce((sum, m) => sum + m.totalBorrows + m.liquidity, 0);
  if (deposits === 0) return 0;
  return (
    live.reduce((sum, m) => sum + utilizationOf(m) * (m.totalBorrows + m.liquidity), 0) / deposits
  );
}
