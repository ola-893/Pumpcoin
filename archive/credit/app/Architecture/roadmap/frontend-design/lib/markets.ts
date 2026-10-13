/**
 * Borrow markets — MOCK DATA.
 *
 * Mirrors what `LendingPool` would expose per reserve: the asset, the pool it sits in,
 * its utilisation-derived APR, total outstanding principal, and available liquidity.
 *
 * Replace with a `LendingPool.getReserveData()` read (or an Envio indexer query) when
 * the backend lands. Keep the shape — components depend on it, not on the numbers.
 */

export type PoolId = 'main' | 'bluechip' | 'sponsored';

export interface Pool {
  id: PoolId;
  name: string;
  /** One-line explanation of who the pool is for. */
  description: string;
  /** Risk framing, shown under the pool name. */
  riskNote: string;
}

export const POOLS: Pool[] = [  {
    id: 'main',
    name: 'General',
    description: 'Borrow against the widest range of assets in one general-purpose market.',
    riskNote: 'Open to every scored wallet. Collateral priced from your credit history.',
  },
  {
    id: 'bluechip',
    name: 'Bluechip',
    description: 'Lower rates on the deepest, most liquid collateral assets.',
    riskNote: 'Requires a score of 60 or above. Tighter risk limits, cheaper debt.',
  },
  {
    id: 'sponsored',
    name: 'Sponsored',
    description: 'Debt backed by capacity a sponsor has delegated to your wallet.',
    riskNote: 'Requires an active sponsor. Their capacity is slashed if you default.',
  },
];

/**
 * Accent per pool. Purple is the general-purpose market, green the low-risk one, amber the
 * sponsored one — the same three tones used for tiers, so a colour always means one thing.
 */
export const POOL_COLORS: Record<PoolId, string> = {
  main: '#7C3AED',
  bluechip: '#639922',
  sponsored: '#BA7517',
};

export interface Market {
  /** Ticker, e.g. USDC. */
  symbol: string;
  name: string;
  pool: PoolId;
  /**
   * `live` reserves can be borrowed against today. `soon` reserves are visible so the
   * roadmap is legible, but the pool holds no liquidity for them yet — on Monad testnet
   * only USDC is deployed.
   */
  status: 'live' | 'soon';
  /** Interest rate before any score discount, as a decimal. */
  baseApr: number;
  /** Outstanding principal across the pool. */
  totalBorrows: number;
  /** Undrawn deposits available to borrow right now. */
  liquidity: number;
  /** Lowest credit score this market will lend to. */
  minScore: number;
  /**
   * Ceiling on total deposits. Supply is rejected above it, which is what makes the
   * capacity bar on the deposit page a real figure rather than a constant.
   */
  supplyCap: number;
  /** Hex for the asset badge. Kept muted — this is a data table, not a logo wall. */
  accent: string;
}

/**
 * Reserves, one row per market.
 *
 * The same asset appears in more than one pool on purpose — USDC is listed under General and
 * Bluechip, because the pools are tranches of the same asset at different risk rather than
 * different assets. This is also how Aave lists weETH under both Main and EtherFi. A wallet
 * deposited in the Bluechip tranche needs a row to sit on, or its balance would be invisible
 * on the deposit page.
 */
export const MARKETS: Market[] = [
  { symbol: 'USDC',   name: 'USD Coin',         pool: 'main',      status: 'live', baseApr: 0.042, totalBorrows: 1_240_000, liquidity: 480_000, minScore: 0,  supplyCap: 2_400_000, accent: '#2775CA' },
  { symbol: 'USDT',   name: 'Tether USD',       pool: 'main',      status: 'soon', baseApr: 0.046, totalBorrows: 0, liquidity: 0, minScore: 0,  supplyCap: 0, accent: '#26A17B' },
  { symbol: 'MON',    name: 'Monad',            pool: 'main',      status: 'soon', baseApr: 0.034, totalBorrows: 0, liquidity: 0, minScore: 0,  supplyCap: 0, accent: '#6E54FF' },
  { symbol: 'WETH',   name: 'Wrapped Ether',    pool: 'main',      status: 'soon', baseApr: 0.039, totalBorrows: 0, liquidity: 0, minScore: 0,  supplyCap: 0, accent: '#627EEA' },
  { symbol: 'USDC',   name: 'USD Coin',         pool: 'bluechip',  status: 'live', baseApr: 0.036, totalBorrows: 180_000,   liquidity: 60_000,  minScore: 60, supplyCap: 320_000,   accent: '#2775CA' },
  { symbol: 'WBTC',   name: 'Wrapped Bitcoin',  pool: 'bluechip',  status: 'soon', baseApr: 0.031, totalBorrows: 0, liquidity: 0, minScore: 60, supplyCap: 0, accent: '#F09242' },
  { symbol: 'wstETH', name: 'Wrapped stETH',    pool: 'bluechip',  status: 'soon', baseApr: 0.036, totalBorrows: 0, liquidity: 0, minScore: 60, supplyCap: 0, accent: '#00A3FF' },
  { symbol: 'sUSDC',  name: 'Staked USDC',      pool: 'sponsored', status: 'soon', baseApr: 0.028, totalBorrows: 0, liquidity: 0, minScore: 50, supplyCap: 0, accent: '#7C3AED' },
];

