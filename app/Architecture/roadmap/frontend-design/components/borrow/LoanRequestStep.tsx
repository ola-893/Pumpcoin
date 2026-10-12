import { motion } from 'motion/react';
import { ArrowRight, Info } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  PROTOCOL,
  COLLATERAL_TOKEN,
  collateralFor,
  interestFor,
  streamRatePerSecond,
  totalRepayable,
  formatUsd,
  formatPercent,
} from '@/lib/protocol';
import type { Market } from '@/lib/markets';

const ease = [0.22, 1, 0.36, 1] as const;

interface Props {
  amount: number;
  onAmountChange: (value: number) => void;
  onContinue: () => void;
  /** Reserve being drawn from. Drives the rate and the denomination. */
  market?: Market;
}

export default function LoanRequestStep({ amount, onAmountChange, onContinue, market }: Props) {
  const colors = useTheme();

  const apr = market?.baseApr ?? PROTOCOL.apr;
  const symbol = market?.symbol ?? 'USDC';

  // Two independent caps. The lower one binds, and which one it is matters — the
  // ceiling comes from the score, the collateral cap from the wallet balance.
  const maxByCeiling = PROTOCOL.loanCeiling;
  const maxByCollateral = COLLATERAL_TOKEN.balance / PROTOCOL.collateralRatio;
  const maxAmount = Math.min(maxByCeiling, maxByCollateral);
  const bindingCap = maxByCollateral < maxByCeiling ? 'collateral balance' : 'credit ceiling';

  const collateral = collateralFor(amount);
  const interest = interestFor(amount, apr);
  const total = totalRepayable(amount, apr);
  const rate = streamRatePerSecond(amount, apr);

  const tooSmall = amount < PROTOCOL.minLoan;
  const tooLarge = amount > maxAmount;
  const valid = !tooSmall && !tooLarge;

  const ceilingUsed = Math.min(amount / maxByCeiling, 1);
  const collateralUsed = Math.min(collateral / COLLATERAL_TOKEN.balance, 1);

  function handleInput(raw: string) {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (cleaned === '') {
      onAmountChange(0);
      return;
    }
    const next = Number(cleaned);
    if (!Number.isNaN(next)) onAmountChange(next);
  }

  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-6 items-start">
      {/* Amount */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease }}
        className="rounded-2xl border shadow-sm p-6"
        style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
      >
        <div className="font-mono text-[9px] uppercase tracking-widest mb-4" style={{ color: colors.textMuted }}>
          Loan amount
        </div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-serif text-3xl" style={{ color: colors.textMuted }}>$</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount === 0 ? '' : amount.toLocaleString('en-US')}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="0"
            aria-label={`Loan amount in ${symbol}`}
            className="font-serif text-5xl font-semibold bg-transparent outline-none w-full tabular-nums"
            style={{ color: colors.text }}
          />
        </div>

        <div className="font-sans text-xs mb-6" style={{ color: colors.textMuted }}>
          {formatUsd(amount)} {symbol} · {PROTOCOL.termDays}-day term
        </div>

        {/* Presets */}
        <div className="flex items-center gap-2 mb-6">
          {[0.25, 0.5, 0.75, 1].map((fraction) => {
            const preset = Math.floor(maxAmount * fraction);
            const isActive = Math.round(amount) === preset;
            return (
              <button
                key={fraction}
                onClick={() => onAmountChange(preset)}
                className="px-3 py-1.5 rounded-lg font-mono text-[10px] transition-colors"
                style={{
                  backgroundColor: isActive ? '#7C3AED' : 'rgba(124,58,237,0.07)',
                  color: isActive ? '#FFFFFF' : '#7C3AED',
                }}
              >
                {fraction === 1 ? 'Max' : `${fraction * 100}%`}
              </button>
            );
          })}
        </div>

        {/* Slider */}
        <input
          type="range"
          min={PROTOCOL.minLoan}
          max={Math.floor(maxAmount)}
          step={50}
          value={Math.min(amount, maxAmount)}
          onChange={(e) => onAmountChange(Number(e.target.value))}
          aria-label="Loan amount slider"
          className="w-full mb-6 accent-[#7C3AED]"
        />

        {/* Ceiling usage */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
              Credit ceiling used
            </span>
            <span className="font-mono text-[10px]" style={{ color: colors.text }}>
              {formatUsd(amount)} / {formatUsd(maxByCeiling)}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(124,58,237,0.12)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: '#7C3AED' }}
              animate={{ width: `${ceilingUsed * 100}%` }}
              transition={{ duration: 0.25, ease }}
            />
          </div>
        </div>

        {/* Collateral coverage */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
              Collateral balance used
            </span>
            <span className="font-mono text-[10px]" style={{ color: colors.text }}>
              {formatUsd(collateral)} / {formatUsd(COLLATERAL_TOKEN.balance)}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(124,58,237,0.12)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: tooLarge ? '#BA7517' : '#A78BFA' }}
              animate={{ width: `${collateralUsed * 100}%` }}
              transition={{ duration: 0.25, ease }}
            />
          </div>
        </div>
      </motion.div>

      {/* Terms */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease }}
        className="rounded-2xl border shadow-sm p-6"
        style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
      >
        <div className="font-mono text-[9px] uppercase tracking-widest mb-5" style={{ color: colors.textMuted }}>
          Loan terms
        </div>

        {/* Headline: collateral requirement */}
        <div className="mb-6">
          <div className="font-sans text-xs mb-1" style={{ color: colors.textSecondary }}>
            You lock
          </div>
          <div className="font-serif text-3xl font-semibold tabular-nums" style={{ color: '#7C3AED' }}>
            {formatUsd(collateral)}
          </div>
          <div className="font-sans text-[11px] mt-1" style={{ color: colors.textMuted }}>
            {COLLATERAL_TOKEN.symbol} — {formatPercent(PROTOCOL.collateralRatio)} of the loan
          </div>
        </div>

        <div className="space-y-3">
          {[
            { label: 'Collateral ratio', value: formatPercent(PROTOCOL.collateralRatio), hint: 'from your score' },
            { label: 'Interest rate', value: formatPercent(apr, 2), hint: market ? `${market.symbol} base rate` : 'APR, tiered' },
            { label: 'Term', value: `${PROTOCOL.termDays} days`, hint: 'streamed' },
            { label: 'Interest', value: formatUsd(interest, 2), hint: null },
            { label: 'Total repayable', value: formatUsd(total, 2), hint: null },
          ].map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <div>
                <div className="font-sans text-xs" style={{ color: colors.textSecondary }}>{row.label}</div>
                {row.hint && (
                  <div className="font-mono text-[9px]" style={{ color: colors.textMuted }}>{row.hint}</div>
                )}
              </div>
              <div className="font-mono text-xs tabular-nums" style={{ color: colors.text }}>{row.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-5 border-t" style={{ borderColor: colors.border }}>
          <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>
            Repayment stream
          </div>
          <div className="font-mono text-xs tabular-nums" style={{ color: colors.text }}>
            {rate.toFixed(6)} {symbol} / sec
          </div>
          <div className="font-sans text-[11px] mt-1 leading-relaxed" style={{ color: colors.textMuted }}>
            Repaid continuously, not in monthly instalments. A stall flags a default immediately.
          </div>
        </div>

        {/* Validation / cap note */}
        <div
          className="mt-5 p-3 rounded-xl flex items-start gap-2"
          style={{ backgroundColor: 'rgba(124,58,237,0.04)' }}
        >
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
          <div className="font-sans text-[11px] leading-relaxed" style={{ color: colors.textSecondary }}>
            {tooLarge ? (
              <>
                Capped at <span className="font-mono">{formatUsd(maxAmount)}</span> — limited by your{' '}
                {bindingCap}.
              </>
            ) : tooSmall ? (
              <>Minimum loan is {formatUsd(PROTOCOL.minLoan)}.</>
            ) : (
              <>
                Max <span className="font-mono">{formatUsd(maxAmount)}</span>, limited by your {bindingCap}.
              </>
            )}
          </div>
        </div>

        <button
          onClick={onContinue}
          disabled={!valid}
          className="mt-5 w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-sans text-sm font-medium transition-all"
          style={{
            backgroundColor: valid ? '#7C3AED' : 'rgba(124,58,237,0.25)',
            color: '#FFFFFF',
            cursor: valid ? 'pointer' : 'not-allowed',
          }}
        >
          Review and lock collateral
          <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </motion.div>
    </div>
  );
}
