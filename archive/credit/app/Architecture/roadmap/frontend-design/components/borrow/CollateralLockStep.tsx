import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Check, Lock, ShieldCheck, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  PROTOCOL,
  COLLATERAL_TOKEN,
  collateralFor,
  interestFor,
  totalRepayable,
  formatUsd,
  formatPercent,
} from '@/lib/protocol';
import type { Market } from '@/lib/markets';

const ease = [0.22, 1, 0.36, 1] as const;

interface Props {
  amount: number;
  onBack: () => void;
  onConfirm: () => void;
  /** Reserve being drawn from. Drives the rate and the denomination. */
  market?: Market;
}

export default function CollateralLockStep({ amount, onBack, onConfirm, market }: Props) {
  const colors = useTheme();
  const [approved, setApproved] = useState(false);
  const [locking, setLocking] = useState(false);

  const apr = market?.baseApr ?? PROTOCOL.apr;
  const symbol = market?.symbol ?? 'USDC';

  const collateral = collateralFor(amount);
  const interest = interestFor(amount, apr);
  const total = totalRepayable(amount, apr);

  function handleLock() {
    setLocking(true);
    // Mock of the LendingPool.borrow() round-trip. Real version awaits the tx receipt.
    setTimeout(() => onConfirm(), 1400);
  }

  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-6 items-start">
      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease }}
        className="rounded-2xl border shadow-sm p-6"
        style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
      >
        <div className="font-mono text-[9px] uppercase tracking-widest mb-5" style={{ color: colors.textMuted }}>
          Confirm terms
        </div>

        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-sm" style={{ color: colors.textSecondary }}>You receive</span>
            <span className="font-serif text-2xl font-semibold tabular-nums" style={{ color: colors.text }}>
              {formatUsd(amount)} <span className="font-mono text-sm">{symbol}</span>
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="font-sans text-sm" style={{ color: colors.textSecondary }}>
              You lock ({COLLATERAL_TOKEN.symbol})
            </span>
            <span className="font-serif text-2xl font-semibold tabular-nums" style={{ color: '#7C3AED' }}>
              {formatUsd(collateral)}
            </span>
          </div>

          <div className="pt-4 border-t space-y-3" style={{ borderColor: colors.border }}>
            {[
              { label: 'Collateral ratio', value: formatPercent(PROTOCOL.collateralRatio) },
              { label: 'Interest rate', value: formatPercent(apr, 2) },
              { label: 'Term', value: `${PROTOCOL.termDays} days` },
              { label: 'Interest', value: formatUsd(interest, 2) },
              { label: 'Total repayable', value: formatUsd(total, 2) },
            ].map((row) => (
              <div key={row.label} className="flex items-baseline justify-between">
                <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>{row.label}</span>
                <span className="font-mono text-xs tabular-nums" style={{ color: colors.text }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Default consequence — the part that makes the design credible */}
        <div
          className="mt-6 p-4 rounded-xl flex items-start gap-3"
          style={{ backgroundColor: 'rgba(124,58,237,0.04)' }}
        >
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
          <div className="font-sans text-[11px] leading-relaxed" style={{ color: colors.textSecondary }}>
            <span className="font-medium" style={{ color: colors.text }}>If the stream stalls,</span> a default
            is flagged immediately. Your {formatPercent(PROTOCOL.collateralRatio)} collateral absorbs the
            shortfall first, the reserve pool covers the remainder, and any sponsor's delegated capacity is
            slashed proportionally.
          </div>
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease }}
        className="rounded-2xl border shadow-sm p-6"
        style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
      >
        <div className="font-mono text-[9px] uppercase tracking-widest mb-5" style={{ color: colors.textMuted }}>
          Two signatures
        </div>

        {/* Step 1 — approve */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[9px]"
              style={{
                backgroundColor: approved ? '#639922' : 'rgba(124,58,237,0.1)',
                color: approved ? '#FFFFFF' : '#7C3AED',
              }}
            >
              {approved ? <Check className="w-3 h-3" strokeWidth={2.5} /> : '1'}
            </div>
            <span className="font-sans text-xs font-medium" style={{ color: colors.text }}>
              Approve {COLLATERAL_TOKEN.symbol}
            </span>
          </div>
          <p className="font-sans text-[11px] mb-3 leading-relaxed" style={{ color: colors.textMuted }}>
            Lets the pool contract move {formatUsd(collateral)} of your {COLLATERAL_TOKEN.symbol}.
          </p>
          <button
            onClick={() => setApproved(true)}
            disabled={approved}
            className="w-full px-4 py-2.5 rounded-xl font-sans text-xs font-medium transition-all"
            style={{
              backgroundColor: approved ? 'rgba(99,153,34,0.1)' : 'rgba(124,58,237,0.08)',
              color: approved ? '#639922' : '#7C3AED',
              cursor: approved ? 'default' : 'pointer',
            }}
          >
            {approved ? `Approved ${formatUsd(collateral)} ${COLLATERAL_TOKEN.symbol}` : `Approve ${COLLATERAL_TOKEN.symbol}`}
          </button>
        </div>

        {/* Step 2 — lock */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center font-mono text-[9px]"
              style={{
                backgroundColor: approved ? 'rgba(124,58,237,0.1)' : 'transparent',
                border: approved ? 'none' : `1px solid ${colors.border}`,
                color: approved ? '#7C3AED' : colors.textMuted,
              }}
            >
              2
            </div>
            <span className="font-sans text-xs font-medium" style={{ color: approved ? colors.text : colors.textMuted }}>
              Lock collateral
            </span>
          </div>
          <p className="font-sans text-[11px] mb-3 leading-relaxed" style={{ color: colors.textMuted }}>
            Calls <span className="font-mono">LendingPool.borrow()</span> and starts the repayment stream.
          </p>
          <button
            onClick={handleLock}
            disabled={!approved || locking}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all"
            style={{
              backgroundColor: !approved || locking ? 'rgba(124,58,237,0.25)' : '#7C3AED',
              color: '#FFFFFF',
              cursor: !approved || locking ? 'not-allowed' : 'pointer',
            }}
          >
            {locking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                Locking…
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" strokeWidth={1.5} />
                Lock & receive {formatUsd(amount)}
              </>
            )}
          </button>
        </div>

        <button
          onClick={onBack}
          disabled={locking}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border font-sans text-xs transition-colors hover:bg-white"
          style={{ borderColor: colors.border, color: colors.textSecondary }}
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          Back to amount
        </button>
      </motion.div>
    </div>
  );
}
