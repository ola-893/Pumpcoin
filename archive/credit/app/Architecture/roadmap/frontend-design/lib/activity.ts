/**
 * Protocol activity — LIVE SIMULATION.
 *
 * One canonical event stream, ordered newest first. The hero card, the dashboard list
 * and the Activity page all render from the same source; a simulation ticks new events
 * in every ~12s and advances the `age` fields every minute so relative times stay true
 * ("just now" becomes "1m ago" becomes "2m ago"...).
 *
 * The stream is seeded from the same narrative data as before, so the first paint is
 * identical to the old static list — then it starts moving. When the real backend
 * lands, replace `ACTIVITY` with Envio/StreamManager/ScoreRegistry event reads and
 * keep the shape: every consumer renders from `useLiveActivity()`.
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  TrendingUp,
  RotateCcw,
  Star,
  ArrowDownToLine,
  Banknote,
  Handshake,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { MARKETS } from '@/lib/markets';

/**
 * Accent for a token symbol, so activity badges an asset the same way every other surface
 * does. Falls back to a neutral grey rather than inventing a colour.
 */
export function tokenAccent(symbol: string): string {
  return MARKETS.find((market) => market.symbol === symbol)?.accent ?? '#888780';
}

export type ActivityKind =
  | 'stream'
  | 'repayment'
  | 'score'
  | 'deposit'
  | 'loan'
  | 'sponsor'
  | 'default';

/**
 * `label` is the full name used by the Activity page's filters; `short` is the one-word tag
 * under each amount on the dashboard, where space is tight.
 */
export const KIND_META: Record<
  ActivityKind,
  { label: string; short: string; color: string; Icon: LucideIcon }
> = {
  stream: { label: 'Stream tick', short: 'Stream', color: '#639922', Icon: TrendingUp },
  repayment: { label: 'Repayment', short: 'Repaid', color: '#7C3AED', Icon: RotateCcw },
  score: { label: 'Score update', short: 'Score', color: '#639922', Icon: Star },
  deposit: { label: 'Deposit', short: 'Deposit', color: '#7C3AED', Icon: ArrowDownToLine },
  loan: { label: 'Loan', short: 'Borrowed', color: '#639922', Icon: Banknote },
  sponsor: { label: 'Sponsorship', short: 'Sponsor', color: '#7C3AED', Icon: Handshake },
  default: { label: 'Default', short: 'Default', color: '#BA7517', Icon: ShieldAlert },
};

export interface ProtocolEvent {
  /** Unique per event so a live stream can key rows safely. */
  id: string;
  kind: ActivityKind;
  name: string;
  detail: string;
  amount: string;
  /**
   * The token that actually moved, when one did. Absent for events that aren't token
   * transfers — a score update or a capacity delegation moves no asset, and badging those
   * with a token would be a lie about what happened.
   */
  symbol?: string;
  /** Display string for the timestamp. */
  time: string;
  /** Seconds ago — the list is ordered by this, since display strings aren't sortable. */
  age: number;
}

/** Roughly how often a fresh event lands on the live feed, in seconds. */
const TICK_INTERVAL_S = 12;

/** Pool descriptors reused by generated events, so copy stays consistent with Markets. */
const POOLS = ['General pool', 'Bluechip pool', 'Sponsored pool'] as const;

/**
 * Assets that actually move in the simulated feed. USDC leads — it is the only live
 * reserve on testnet — with steady USDT/WETH traffic so the feed shows the same
 * multi-token variety the Borrow and Deposit tables do (and their real logos appear).
 */
type TransferToken = 'USDC' | 'USDT' | 'WETH';

function randomToken(): TransferToken {
  const roll = Math.random();
  if (roll < 0.5) return 'USDC';
  if (roll < 0.75) return 'USDT';
  return 'WETH';
}

const WETH_USD = 3_000;

/** Token units for a transfer, at plausible scales per kind. Stablecoins carry their
 * dollar figure; WETH runs proportionally smaller at the same dollar value. Stream
 * ticks are per-second drips, so they sit orders of magnitude below the rest. */
const USD_RANGES = {
  stream: [0.0002, 0.0011],
  repayment: [5, 100],
  deposit: [100, 2_100],
  loan: [500, 5_500],
} as const;

