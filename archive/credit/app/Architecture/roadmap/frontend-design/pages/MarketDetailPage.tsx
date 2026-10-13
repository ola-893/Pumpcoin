import { motion } from 'motion/react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import PageHeader, { StatusNote } from '@/components/dashboard/PageHeader';
import TokenIcon from '@/components/TokenIcon';
import { SCORE } from '@/lib/protocol';
import { BORROW_POSITION, TIER_LADDER, resolveWalletState } from '@/lib/position';
import {
  MARKETS,
  POOLS,
  RATE_MODEL,
  RESERVE_FACTOR,
  borrowAprAt,
  formatApr,
  formatCompactUsd,
  formatFullUsd,
  marketDeposits,
  reserveBufferOf,
  supplyApy,
  supplyApyAt,
  utilizationOf,
  type Market,
} from '@/lib/markets';

const ease = [0.22, 1, 0.36, 1] as const;

function Card({
  title,
  right,
  children,
  delay = 0,
  className = '',
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const colors = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      className={`rounded-2xl border shadow-sm p-5 ${className}`}
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 mb-5">
          <span className="font-sans text-xs font-medium" style={{ color: colors.text }}>
            {title}
          </span>
          {right}
        </div>
      )}
      {children}
    </motion.div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  const colors = useTheme();
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>
        {label}
      </div>
      <div
        className="font-serif text-xl font-semibold tabular-nums leading-none"
        style={{ color: tone ?? colors.text }}
      >
        {value}
      </div>
      {hint && (
        <div className="font-mono text-[9px] mt-1.5" style={{ color: colors.textMuted }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * Two-slope rate curve: borrow APR and supply APY against utilization.
 *
 * The same shape Aave draws on its reserve pages, and worth drawing because it answers the
 * question a supplier actually has — "what happens to my rate as this pool fills up?" The
 * current utilization is marked, since the curve is useless without knowing where on it you
 * are.
 */
function RateModelChart({ market, live }: { market: Market; live: boolean }) {
  const colors = useTheme();

  const w = 660;
  const h = 260;
  const padL = 52;
  const padR = 16;
  const padY = 18;

  const yMax = 0.7;
  const current = utilizationOf(market);

  const x = (u: number) => padL + u * (w - padL - padR);
  const y = (rate: number) => padY + (1 - rate / yMax) * (h - padY * 2);

  const steps = Array.from({ length: 51 }, (_, i) => i / 50);
  const path = (fn: (u: number) => number) =>
    steps.map((u, i) => `${i === 0 ? 'M' : 'L'} ${x(u).toFixed(1)} ${y(fn(u)).toFixed(1)}`).join(' ');

  const yTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  const xTicks = [0, 0.25, 0.5, 0.75, 1];

  const borrowNow = borrowAprAt(current);
  const supplyNow = supplyApy(market);

  return (
    <Card
      title="Interest rate model"
      right={
        <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
          {live ? 'Borrow APR · Supply APY vs utilization' : 'Target curve · not yet deployed'}
        </span>
      }
      delay={0.25}
    >
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Interest rate model">
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padL} y1={y(tick)} x2={w - padR} y2={y(tick)} stroke={colors.border} strokeWidth="1" />
            <text x={padL - 8} y={y(tick) + 4} fontSize="11" textAnchor="end" fill={colors.textMuted} fontFamily="monospace">
              {(tick * 100).toFixed(0)}%
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <text key={tick} x={x(tick)} y={h - 2} fontSize="11" textAnchor="middle" fill={colors.textMuted} fontFamily="monospace">
            {(tick * 100).toFixed(0)}%
          </text>
        ))}

        {/* The kink — where rates start rising steeply. */}
        <line
          x1={x(RATE_MODEL.optimalUtilization)}
          y1={padY}
          x2={x(RATE_MODEL.optimalUtilization)}
          y2={h - padY}
          stroke={colors.textMuted}
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity="0.6"
        />
        <text
          x={x(RATE_MODEL.optimalUtilization) - 6}
          y={padY + 12}
          fontSize="11"
          textAnchor="end"
          fill={colors.textMuted}
          fontFamily="monospace"
        >
          optimal {(RATE_MODEL.optimalUtilization * 100).toFixed(0)}%
        </text>

        {/* Where the pool is right now. Meaningless before the market is deployed — a
            marker at 0% utilization would suggest a live pool sitting empty. */}
        {live && (
          <>
            <line x1={x(current)} y1={padY} x2={x(current)} y2={h - padY} stroke="#7C3AED" strokeWidth="1.5" />
            <circle cx={x(current)} cy={y(borrowNow)} r="4.5" fill="#BA7517" stroke="#FFFFFF" strokeWidth="2" />
            <circle cx={x(current)} cy={y(supplyNow)} r="4.5" fill="#639922" stroke="#FFFFFF" strokeWidth="2" />
          </>
        )}

        <motion.path
          d={path(borrowAprAt)}
          fill="none"
          stroke="#BA7517"
          strokeWidth="2.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, delay: 0.3, ease }}
        />
        <motion.path
          d={path(supplyApyAt)}
          fill="none"
          stroke="#639922"
          strokeWidth="2.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, delay: 0.45, ease }}
        />
      </svg>

      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 pt-4 border-t"
        style={{ borderColor: colors.border }}
      >
        <span className="flex items-center gap-2">
          <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: '#BA7517' }} />
          <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
            Borrow APR{live ? ` · ${formatApr(borrowNow)} now` : ''}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: '#639922' }} />
          <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
            Supply APY{live ? ` · ${formatApr(supplyNow)} now` : ''}
          </span>
        </span>
        <span className="font-mono text-[9px] ml-auto" style={{ color: colors.textMuted }}>
          Slope 1 {(RATE_MODEL.slope1 * 100).toFixed(2)}% · Slope 2{' '}
          {(RATE_MODEL.slope2 * 100).toFixed(0)}% · Reserve factor{' '}
          {(RESERVE_FACTOR * 100).toFixed(0)}%
        </span>
      </div>
    </Card>
  );
}