/** Reserves that are actually deployed. Everything else is roadmap. */
export function liveMarkets(): Market[] {
  return MARKETS.filter((m) => m.status === 'live');
}

/**
 * Share of borrow interest the protocol keeps before paying suppliers. The rest funds the
 * reserve that absorbs defaults.
 */
export const RESERVE_FACTOR = 0.1;

/** Outstanding principal as a share of total deposits. */
export function utilizationOf(market: Market): number {
  const deposits = market.totalBorrows + market.liquidity;
  return deposits === 0 ? 0 : market.totalBorrows / deposits;
}

/**
 * What a supplier actually earns.
 *
 * A supplier cannot earn the headline borrow rate — only the borrowed portion of the pool
 * generates interest at all, and the protocol takes its cut first. So:
 *
 *     supplyApy = borrowApr x utilization x (1 - reserveFactor)
 *
 * Deriving it rather than listing it separately is what keeps the borrow page's APR and
 * the deposit page's APY from drifting apart. At USDC's 72% utilization that is roughly
 * 2.7% against a 4.2% borrow rate.
 */
export function supplyApy(market: Market): number {
  return market.baseApr * utilizationOf(market) * (1 - RESERVE_FACTOR);
}

/** Reserve buffer: the undrawn share a withdrawal would be paid from. */
export function reserveBufferOf(market: Market): number {
  return 1 - utilizationOf(market);
}

/**
 * Two-slope rate model, kinked at the optimal utilization — the standard shape, and the one
 * Aave draws on its reserve pages.
 *
 * Below the kink, rates rise gently so borrowing stays cheap while the pool has slack. Above
 * it, rates rise steeply to pull in supply and push out demand before the pool runs dry.
 *
 * Tuned so the curve reproduces the USDC market's current figures exactly: at 72.09%
 * utilization it returns 4.20% borrow APR and 2.72% supply APY, matching `baseApr` and
 * `supplyApy`. If those drift apart, this is the thing to re-tune.
 */
export const RATE_MODEL = {
  /** Utilization at which the curve kinks. */
  optimalUtilization: 0.8,
  /** Borrow APR at zero utilization. */
  baseRate: 0.01,
  /** APR added between zero and the kink. */
  slope1: 0.0355,
  /** APR added between the kink and 100% utilization. */
  slope2: 0.6,
};

/** Borrow APR at an arbitrary utilization, per the two-slope model. */
export function borrowAprAt(utilization: number): number {
  const { optimalUtilization, baseRate, slope1, slope2 } = RATE_MODEL;
  if (utilization <= optimalUtilization) {
    return baseRate + (utilization / optimalUtilization) * slope1;
  }
  const excess = (utilization - optimalUtilization) / (1 - optimalUtilization);
  return baseRate + slope1 + excess * slope2;
}

/** Supply APY at an arbitrary utilization — the same derivation as `supplyApy`. */
export function supplyApyAt(utilization: number): number {
  return borrowAprAt(utilization) * utilization * (1 - RESERVE_FACTOR);
}

/** Total deposits in a market: what has been lent, plus what is still idle. */
export function marketDeposits(market: Market): number {
  return market.totalBorrows + market.liquidity;
}

/** Undrawn deposits across every live pool. */
export function totalLiquidity(): number {
  return liveMarkets().reduce((sum, m) => sum + m.liquidity, 0);
}

/** Outstanding principal across every live pool. */
export function totalBorrows(): number {
  return liveMarkets().reduce((sum, m) => sum + m.totalBorrows, 0);
}

/** Deposits are what's been lent plus what's still sitting idle. */
export function totalDeposits(): number {
  return totalLiquidity() + totalBorrows();
}

/** Compact money formatting for table cells — `$1.24M`, `$880K`. */
export function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

/** Fixed-precision money, for the secondary line under a compact figure. */
export function formatFullUsd(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

export function formatApr(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
