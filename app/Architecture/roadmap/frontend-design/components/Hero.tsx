import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';
import { POSITION_TONES, BORROW_POSITION } from '@/lib/position';
import { KIND_META, tokenAccent, useLiveActivity } from '@/lib/activity';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';
import TokenIcon from '@/components/TokenIcon';

import { PROTOCOL } from '@/lib/protocol';

const ease = [0.22, 1, 0.36, 1] as const;

/** How far into the 90-day term the hero's demo loan has streamed. */
const STREAMED_DAYS = 30;

/** The card chrome, shared by the floating and in-flow arrangements. */
const CARD_SHELL =
  'rounded-2xl bg-white/90 backdrop-blur-sm border border-white/60 shadow-[0_12px_48px_rgba(124,58,237,0.1)] overflow-hidden';

function FloatingCard({
  children,
  className,
  rotate,
  delay,
  fromX = 0,
  fromY = 40,
  ready,
}: {
  children: React.ReactNode;
  className?: string;
  rotate: number;
  delay: number;
  fromX?: number;
  fromY?: number;
  ready: boolean;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setEntered(true), (delay + 0.9) * 1000);
    return () => clearTimeout(timer);
  }, [delay, ready]);

  return (
    <motion.div
      className={`absolute ${className}`}
      initial={{ opacity: 0, y: fromY, x: fromX, rotate: rotate - 2, scale: 0.95 }}
      animate={
        !ready
          ? { opacity: 0, y: fromY, x: fromX, rotate: rotate - 2, scale: 0.95 }
          : entered
            ? {
                opacity: 1,
                y: [0, -5, 0],
                x: 0,
                rotate: [rotate, rotate + 0.5, rotate],
                scale: 1,
              }
            : { opacity: 1, y: 0, x: 0, rotate, scale: 1 }
      }
      transition={
        entered
          ? { y: { duration: 4, repeat: Infinity, ease: 'easeInOut' }, rotate: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }
          : { duration: 0.9, delay, ease }
      }
    >
      <div className={CARD_SHELL}>{children}</div>
    </motion.div>
  );
}

/**
 * A card back peeking in from the edge of a phone screen.
 *
 * Below `lg` the main card takes the middle and these sit behind it, half off-screen, so the
 * arrangement keeps the depth of the desktop stage without stacking five cards into a page
 * three screens long.
 *
 * These are deliberately **not** the real cards. At a ~50px sliver, a real card's contents
 * truncate into "Str…" and "$8" — worse than showing nothing. A tinted back with the mark and
 * the card's name reads as "there are more cards" at any width, which is the whole job here.
 */
function PeekCard({
  label,
  tone,
  side,
  top,
  rotate,
  delay,
  ready,
}: {
  label: string;
  tone: { color: string; fill: string };
  side: 'left' | 'right';
  top: string;
  rotate: number;
  delay: number;
  ready: boolean;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setEntered(true), (delay + 0.9) * 1000);
    return () => clearTimeout(timer);
  }, [delay, ready]);

  const from = side === 'left' ? -80 : 80;

  return (
    <motion.div
      className="absolute w-[132px] h-[172px] rounded-2xl border shadow-[0_12px_48px_rgba(124,58,237,0.14)] pointer-events-none select-none overflow-hidden"
      style={{ top, [side]: '-82px', backgroundColor: tone.fill, borderColor: tone.color }}
      initial={{ opacity: 0, x: from, rotate: rotate * 1.7, scale: 0.8 }}
      animate={
        entered
          ? { opacity: 1, x: 0, scale: 0.86, rotate: [rotate, rotate + 1.6, rotate], y: [0, -8, 0] }
          : { opacity: 0, x: from, rotate: rotate * 1.7, scale: 0.8 }
      }
      transition={
        entered
          ? {
              opacity: { duration: 0.7, delay, ease },
              x: { duration: 0.85, delay, ease },
              scale: { duration: 0.85, delay, ease },
              y: { duration: 5.5, repeat: Infinity, ease: 'easeInOut' },
              rotate: { duration: 6.5, repeat: Infinity, ease: 'easeInOut' },
            }
          : { duration: 0.85, delay, ease }
      }
    >
      <div className="p-3 h-full flex flex-col justify-between">
        <img src="/Unora icon.png" alt="" className="h-4 w-auto opacity-80" />
        <span
          className="font-mono text-[8px] uppercase tracking-widest leading-relaxed"
          style={{ color: tone.color }}
        >
          {label}
        </span>
      </div>
    </motion.div>
  );
}