/**
 * What this asset's terms are at each score band.
 *
 * This is the section that makes the page Unora's rather than Aave's. On Aave the only lever
 * is how much collateral you post; here the lever is your score, and this table is the
 * conversion — the thing a borrower opens the page to read.
 */
function CreditTerms({ market }: { market: Market }) {
  const colors = useTheme();

  const rungs = [...TIER_LADDER].sort((a, b) => b.minScore - a.minScore);

  return (
    <Card
      title="Borrow terms by credit score"
      right={
        <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
          You are at {SCORE.value}
        </span>
      }
      delay={0.35}
    >
      <div className="space-y-2.5">
        {rungs.map((tier) => {
          const eligible = SCORE.value >= tier.minScore && SCORE.value >= market.minScore;
          return (
            <div
              key={tier.name}
              className="flex items-center gap-4 p-3.5 rounded-xl border"
              style={{
                borderColor: tier.state === 'current' ? tier.color : colors.border,
                backgroundColor: tier.state === 'current' ? tier.fill : 'transparent',
                opacity: eligible ? 1 : 0.55,
              }}
            >
              <div className="w-32 shrink-0">
                <div className="font-sans text-sm font-medium" style={{ color: colors.text }}>
                  {tier.name}
                </div>
                <div className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
                  score {tier.minScore}+
                </div>
              </div>

              <div className="flex-1 grid grid-cols-3 gap-4">
                <Stat label="Collateral" value={tier.ratio} />
                <Stat label="Ceiling" value={tier.ceiling} />
                <Stat
                  label="On a $10k loan"
                  value={`$${Math.round(10_000 * Number.parseInt(tier.ratio, 10) / 100).toLocaleString('en-US')} locked`}
                />
              </div>

              <div
                className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 rounded-full shrink-0"
                style={{ backgroundColor: `${tier.color}1F`, color: tier.color }}
              >
                {tier.state === 'current' ? 'Current' : eligible ? 'Available' : 'Locked'}
              </div>
            </div>
          );
        })}
      </div>

      <p className="font-mono text-[10px] mt-4 leading-relaxed" style={{ color: colors.textMuted }}>
        Rates come from the market, not your score. Your score moves the collateral ratio — the
        share of the loan you must lock — which is what changes your capital efficiency.
        {market.minScore > 0 && ` This market requires a score of ${market.minScore} or above.`}
      </p>
    </Card>
  );
}

