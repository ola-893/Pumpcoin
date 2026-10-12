import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowUpRight, ExternalLink, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  PROTOCOL,
  SCORE,
  COLLATERAL_TOKEN,
  collateralFor,
  streamRatePerSecond,
  totalRepayable,
  formatUsd,
  formatPercent,
} from '@/lib/protocol';
import { MONAD_TESTNET } from '@/lib/chains';
import type { Market } from '@/lib/markets';

const ease = [0.22, 1, 0.36, 1] as const;

interface Props {
  amount: number;
  /** Simulated tx hash for the mock borrow call. */
  txHash?: string;
  /** Reserve being drawn from. Drives the rate and the denomination. */
  market?: Market;
}

export default function LoanActiveStep({ amount, txHash, market }: Props) {
  const colors = useTheme();
  const [elapsed, setElapsed] = useState(0);

  const apr = market?.baseApr ?? PROTOCOL.apr;
  const symbol = market?.symbol ?? 'USDC';

  // Repayment streams per second, so the counter genuinely ticks rather than
  // animating a fixed bar. Matches how StreamManager emits StreamTick events.
  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const rate = streamRatePerSecond(amount, apr);
  const total = totalRepayable(amount, apr);
  const repaid = Math.min(rate * elapsed, total);
  const progress = total > 0 ? repaid / total : 0;
  const collateral = collateralFor(amount);

  const projectedScore = Math.min(SCORE.value + 6, 100);

  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-6 items-start">
      {/* Stream */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease }}
        className="rounded-2xl border shadow-sm p-6"
        style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping" style={{ backgroundColor: '#639922' }} />
              <span className="relative inline-flex w-2 h-2 rounded-full" style={{ backgroundColor: '#639922' }} />
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
              Streaming
            </span>
          </div>
          <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
            Loan #{SCORE.nftId + 1}
          </span>
        </div>

        <div className="font-sans text-xs mb-1" style={{ color: colors.textSecondary }}>Repaid so far</div>
        <div className="flex items-baseline gap-2 mb-6">
          <span className="font-serif text-4xl font-semibold tabular-nums" style={{ color: colors.text }}>
            {repaid.toFixed(6)}
          </span>
          <span className="font-mono text-xs" style={{ color: colors.textMuted }}>{symbol}</span>
        </div>

        {/* Progress */}
        <div className="mb-2">
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(124,58,237,0.12)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: '#7C3AED' }}
              animate={{ width: `${Math.max(progress * 100, 0.4)}%` }}
              transition={{ duration: 0.4, ease }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mb-6">
          <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
            {formatPercent(progress, 4)} repaid
          </span>
          <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
            {formatUsd(total, 2)} total
          </span>
        </div>

        {/* Term timeline */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            {[0, 30, 60, 90].map((day) => (
              <span key={day} className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
                Day {day}
              </span>
            ))}
          </div>
          <div className="relative h-px" style={{ backgroundColor: colors.border }}>
            <div
              className="absolute -top-[3px] w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: '#7C3AED', left: '0%' }}
            />
          </div>
        </div>

        <div className="pt-5 border-t space-y-3" style={{ borderColor: colors.border }}>
          {[
            { label: 'Stream rate', value: `${rate.toFixed(6)} ${symbol} / sec` },
            { label: 'Collateral locked', value: `${formatUsd(collateral)} ${COLLATERAL_TOKEN.symbol}` },
            { label: 'Term', value: `${PROTOCOL.termDays} days` },
          ].map((row) => (
            <div key={row.label} className="flex items-baseline justify-between">
              <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>{row.label}</span>
              <span className="font-mono text-xs tabular-nums" style={{ color: colors.text }}>{row.value}</span>
            </div>
          ))}
        </div>

        {txHash && (
          <a
            href={`${MONAD_TESTNET.explorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex items-center gap-2 font-mono text-[10px] transition-opacity hover:opacity-70"
            style={{ color: '#7C3AED' }}
          >
            <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </a>
        )}
      </motion.div>

      {/* Score impact + next */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease }}
        className="rounded-2xl border shadow-sm p-6"
        style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
      >
        <div className="flex items-center gap-2 mb-5">
          <CheckCircle2 className="w-4 h-4" style={{ color: '#639922' }} strokeWidth={1.5} />
          <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
            Loan live
          </span>
        </div>

        <p className="font-sans text-sm mb-6 leading-relaxed" style={{ color: colors.textSecondary }}>
          {formatUsd(amount)} has been released from the pool and the repayment stream is running. No action
          needed — it repays itself.
        </p>

        {/* Score impact */}
        <div className="p-4 rounded-xl mb-5" style={{ backgroundColor: 'rgba(124,58,237,0.04)' }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
              Score impact
            </span>
          </div>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="font-serif text-2xl font-semibold" style={{ color: colors.text }}>{SCORE.value}</span>
            <ArrowUpRight className="w-4 h-4" style={{ color: '#639922' }} strokeWidth={1.5} />
            <span className="font-serif text-2xl font-semibold" style={{ color: '#639922' }}>{projectedScore}</span>
          </div>
          <div className="font-sans text-[11px] leading-relaxed" style={{ color: colors.textMuted }}>
            Projected on full repayment. Every successful stream tick updates the score positively via
            Chainlink CRE.
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {[
            { label: 'Next collateral tier', value: '30%', hint: 'at score 78' },
            { label: 'Ceiling increase', value: '+$2,100', hint: 'estimated' },
          ].map((row) => (
            <div key={row.label} className="flex items-baseline justify-between">
              <div>
                <div className="font-sans text-xs" style={{ color: colors.textSecondary }}>{row.label}</div>
                <div className="font-mono text-[9px]" style={{ color: colors.textMuted }}>{row.hint}</div>
              </div>
              <span className="font-mono text-xs" style={{ color: '#639922' }}>{row.value}</span>
            </div>
          ))}
        </div>

        <Link
          to="/dashboard"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: '#7C3AED', color: '#FFFFFF' }}
        >
          Back to dashboard
        </Link>
      </motion.div>
    </div>
  );
}