function AnimatedBar({ width, delay, color, ready }: { width: string; delay: number; color: string; ready: boolean }) {
  return (
    <motion.div
      className="h-full rounded-full"
      style={{ background: color }}
      initial={{ width: '0%' }}
      animate={ready ? { width } : { width: '0%' }}
      transition={{ duration: 1, delay, ease }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Card contents — shared by both arrangements                               */
/*                                                                            */
/*  All bodies pull from the live activity stream (lib/activity.ts) with      */
/*  count-up numbers, so the hero's five cards tell one consistent story      */
/*  that keeps moving while you watch.                                        */
/* -------------------------------------------------------------------------- */

function ScoreCardBody({ ready }: { ready: boolean }) {
  const colors = useTheme();
  const live = useLiveActivity();
  // Score drifts up with every score event in the shared feed.
  const scoreEvents = live.filter((event) => event.kind === 'score').length;
  // A slow demonstration drift (+1pt/min, capped) keeps the score moving between
  // score events landing in the feed.
  const [drift, setDrift] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDrift((d) => Math.min(d + 1, 15)), 60_000);
    return () => clearInterval(timer);
  }, []);
  const scoreValue = 72 + scoreEvents + drift;
  // Delays start after the card's float-in finishes (~2s); `paused: !ready` stops the
  // count-up being spent invisibly behind the loading screen.
  const score = useAnimatedNumber(scoreValue, {
    duration: 1.4,
    delay: ready ? 2.0 : 0,
    paused: !ready,
    format: (v) => String(Math.round(v)),
  });
  const pts = useAnimatedNumber(4 + scoreEvents + drift, {
    duration: 1.2,
    delay: ready ? 2.2 : 0,
    paused: !ready,
    format: (v) => `+${Math.round(v)} this week`,
  });
  const barWidth = useAnimatedNumber(scoreValue, {
    duration: 1.4,
    delay: ready ? 2.0 : 0,
    paused: !ready,
    format: (v) => `${Math.round(v)}%`,
  });

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>Credit Score</span>
        <motion.div
          className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={ready ? { scale: 1 } : { scale: 0 }}
          transition={{ duration: 0.4, delay: 1.4, ease }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
        </motion.div>
      </div>
      <div className="flex items-end gap-2 mb-1">
        <span className="font-serif text-4xl font-semibold tabular-nums" style={{ color: colors.text }}>{score}</span>
        <motion.span
          className="font-sans text-xs font-medium text-green-500 mb-1 tabular-nums"
          initial={{ opacity: 0, x: -5 }}
          animate={ready ? { opacity: 1, x: 0 } : { opacity: 0, x: -5 }}
          transition={{ duration: 0.4, delay: 1.5, ease }}
        >
          {pts}
        </motion.span>
      </div>
      <div className="font-mono text-[9px] mb-4" style={{ color: colors.textMuted }}>Top 28% of borrowers</div>
      <div className="h-2 rounded-full bg-purple-100 overflow-hidden">
        <AnimatedBar width={barWidth} delay={2.0} color="linear-gradient(90deg, #7C3AED, #A78BFA)" ready={ready} />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="font-mono text-[8px]" style={{ color: colors.textMuted }}>0</span>
        <span className="font-mono text-[8px]" style={{ color: colors.textMuted }}>100</span>
      </div>
    </div>
  );
}