export default function MarketDetailPage() {
  const colors = useTheme();
  const { symbol } = useParams();
  const { search } = useLocation();
  // Same rule as the dashboard: real wallet data by default, demo scenarios via ?state=.
  const demo = resolveWalletState(search);
  const position = new URLSearchParams(search).has('state')
    ? demo.position
    : { scored: false, lending: null };

  const market = MARKETS.find((m) => m.symbol.toLowerCase() === (symbol ?? '').toLowerCase());
  const pool = market ? POOLS.find((p) => p.id === market.pool) : undefined;

  if (!market || !pool) {
    return (
      <DashboardLayout>
        <PageHeader title="Market not found" subtitle="That asset is not listed on Unora." />
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <Link
            to="/borrow"
            className="inline-flex items-center gap-2 font-sans text-sm"
            style={{ color: '#7C3AED' }}
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Back to markets
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const deposits = marketDeposits(market);
  const utilization = utilizationOf(market);
  const buffer = reserveBufferOf(market);
  const cap = market.supplyCap;
  const isLive = market.status === 'live';

  // The wallet's exposure to this market.
  //
  // Deposits are USDC tranches, so a holding belongs to the USDC market whatever tranche it
  // sits in — matching on pool alone would show a USDC deposit as a WBTC supply. The borrow
  // position is a single USDC loan, so it matches on the reserve itself.
  const holding =
    market.symbol === 'USDC'
      ? (position.lending?.holdings.find((h) => h.pool === market.pool) ?? null)
      : null;
  const supplied = holding?.value ?? 0;
  const borrowed = position.scored && market.symbol === 'USDC' ? BORROW_POSITION.drawn : 0;
  const hasPosition = supplied > 0 || borrowed > 0;

  return (
    <DashboardLayout>
      <PageHeader
        title={market.symbol}
        subtitle={market.name}
        note={
          <StatusNote>
            {isLive
              ? `${pool.name} pool · live on Monad testnet`
              : `${pool.name} pool · not yet deployed`}
          </StatusNote>
        }
      >
        <Link
          to="/borrow"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border font-sans text-xs transition-colors hover:bg-white shadow-sm"
          style={{ borderColor: colors.border, color: colors.text }}
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          All markets
        </Link>
      </PageHeader>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-4">
        {/* Identity + headline figures */}
        <Card delay={0.05}>
          <div className="flex items-center gap-4 mb-5">
            <TokenIcon symbol={market.symbol} color={market.accent} size={44} />
            <div>
              <div className="font-serif text-xl" style={{ color: colors.text }}>
                {market.name}
              </div>
              <div className="font-mono text-[9px] mt-0.5" style={{ color: colors.textMuted }}>
                {pool.name} pool · {pool.riskNote}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-5 border-t" style={{ borderColor: colors.border }}>
            <Stat
              label="Total supplied"
              value={isLive ? formatCompactUsd(deposits) : '—'}
              hint={isLive ? formatFullUsd(deposits) : 'no liquidity yet'}
            />
            <Stat
              label="Total borrowed"
              value={isLive ? formatCompactUsd(market.totalBorrows) : '—'}
              hint={isLive ? formatFullUsd(market.totalBorrows) : 'no liquidity yet'}
            />
            <Stat
              label="Utilization"
              value={isLive ? `${(utilization * 100).toFixed(2)}%` : '—'}
              hint={isLive ? `optimal ${(RATE_MODEL.optimalUtilization * 100).toFixed(0)}%` : undefined}
              tone={isLive && utilization > RATE_MODEL.optimalUtilization ? '#BA7517' : undefined}
            />
            <Stat
              label="Reserve buffer"
              value={isLive ? `${(buffer * 100).toFixed(2)}%` : '—'}
              hint={isLive ? 'available to withdraw' : undefined}
              tone={isLive && buffer < 0.3 ? '#BA7517' : undefined}
            />
          </div>
        </Card>

        {/* Your position — only when there is one */}
        {hasPosition && (
          <Card title="Your position" delay={0.1}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat
                label="Supplied"
                value={supplied > 0 ? formatFullUsd(Math.round(supplied)) : '—'}
                hint={supplied > 0 ? `${formatApr(supplyApy(market))} APY` : 'not supplying'}
                tone={supplied > 0 ? '#639922' : undefined}
              />
              <Stat
                label="Borrowed"
                value={borrowed > 0 ? formatFullUsd(borrowed) : '—'}
                hint={borrowed > 0 ? `${formatApr(market.baseApr)} APR` : 'no open loan'}
                tone={borrowed > 0 ? '#BA7517' : undefined}
              />
              <Stat
                label="Net exposure"
                value={formatFullUsd(Math.round(supplied - borrowed))}
                hint={supplied >= borrowed ? 'net supplier' : 'net borrower'}
              />
            </div>
          </Card>
        )}

        <RateModelChart market={market} live={isLive} />

        {/* Supply / borrow parameters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Supply info" delay={0.3}>
            <div className="space-y-3.5">
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>
                  Supply APY
                </span>
                <span className="font-mono text-sm" style={{ color: '#639922' }}>
                  {isLive ? formatApr(supplyApy(market)) : '—'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>
                  Total supplied
                </span>
                <span className="font-mono text-sm" style={{ color: colors.text }}>
                  {isLive ? formatCompactUsd(deposits) : '—'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>
                  Supply cap
                </span>
                <span className="font-mono text-sm" style={{ color: colors.text }}>
                  {isLive ? formatCompactUsd(cap) : '—'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>
                  Cap used
                </span>
                <span className="font-mono text-sm" style={{ color: colors.text }}>
                  {isLive ? `${((deposits / cap) * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Borrow info" delay={0.35}>
            <div className="space-y-3.5">
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>
                  Borrow APR
                </span>
                <span className="font-mono text-sm" style={{ color: '#BA7517' }}>
                  {isLive ? formatApr(market.baseApr) : `${formatApr(market.baseApr)} target`}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>
                  Total borrowed
                </span>
                <span className="font-mono text-sm" style={{ color: colors.text }}>
                  {isLive ? formatCompactUsd(market.totalBorrows) : '—'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>
                  Minimum score
                </span>
                <span className="font-mono text-sm" style={{ color: colors.text }}>
                  {market.minScore === 0 ? 'Any' : market.minScore}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>
                  Available to borrow
                </span>
                <span className="font-mono text-sm" style={{ color: colors.text }}>
                  {isLive ? formatCompactUsd(market.liquidity) : '—'}
                </span>
              </div>
            </div>
          </Card>
        </div>

        <CreditTerms market={market} />

        {!isLive && (
          <div
            className="flex items-start gap-3 p-4 rounded-2xl border"
            style={{ borderColor: colors.border, backgroundColor: 'rgba(186,117,23,0.05)' }}
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#BA7517' }} strokeWidth={1.5} />
            <p className="font-sans text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
              {market.symbol} is on the roadmap but not deployed. On Monad testnet only USDC is
              live, so these figures are targets rather than current state — nothing here can be
              supplied or borrowed yet.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
