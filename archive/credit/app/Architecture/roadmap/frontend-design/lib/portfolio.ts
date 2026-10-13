/**
 * Dashboard series data — MOCK.
 *
 * Time series and derived aggregates for the dashboard. Kept out of the components so
 * swapping in real data is a single-file change: these become `StreamManager` event
 * aggregations and `ScoreRegistry` history reads.
 *
 * Convention: `MONTHS` runs oldest -> newest, and every series is the same length.
 */

import { SCORE } from '@/lib/protocol';
import {
  BORROW_POSITION,
  DELEGATED_OUT,
  IDLE_BALANCE,
  TIER_LADDER,
} from '@/lib/position';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'] as const;

/** Principal drawn per month. */
export const BORROWED_SERIES = [3_000, 4_500, 2_000, 6_000, 3_500, 5_000, 2_500, 5_000];

/** Principal repaid per month. Always trails borrowing — that's the point of the score. */
export const REPAID_SERIES = [2_800, 4_100, 2_200, 5_200, 3_300, 4_600, 2_400, 4_800];

/** Credit score at each month end. */
export const SCORE_SERIES = [58, 61, 63, 66, 68, 70, 71, 72];

/** Loan ceiling, which the score drives. */
export const CEILING_SERIES = [7_400, 8_600, 9_400, 10_300, 11_000, 11_600, 12_000, 12_400];

/** Collateral ratio — falling is good, because the score is doing the work. */
export const RATIO_SERIES = [0.52, 0.49, 0.46, 0.43, 0.41, 0.38, 0.36, 0.35];

/** Yield credited to the wallet per month. */
export const YIELD_SERIES = [24, 48, 66, 82, 99, 118, 143, 178];

export const MONTHLY = {
  borrowed: BORROWED_SERIES,
  repaid: REPAID_SERIES,
  score: SCORE_SERIES,
  ceiling: CEILING_SERIES,
  ratio: RATIO_SERIES,
  yield: YIELD_SERIES,
};

export interface AllocationSlice {
  label: string;
  hint: string;
  value: number;
  color: string;
}

/**
 * Where the wallet's USDC actually sits. All three are the same asset, so the percentages
 * are directly comparable. Figures come from the position model rather than being repeated
 * here, so the donut can't disagree with the cards above it.
 */
export const ALLOCATION: AllocationSlice[] = [
  {
    label: 'Locked collateral',
    hint: `backing loan #${BORROW_POSITION.loanId}`,
    value: BORROW_POSITION.collateralLocked,
    color: '#7C3AED',
  },
  { label: 'Idle balance', hint: 'unencumbered', value: IDLE_BALANCE, color: '#A78BFA' },
  { label: 'Delegated out', hint: 'sponsoring 3 wallets', value: DELEGATED_OUT, color: '#639922' },
];

export function allocationTotal(): number {
  return ALLOCATION.reduce((sum, slice) => sum + slice.value, 0);
}

/** Headline figures for the stat cards. */
export interface StatCard {
  label: string;
  value: string;
  delta: string;
  /** Direction of the delta, from the wallet's point of view. */
  tone: 'good' | 'warn' | 'neutral';
  /**
   * Sparkline data. Omit for a card whose value isn't a trend — a card showing which
   * pool you're in has no shape over time, and drawing one would be decoration.
   */
  series?: number[];
}

/** The rung the wallet currently sits on — drives the ceiling figure. */
const CURRENT_TIER = TIER_LADDER.find((tier) => tier.state === 'current');

export const STAT_CARDS: StatCard[] = [
  {
    label: 'Credit score',
    value: String(SCORE.value),
    delta: '+4 pts',
    tone: 'good',
    series: SCORE_SERIES,
  },
  {
    label: 'Collateral ratio',
    value: `${Math.round(BORROW_POSITION.collateralRatio * 100)}%`,
    delta: '−17 pp',
    tone: 'good',
    series: RATIO_SERIES,
  },
  {
    label: 'Loan ceiling',
    value: CURRENT_TIER?.ceiling ?? '—',
    delta: '+$2,100',
    tone: 'good',
    series: CEILING_SERIES,
  },
  {
    label: 'Outstanding debt',
    value: `$${BORROW_POSITION.drawn.toLocaleString('en-US')}`,
    delta: 'streaming',
    tone: 'neutral',
    series: BORROWED_SERIES,
  },
];

/** Compact money formatting — `$12.4K`. */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value}`;
}