function LendingCardBody({ ready }: { ready: boolean }) {
  const colors = useTheme();
  const live = useLiveActivity();
  // Deposits in the feed grow the balance; interest accrues second by second.
  const depositCount = live.filter((event) => event.kind === 'deposit').length;
  const [mountedAt] = useState(() => Date.now());
  const [interest, setInterest] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      // Demonstration accrual at a visible rate (~$0.60/min — a cent a second).
      // Real per-second compounding of 4.2% APY moves the fifth decimal place —
      // mathematically honest but reads as a frozen number at 2dp.
      const secondsHeld = (Date.now() - mountedAt) / 1000;
      setInterest(secondsHeld * 0.01);
    }, 1000);
    return () => clearInterval(timer);
  }, [mountedAt]);

  // Anchored to the dashboard's canonical deposit position: $12,500 value incl. $500
  // yield — the same figures the Deposit page's "Your deposits" card shows.
  const balance = useAnimatedNumber(12_500 + depositCount * 500 + interest, {
    duration: 1.1,
    delay: ready ? 2.1 : 0,
    paused: !ready,
    format: (v) =>
      `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  });
  const earned = useAnimatedNumber(500 + interest, {
    duration: 1.1,
    delay: ready ? 2.3 : 0,
    paused: !ready,
    format: (v) =>
      `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  });

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>Your Deposit</span>
        <motion.span
          className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-600"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={ready ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.4, delay: 1.6, ease }}
        >
          Earning
        </motion.span>
      </div>
      <div
        className="font-serif text-2xl font-semibold mb-0.5 tabular-nums"
        style={{ color: colors.text }}
      >
        {balance}
      </div>
      <div className="font-mono text-[9px] mb-4" style={{ color: colors.textMuted }}>in General Pool</div>
      <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-widest" style={{ color: colors.textMuted }}>APY</div>
          <div className="font-serif text-lg font-semibold" style={{ color: '#7C3AED' }}>4.2%</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[8px] uppercase tracking-widest" style={{ color: colors.textMuted }}>Earned</div>
          <div className="font-serif text-lg font-semibold tabular-nums" style={{ color: colors.text }}>{earned}</div>
        </div>
      </div>
    </div>
  );
}