function transferUnits(
  kind: 'stream' | 'repayment' | 'deposit' | 'loan',
  symbol: TransferToken,
): string {
  const [low, high] = USD_RANGES[kind];
  const usd = low + Math.random() * (high - low);
  if (symbol === 'WETH') return (usd / WETH_USD).toFixed(kind === 'stream' ? 8 : 4);
  return usd.toFixed(kind === 'stream' ? 6 : 2);
}

/** Names reused by generated sponsor/default events. */
const INITIALS = ['A. Bello', 'T. Reyes', 'J. Lindqvist', 'M. Okafor', 'K. Tanaka', 'R. Novak'];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** A fresh, plausible event. Weighted so stream ticks and repayments dominate — a
 * healthy protocol is mostly payments flowing, with occasional score movement. */
function randomEvent(id: string): ProtocolEvent {
  const roll = Math.random();
  if (roll < 0.35) {
    const symbol = randomToken();
    return {
      id,
      kind: 'stream',
      name: 'Stream tick',
      detail: `Repayment stream #${10 + Math.floor(Math.random() * 40)}`,
      amount: `+${transferUnits('stream', symbol)} ${symbol}`,
      symbol,
      time: 'just now',
      age: 0,
    };
  }
  if (roll < 0.62) {
    const symbol = randomToken();
    return {
      id,
      kind: 'repayment',
      name: 'Repayment',
      detail: `Loan #${3 + Math.floor(Math.random() * 20)} — interest`,
      amount: `${transferUnits('repayment', symbol)} ${symbol}`,
      symbol,
      time: 'just now',
      age: 0,
    };
  }
  if (roll < 0.72) {
    const pts = 1 + Math.floor(Math.random() * 3);
    return {
      id,
      kind: 'score',
      name: 'Score update',
      detail: `Repayment rate: ${90 + Math.floor(Math.random() * 10)}%`,
      amount: `+${pts} pts`,
      time: 'just now',
      age: 0,
    };
  }
  if (roll < 0.84) {
    const symbol = randomToken();
    return {
      id,
      kind: 'deposit',
      name: 'Deposit',
      detail: `${pick(POOLS)} — ${(2.2 + Math.random() * 0.6).toFixed(2)}% APY`,
      amount: `${transferUnits('deposit', symbol)} ${symbol}`,
      symbol,
      time: 'just now',
      age: 0,
    };
  }
  if (roll < 0.91) {
    const dollars = (1 + Math.floor(Math.random() * 6) * 500).toLocaleString('en-US');
    return {
      id,
      kind: 'sponsor',
      name: 'Capacity delegated',
      detail: `To ${pick(INITIALS)}`,
      amount: `$${dollars}`,
      time: 'just now',
      age: 0,
    };
  }
  if (roll < 0.975) {
    const symbol = randomToken();
    return {
      id,
      kind: 'loan',
      name: 'Loan received',
      detail: `${pick(POOLS)} — ${(3.6 + Math.random() * 0.9).toFixed(2)}% APR`,
      amount: `${transferUnits('loan', symbol)} ${symbol}`,
      symbol,
      time: 'just now',
      age: 0,
    };
  }
  return {
    id,
    kind: 'default',
    name: 'Default flagged',
    detail: `${pick(INITIALS)} — stream stalled`,
    amount: 'slashed',
    time: 'just now',
    age: 0,
  };
}

/** `age` seconds → the coarse display string the feeds use. */
export function ageLabel(age: number): string {
  if (age < 60) return 'just now';
  if (age < 3_600) return `${Math.floor(age / 60)}m ago`;
  if (age < 86_400) return `${Math.floor(age / 3_600)}h ago`;
  if (age < 604_800) return `${Math.floor(age / 86_400)}d ago`;
  if (age < 2_592_000) return `${Math.floor(age / 604_800)}w ago`;
  return `${Math.floor(age / 2_592_000)}mo ago`;
}

