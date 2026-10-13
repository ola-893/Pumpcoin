import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, ChevronLeft, Check, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { poolName, type LendingPosition } from '@/lib/position';
import type { PoolId } from '@/lib/markets';

const ease = [0.22, 1, 0.36, 1] as const;

function usd(value: number, digits = 2): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function pct(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Withdraw, with the pool chosen explicitly.
 *
 * A single button that silently withdrew "everything" was wrong the moment the wallet held
 * more than one tranche — the Across Pools card right beside it would be showing two
 * balances while the button assumed one. Rather than duplicating the action per pool, the
 * button stays put and asks which pool first.
 *
 * A single-tranche wallet skips the picker entirely; there is nothing to disambiguate.
 * A `preselectedPool` skips it too — the row-level entry on the Deposit page already knows
 * which pool was meant, so asking again would be a question the UI just answered.
 *
 * The confirmation state carries the transaction hash, matching the deposit flow: a
 * submitted withdrawal without a receipt link leaves the user refreshing a table to learn
 * whether it worked.
 */
export default function WithdrawDialog({
  lending,
  preselectedPool,
  onClose,
}: {
  lending: LendingPosition;
  /** Pool to withdraw from directly, skipping the picker. */
  preselectedPool?: PoolId | null;
  onClose: () => void;
}) {
  const colors = useTheme();
  const multiPool = lending.holdings.length > 1 && preselectedPool == null;

  const [pool, setPool] = useState<PoolId | null>(
    preselectedPool ?? (multiPool ? null : (lending.holdings[0]?.pool ?? null)),
  );
  const [amount, setAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);

  const holding = lending.holdings.find((h) => h.pool === pool) ?? null;
  const available = holding?.value ?? 0;
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= available;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !withdrawing) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, withdrawing]);

  function handleWithdraw() {
    setWithdrawing(true);
    // Demo: no transaction is submitted — the Unora pool contracts don't exist yet, so a
    // fake hash would point the user at an explorer page for a tx that never happened.
    setTimeout(() => {
      setWithdrawn(true);
      setWithdrawing(false);
    }, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(24, 20, 32, 0.32)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={withdrawing ? undefined : onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease }}
        className="relative w-full max-w-[420px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border shadow-2xl p-5 sm:p-6"
        style={{ borderColor: colors.border, backgroundColor: '#FFFDFB' }}
      >
        {!withdrawing && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5"
          >
            <X className="w-4 h-4" style={{ color: colors.textMuted }} strokeWidth={1.5} />
          </button>
        )}

        {withdrawn ? (
          /* ---- Confirmed ---- */
          <div className="pt-2">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: 'rgba(99,153,34,0.12)' }}
            >
              <Check className="w-5 h-5" style={{ color: '#639922' }} strokeWidth={2.5} />
            </div>
            <h2 className="font-serif text-xl mb-1" style={{ color: colors.text }}>
              Withdrawal submitted
            </h2>
            <p className="font-sans text-sm mb-2" style={{ color: colors.textSecondary }}>
              {usd(parsed)} from {poolName(holding?.pool ?? pool!)}
            </p>
            <p className="font-mono text-[10px] mb-6 leading-relaxed" style={{ color: colors.textMuted }}>
              Demo: no transaction was submitted. The live withdraw flow lands with the
              Unora pool contracts.
            </p>
            <button
              onClick={onClose}
              className="w-full px-5 py-3 rounded-xl font-sans text-sm font-medium transition-all hover:opacity-90"
              style={{ backgroundColor: '#7C3AED', color: '#FFFFFF' }}
            >
              Done
            </button>
          </div>
        ) : !pool ? (
          /* ---- Step 1: which pool ---- */
          <>
            <h2 id="withdraw-title" className="font-serif text-xl mb-1" style={{ color: colors.text }}>
              Withdraw
            </h2>
            <p className="font-sans text-sm mb-5" style={{ color: colors.textSecondary }}>
              Which pool would you like to withdraw from?
            </p>

            <div className="space-y-2 mb-5">
              {lending.holdings.map((h) => (
                <button
                  key={h.pool}
                  onClick={() => setPool(h.pool)}
                  className="w-full text-left p-4 rounded-xl border transition-colors hover:bg-purple-50/40"
                  style={{ borderColor: colors.border }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-sans text-sm font-medium" style={{ color: colors.text }}>
                      {poolName(h.pool)}
                    </span>
                    <span
                      className="font-serif text-lg font-semibold tabular-nums"
                      style={{ color: colors.text }}
                    >
                      {usd(h.value)}
                    </span>
                  </div>
                  <div className="font-mono text-[9px] mt-1" style={{ color: colors.textMuted }}>
                    {usd(h.deposited, 0)} deposited · {pct(h.apy)} APY
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="w-full px-5 py-3 rounded-xl border font-sans text-sm font-medium transition-colors hover:bg-white"
              style={{ borderColor: colors.border, color: colors.textSecondary }}
            >
              Cancel
            </button>
          </>
        ) : (
          /* ---- Step 2: how much ---- */
          <>
            <div className="flex items-center gap-2 mb-1">
              {multiPool && (
                <button
                  onClick={() => {
                    setPool(null);
                    setAmount('');
                  }}
                  aria-label="Back to pool selection"
                  className="w-6 h-6 -ml-1.5 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5"
                >
                  <ChevronLeft className="w-4 h-4" style={{ color: colors.textMuted }} strokeWidth={1.5} />
                </button>
              )}
              <h2 id="withdraw-title" className="font-serif text-xl" style={{ color: colors.text }}>
                Withdraw
              </h2>
            </div>
            <p className="font-sans text-sm mb-5" style={{ color: colors.textSecondary }}>
              From {poolName(pool)} · {usd(available)} available
            </p>

            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl border mb-2"
              style={{ borderColor: valid || amount === '' ? colors.border : '#BA7517' }}
            >
              <span className="font-serif text-lg" style={{ color: colors.textMuted }}>
                $
              </span>
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                aria-label="Amount to withdraw"
                className="flex-1 bg-transparent outline-none font-serif text-lg tabular-nums"
                style={{ color: colors.text }}
              />
              <button
                onClick={() => setAmount(String(available))}
                className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 rounded-md transition-colors"
                style={{ backgroundColor: 'rgba(124,58,237,0.07)', color: '#7C3AED' }}
              >
                Max
              </button>
            </div>

            <div className="font-mono text-[9px] mb-5 h-3" style={{ color: '#BA7517' }}>
              {amount !== '' && !valid ? `Enter an amount up to ${usd(available)}` : ''}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={withdrawing}
                className="flex-1 px-5 py-3 rounded-xl border font-sans text-sm font-medium transition-colors hover:bg-white"
                style={{ borderColor: colors.border, color: colors.textSecondary }}
              >
                Cancel
              </button>
              <button
                disabled={!valid || withdrawing}
                onClick={handleWithdraw}
                className="flex-1 px-5 py-3 rounded-xl font-sans text-sm font-medium transition-all flex items-center justify-center gap-2"
                style={{
                  backgroundColor: valid && !withdrawing ? '#7C3AED' : 'rgba(124,58,237,0.25)',
                  color: '#FFFFFF',
                  cursor: valid && !withdrawing ? 'pointer' : 'not-allowed',
                }}
              >
                {withdrawing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                    Withdrawing…
                  </>
                ) : (
                  'Withdraw'
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