function ActivityCardBody({ ready }: { ready: boolean }) {
  const colors = useTheme();
  const live = useLiveActivity();

  const streamCount = live.filter((event) => event.kind === 'stream').length;
  const depositCount = live.filter((event) => event.kind === 'deposit').length;
  const loanCount = live.filter((event) => event.kind === 'loan').length;

  const score = useAnimatedNumber(72 + live.filter((e) => e.kind === 'score').length, {
    duration: 1.4,
    delay: ready ? 1.2 : 0,
    paused: !ready,
    format: (v) => String(Math.round(v)),
  });
  const loaned = useAnimatedNumber(BORROW_POSITION.drawn + loanCount * 500, {
    duration: 1.2,
    delay: ready ? 1.3 : 0,
    paused: !ready,
    format: (v) => `$${(v / 1000).toFixed(1)}k`,
  });
  const deposited = useAnimatedNumber(12_500 + depositCount * 500, {
    duration: 1.2,
    delay: ready ? 1.4 : 0,
    paused: !ready,
    format: (v) => `$${(v / 1000).toFixed(1)}k`,
  });
  const streams = useAnimatedNumber(3 + streamCount, {
    duration: 0.9,
    delay: ready ? 1.5 : 0,
    paused: !ready,
    format: (v) => String(Math.round(v)),
  });

  return (
    <div className="p-4 sm:p-6">
      {/* Header. "Filters" is dropped below `sm` — at a ~290px card the title, the live badge
          and the filters chip together push the title into an ellipsis. */}
      <div className="flex items-center justify-between gap-2 mb-4 sm:mb-5">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src="/Unora icon.png" alt="" className="h-4 sm:h-5 w-auto shrink-0" />
          <span className="font-sans text-xs sm:text-sm font-medium truncate" style={{ color: colors.text }}>
            Activity Dashboard
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <motion.span
            className="font-mono text-[8px] px-2 sm:px-2.5 py-1 rounded-full bg-purple-100 text-purple-600"
            initial={{ opacity: 0 }}
            animate={ready ? { opacity: [0, 1, 0.7, 1] } : { opacity: 0 }}
            transition={{ duration: 1.5, delay: 1.8, ease }}
          >
            Live
          </motion.span>
          <span className="hidden sm:inline-block font-mono text-[8px] px-2.5 py-1 rounded-full bg-white/60 border border-white/40" style={{ color: colors.textMuted }}>Filters</span>
        </div>
      </div>

      {/* Search */}
      <motion.div
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/60 border border-white/40 mb-4 sm:mb-5"
        initial={{ opacity: 0, scaleX: 0.9 }}
        animate={ready ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0.9 }}
        transition={{ duration: 0.5, delay: 1.2, ease }}
      >
        <div className="w-3.5 h-3.5 rounded-full bg-gray-300" />
        <span className="font-sans text-xs truncate" style={{ color: colors.textMuted }}>Search in activities...</span>
      </motion.div>

      {/* Stats row — values tick up from the live feed. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-4 sm:mb-5">
        {[
          { label: 'Score', value: score, sub: '+4', subColor: '#22C55E' },
          { label: 'Loaned', value: loaned, sub: '4.2% APR', subColor: colors.textMuted },
          { label: 'Deposited', value: deposited, sub: '+4.2%', subColor: '#22C55E' },
          { label: 'Streams', value: streams, sub: 'active', subColor: colors.textMuted },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            className="p-3 rounded-xl bg-white/60 border border-white/40"
            initial={{ opacity: 0, y: 15 }}
            animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
            transition={{ duration: 0.5, delay: 1.3 + i * 0.08, ease }}
          >
            <div className="font-mono text-[7px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>{stat.label}</div>
            <div className="font-serif text-xl font-semibold tabular-nums" style={{ color: colors.text }}>{stat.value}</div>
            <div className="font-mono text-[7px]" style={{ color: stat.subColor }}>{stat.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Activity list — new events slide in at the top as the feed ticks. */}
      <div className="space-y-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {live.slice(0, 4).map((event, i) => {
            const meta = KIND_META[event.kind];
            const Icon = meta.Icon;
            const accent = event.symbol ? tokenAccent(event.symbol) : meta.color;
            const isUp = !event.amount.startsWith('-');
            return (
              <motion.div
                key={event.id}
                layout
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/40 border border-white/30"
                initial={{ opacity: 0, y: -14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                transition={{ duration: 0.45, delay: ready ? Math.max(1.6 - i * 0.35, 0) + i * 0.08 : 0, ease }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Real token marks where the event moved an asset — the same badges the
                      Borrow and Deposit tables use — and the kind's icon otherwise. */}
                  {event.symbol ? (
                    <TokenIcon symbol={event.symbol} color={accent} size={32} />
                  ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: accent + '15', color: accent }}>
                      <Icon className="w-4 h-4" strokeWidth={1.5} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-sans text-xs font-medium truncate" style={{ color: colors.text }}>{event.name}</div>
                    <div className="font-mono text-[9px] truncate" style={{ color: colors.textMuted }}>{event.detail}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-medium tabular-nums" style={{ color: isUp ? '#22C55E' : accent }}>{event.amount}</div>
                  <div className="font-mono text-[8px]" style={{ color: colors.textMuted }}>{event.time}</div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LoanCardBody({ ready }: { ready: boolean }) {
  const colors = useTheme();
  const live = useLiveActivity();
  // Repayments shrink what's left of the loan; the bar tracks the feed.
  const repaidCount = live.filter((event) => event.kind === 'repayment').length;
  // The repayment stream drips continuously (~$1.20/min) on top of the repayment
  // events landing in the feed, so the bar is never fully still.
  const [dripSeconds, setDripSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDripSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);  // Anchored to the dashboard's canonical loan (BORROW_POSITION): $5,000 principal +
  // $88.40 interest to date = $5,088.40 owed — the same figures the RepayDialog quotes.
  // The stream has been running for a third of the 90-day term, so repaid starts there and
  // keeps climbing with repayment events plus the per-second drip: the bar is never still.
  const totalOwed = BORROW_POSITION.drawn + BORROW_POSITION.interestPaid;
  const streamed = (totalOwed * STREAMED_DAYS) / PROTOCOL.termDays;
  const repaidValue = streamed + repaidCount * 45 + dripSeconds * 0.02;
  const repaid = useAnimatedNumber(repaidValue, {
    duration: 1.2,
    delay: ready ? 2.2 : 0,
    paused: !ready,
    format: (v) =>
      `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  });
  const remaining = useAnimatedNumber(totalOwed - repaidValue, {
    duration: 1.2,
    delay: ready ? 2.2 : 0,
    paused: !ready,
    format: (v) =>
      `$${Math.max(v, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  });
  const pct = Math.min((repaidValue / totalOwed) * 100, 100);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>Active Loan</span>
        <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-600">Streaming</span>
      </div>
      <div className="font-serif text-2xl font-semibold mb-0.5 tabular-nums" style={{ color: colors.text }}>
        ${BORROW_POSITION.drawn.toLocaleString('en-US')}.00
      </div>
      <div className="font-mono text-[9px] mb-4" style={{ color: colors.textMuted }}>
        {`${(BORROW_POSITION.apr * 100).toFixed(1)}% APR · ${(BORROW_POSITION.collateralRatio * 100).toFixed(0)}% collateral`}
      </div>
      <div className="space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="font-sans text-[10px]" style={{ color: colors.textMuted }}>Repaid</span>
          <span className="font-mono text-[10px] font-medium tabular-nums" style={{ color: colors.text }}>{repaid}</span>
        </div>
        <div className="h-1.5 rounded-full bg-purple-100 overflow-hidden">
          <AnimatedBar width={`${pct}%`} delay={2.2} color="#4ADE80" ready={ready} />
        </div>
        <div className="flex justify-between items-center">
          <span className="font-sans text-[10px]" style={{ color: colors.textMuted }}>Remaining</span>
          <span className="font-mono text-[10px] font-medium tabular-nums" style={{ color: colors.text }}>{remaining}</span>
        </div>
      </div>
    </div>
  );
}

function YieldCardBody({ ready }: { ready: boolean }) {
  const colors = useTheme();
  const live = useLiveActivity();
  // Total yield climbs with deposits in the feed; bars mirror the weekly series.
  const depositCount = live.filter((event) => event.kind === 'deposit').length;
  // Yield accrues continuously (~$7/min) on top of the deposit events landing.
  const [dripSeconds, setDripSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDripSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  // Anchored to the wallet's cumulative yield (YIELD_SERIES ends at $500), climbing with
  // deposit events and the demonstration accrual.
  const total = useAnimatedNumber(500 + depositCount * 12.4 + dripSeconds * 0.12, {
    duration: 1.3,
    delay: ready ? 2.2 : 0,
    paused: !ready,
    format: (v) =>
      `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  });
  const weekly = [35, 50, 40, 65, 55, 75, 60, 80, 70, 85, 78, 90];

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>Yield History</span>
        <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-white/60 border border-white/40" style={{ color: colors.textMuted }}>Weekly</span>
      </div>
      <div className="font-serif text-xl font-semibold mb-4 tabular-nums" style={{ color: colors.text }}>{total}</div>
      <div className="flex items-end gap-1 h-16 mb-3">
        {weekly.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-sm"
            style={{ backgroundColor: i >= 10 ? '#7C3AED' : '#DDD6FE' }}
            initial={{ height: '0%' }}
            animate={ready ? { height: `${h}%` } : { height: '0%' }}
            transition={{ duration: 0.6, delay: 2.2 + i * 0.04, ease }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        <span className="font-mono text-[8px]" style={{ color: colors.textMuted }}>12 weeks ago</span>
        <span className="font-mono text-[8px]" style={{ color: colors.textMuted }}>Today</span>
      </div>
    </div>
  );
}

export default function Hero({ ready }: { ready: boolean }) {
  const containerRef = useRef<HTMLElement>(null);
  const colors = useTheme();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 60]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-[100vh] overflow-hidden flex flex-col justify-center pt-24 pb-20"
    >
      {/* Center content */}
      <motion.div
        className="relative z-10 px-6 max-w-4xl mx-auto text-center"
        style={{ opacity, y }}
      >
        <motion.h1
          className="font-serif text-4xl sm:text-5xl lg:text-6xl xl:text-7xl leading-[1.1] tracking-[-0.02em] mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.7, delay: 0.3, ease }}
          style={{ color: colors.text }}
        >
          Borrow. Lend. Build trust.
          <br />
          with <span style={{ color: '#7C3AED' }}>Unora</span>
        </motion.h1>

        <motion.p
          className="font-sans text-base sm:text-lg max-w-xl mx-auto leading-relaxed mb-8"
          style={{ color: colors.textSecondary }}
          initial={{ opacity: 0, y: 15 }}
          animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.6, delay: 0.6, ease }}
        >
          The onchain credit score for DeFi. Borrowers get lower collateral requirements.
          Lenders earn yield from score-verified pools.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
          initial={{ opacity: 0, y: 15 }}
          animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.6, delay: 0.8, ease }}
        >
          <Link
            to="/lend"
            className="inline-flex items-center gap-2 px-7 py-3 font-sans text-sm font-medium rounded-full transition-all duration-300 hover:opacity-90 shadow-lg"
            style={{ backgroundColor: '#7C3AED', color: 'white' }}
          >
            Borrow with less
          </Link>
          <Link
            to="/lend"
            className="inline-flex items-center gap-2 px-7 py-3 font-sans text-sm font-medium rounded-full bg-white/70 border border-white/50 transition-all duration-300 hover:bg-white/90"
            style={{ color: '#7C3AED' }}
          >
            Earn yield
          </Link>
        </motion.div>
      </motion.div>

      {/* Floating product cards — `lg` and up.
          The arrangement is absolutely positioned across a 1400px stage, which a phone has no
          room for: below `lg` these would land on top of each other. They are not hidden below
          it — the same five cards are rendered in flow underneath instead. */}
      <div className="relative z-10 w-full max-w-[1400px] mx-auto h-[550px] mt-6 hidden lg:block">
        <FloatingCard className="top-[5%] left-[2%] w-52" rotate={-3} delay={0.9} fromX={-40} ready={ready}>
          <ScoreCardBody ready={ready} />
        </FloatingCard>

        <FloatingCard className="top-[52%] left-[1%] w-56" rotate={2} delay={1.1} fromX={-40} ready={ready}>
          <LendingCardBody ready={ready} />
        </FloatingCard>

        <FloatingCard className="bottom-[0%] left-1/2 -translate-x-1/2 w-[92%] max-w-2xl" rotate={0} delay={1.0} fromY={50} ready={ready}>
          <ActivityCardBody ready={ready} />
        </FloatingCard>

        <FloatingCard className="top-[2%] right-[2%] w-52" rotate={3} delay={1.0} fromX={40} ready={ready}>
          <LoanCardBody ready={ready} />
        </FloatingCard>

        <FloatingCard className="top-[48%] right-[1%] w-56" rotate={-2} delay={1.2} fromX={40} ready={ready}>
          <YieldCardBody ready={ready} />
        </FloatingCard>
      </div>

      {/* Below `lg`: one main card, with the others peeking in from the edges.
          Unhiding the desktop stage is not an option — it is absolutely positioned across
          1400px, so on a phone the cards land on top of each other. Stacking all five instead
          made the hero three screens long.

          The main card is inset by 52px a side, which is exactly how much of a card back
          shows. No container padding here: the gutter *is* the peek, so it has to be exact. */}
      <div className="relative z-10 w-full max-w-[1400px] mx-auto mt-12 lg:hidden">
        <PeekCard label="Score" tone={POSITION_TONES.score} side="left" top="3%" rotate={-8} delay={1.0} ready={ready} />
        <PeekCard label="Deposit" tone={POSITION_TONES.deposit} side="left" top="58%" rotate={-6} delay={1.15} ready={ready} />
        <PeekCard label="Loan" tone={POSITION_TONES.borrow} side="right" top="12%" rotate={7} delay={1.05} ready={ready} />
        <PeekCard label="Yield" tone={POSITION_TONES.deposit} side="right" top="66%" rotate={5} delay={1.2} ready={ready} />

        {/* In flow, so it sets the height everything else is positioned against. */}
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={ready ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 28, scale: 0.97 }}
          transition={{ duration: 0.7, delay: 0.9, ease }}
          className={`relative z-10 mx-auto w-[calc(100%-104px)] ${CARD_SHELL}`}
        >
          <ActivityCardBody ready={ready} />
        </motion.div>
      </div>
    </section>
  );
}