/** The seeded history the live stream starts from, newest first. */
const SEED: Omit<ProtocolEvent, 'id'>[] = [
  { kind: 'stream', name: 'Stream tick', detail: 'Repayment stream #12', amount: '+0.000650 USDC', symbol: 'USDC', time: 'just now', age: 5 },
  { kind: 'repayment', name: 'Repayment', detail: 'Loan #12 — principal', amount: '$45.00', symbol: 'USDC', time: '1h ago', age: 3_600 },
  { kind: 'score', name: 'Score update', detail: 'Milestone: 18 months history', amount: '+2 pts', time: '3h ago', age: 10_800 },
  { kind: 'deposit', name: 'Deposit', detail: 'General pool — 2.72% APY', amount: '$500.00', symbol: 'USDC', time: '1d ago', age: 86_400 },
  { kind: 'default', name: 'Default flagged', detail: 'A. Bello — stream stalled', amount: 'slashed', time: '2d ago', age: 172_800 },
  { kind: 'sponsor', name: 'Capacity delegated', detail: 'To T. Reyes', amount: '$3,000', time: '3d ago', age: 259_200 },
  { kind: 'sponsor', name: 'Capacity delegated', detail: 'To J. Lindqvist', amount: '$2,000', time: '4d ago', age: 345_600 },
  { kind: 'loan', name: 'Loan received', detail: 'General pool — 4.20% APR', amount: '$5,000', symbol: 'USDC', time: '5d ago', age: 432_000 },
  { kind: 'repayment', name: 'Repayment', detail: 'Loan #7 — interest', amount: '$28.40', symbol: 'USDC', time: '6d ago', age: 518_400 },
  { kind: 'score', name: 'Score update', detail: 'Repayment rate: 94%', amount: '+1 pt', time: '1w ago', age: 604_800 },
  { kind: 'deposit', name: 'Deposit', detail: 'Bluechip pool — 2.43% APY', amount: '$1,250.00', symbol: 'USDC', time: '1w ago', age: 691_200 },
  { kind: 'sponsor', name: 'Sponsorship received', detail: 'From M. Okafor', amount: '$8,000', time: '2w ago', age: 1_209_600 },
  { kind: 'loan', name: 'Loan repaid', detail: 'Loan #6 — closed', amount: '$3,400', symbol: 'USDC', time: '3w ago', age: 1_814_400 },
  { kind: 'score', name: 'Score update', detail: 'Collateral tier: 40% → 35%', amount: '+3 pts', time: '1mo ago', age: 2_592_000 },
  { kind: 'deposit', name: 'Deposit', detail: 'General pool — 2.72% APY', amount: '$2,500.00', symbol: 'USDC', time: '1mo ago', age: 2_678_400 },
  { kind: 'loan', name: 'Loan received', detail: 'Sponsored pool — 3.80% APR', amount: '$5,000', symbol: 'USDC', time: '2mo ago', age: 5_184_000 },
];

let nextId = 0;

/* -------------------------------------------------------------------------- */
/*  Shared live store                                                          */
/*                                                                            */
/*  A module-level singleton, not per-component state: every surface that      */
/*  renders the feed — the hero's desktop card, its mobile card, the dashboard */
/*  list, the Activity page — subscribes to the same stream, so they all show  */
/*  the identical events ticking in together, and exactly one pair of timers   */
/*  runs no matter how many components are mounted.                            */
/* -------------------------------------------------------------------------- */

let events: ProtocolEvent[] = SEED.map((event) => ({ ...event, id: `seed-${nextId++}` }));
const listeners = new Set<() => void>();
let started = false;

function emit() {
  listeners.forEach((listener) => listener());
}

/** Prepend a fresh event, capping the feed so a long session can't grow it unbounded. */
function tick() {
  events = [randomEvent(`live-${nextId++}`), ...events].slice(0, 60);
  emit();
}

/** Advance every event's age each minute, so relative times keep walking forward. */
function advanceAges() {
  events = events.map((event) => {
    const age = event.age + 60;
    return { ...event, age, time: ageLabel(age) };
  });
  emit();
}

function ensureStarted() {
  if (started || typeof window === 'undefined') return;
  started = true;
  setInterval(tick, TICK_INTERVAL_S * 1000);
  setInterval(advanceAges, 60_000);
}

/**
 * The live feed. Subscribes every consumer to the same simulated stream, so the hero
 * card, the dashboard and the Activity page always agree on what has happened.
 */
export function useLiveActivity(): ProtocolEvent[] {
  ensureStarted();
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const getSnapshot = useCallback(() => events, []);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** The most recent `limit` events, newest first. */
export function recentActivity(events: ProtocolEvent[], limit: number): ProtocolEvent[] {
  return events.slice(0, limit);
}

export type ActivityGroupLabel = 'Today' | 'This week' | 'Earlier';

/** Coarse bucket for the dashboard's grouped list. */
export function groupFor(age: number): ActivityGroupLabel {
  if (age < 86_400) return 'Today';
  if (age < 604_800) return 'This week';
  return 'Earlier';
}

export const GROUP_ORDER: ActivityGroupLabel[] = ['Today', 'This week', 'Earlier'];
