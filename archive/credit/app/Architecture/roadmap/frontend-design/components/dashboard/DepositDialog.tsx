import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, ChevronLeft, Check, Loader2, ShieldCheck, Info } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { MARKETS, POOLS, supplyApy, type PoolId } from '@/lib/markets';
import { IDLE_BALANCE } from '@/lib/position';
import { MONAD_TESTNET } from '@/lib/chains';

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
 * The deposit flow.
 *
 * The Lend page lists reserves, but the action a supplier actually takes — "put this much
 * into that pool" — needs its own surface: an amount field with a wallet-balance MAX, the
 * pool's current APY and remaining cap, the two-signature ERC-20 dance (approve, then
 * deposit), and a submitted state with the transaction hash.
 *
 * Pools are the destination choice, not assets: deposits are tranches of the same USDC
 * reserve, so the picker offers General / Bluechip / Sponsored with each tranche's APY and
 * remaining capacity. A pool that is full is shown but disabled — matching the capacity
 * bar on the page behind this dialog rather than letting a deposit fail at signing.
 *
 * Single-tranche wallets are the common case for this demo, so the picker collapses away
 * when only one pool has room; the two-signature sequence is the part worth showing. A
 * `preselectedPool` skips the picker too — the row-level entry on the Deposit page already
 * knows which pool was meant.
 */
export default function DepositDialog({
  preselectedPool,
  onClose,
}: {
  /** Pool to deposit into directly, skipping the picker. */
  preselectedPool?: PoolId | null;
  onClose: () => void;
}) {
  const colors = useTheme();

  const poolsWithRoom = POOLS.map((pool) => {
    const market = MARKETS.find((m) => m.pool === pool.id && m.status === 'live');
    const deposits = market ? market.totalBorrows + market.liquidity : 0;
    const remaining = market ? market.supplyCap - deposits : 0;
    return {
      pool: pool.id,
      name: pool.name,
      apy: market ? supplyApy(market) : 0,
      remaining,
      cap: market?.supplyCap ?? 0,
      full: !market || remaining <= 0,
    };
  });

  const openPools = poolsWithRoom.filter((p) => !p.full);
  const defaultPool = openPools[0]?.pool ?? null;

  const [pool, setPool] = useState<PoolId | null>(
    preselectedPool ?? (openPools.length === 1 ? defaultPool : null),
  );
  const [amount, setAmount] = useState('');
  const [approved, setApproved] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [deposited, setDeposited] = useState(false);

  const selected = poolsWithRoom.find((p) => p.pool === pool) ?? null;
  const parsed = Number(amount);
  const exceedsBalance = Number.isFinite(parsed) && parsed > IDLE_BALANCE;
  const exceedsCap = selected != null && Number.isFinite(parsed) && parsed > selected.remaining;
  const valid =
    Number.isFinite(parsed) && parsed > 0 && !exceedsBalance && !exceedsCap && pool !== null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleDeposit() {
    setDepositing(true);
    // Demo: no transaction is submitted — the Unora pool contracts don't exist yet, so a
    // fake hash would point the user at an explorer page for a tx that never happened.
    setTimeout(() => {
      setDeposited(true);
      setDepositing(false);
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
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease }}
        className="relative w-full max-w-[420px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border shadow-2xl p-5 sm:p-6"
        style={{ borderColor: colors.border, backgroundColor: '#FFFDFB' }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5"
        >
          <X className="w-4 h-4" style={{ color: colors.textMuted }} strokeWidth={1.5} />
        </button>

        {deposited ? (
          /* ---- Confirmed ---- */
          <div className="pt-2">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: 'rgba(99,153,34,0.12)' }}
            >
              <Check className="w-5 h-5" style={{ color: '#639922' }} strokeWidth={2.5} />
            </div>
            <h2 className="font-serif text-xl mb-1" style={{ color: colors.text }}>
              Deposit submitted
            </h2>
            <p className="font-sans text-sm mb-2" style={{ color: colors.textSecondary }}>
              {usd(parsed)} into the {selected?.name} pool
            </p>
            <p className="font-mono text-[10px] mb-1" style={{ color: colors.textMuted }}>
              Earning {selected ? pct(selected.apy) : '—'} APY · {selected?.name} tranche
            </p>
            <p className="font-mono text-[10px] mb-6 leading-relaxed" style={{ color: colors.textMuted }}>
              Demo: no transaction was submitted. The live deposit flow lands with the
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
            <h2 id="deposit-title" className="font-serif text-xl mb-1" style={{ color: colors.text }}>
              Deposit
            </h2>
            <p className="font-sans text-sm mb-5" style={{ color: colors.textSecondary }}>
              Which pool would you like to supply? Deposits are tranches of the same USDC reserve at different risk.
            </p>

            <div className="space-y-2 mb-5">
              {poolsWithRoom.map((entry) => (
                <button
                  key={entry.pool}
                  disabled={entry.full}
                  onClick={() => setPool(entry.pool)}
                  className="w-full text-left p-4 rounded-xl border transition-colors hover:bg-purple-50/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ borderColor: colors.border }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-sans text-sm font-medium" style={{ color: colors.text }}>
                      {entry.name}
                    </span>
                    <span className="font-serif text-lg font-semibold tabular-nums" style={{ color: '#639922' }}>
                      {pct(entry.apy)}
                    </span>
                  </div>
                  <div className="font-mono text-[9px] mt-1" style={{ color: entry.full ? '#BA7517' : colors.textMuted }}>
                    {entry.full
                      ? 'pool full — no capacity'
                      : `${usd(entry.remaining, 0)} capacity remaining · ${pct(entry.apy)} APY`}
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
          /* ---- Step 2: amount + signatures ---- */
          <>
            <div className="flex items-center gap-2 mb-1">
              {preselectedPool == null && openPools.length > 1 && (
                <button
                  onClick={() => {
                    setPool(null);
                    setAmount('');
                    setApproved(false);
                  }}
                  aria-label="Back to pool selection"
                  className="w-6 h-6 -ml-1.5 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5"
                >
                  <ChevronLeft className="w-4 h-4" style={{ color: colors.textMuted }} strokeWidth={1.5} />
                </button>
              )}
              <h2 id="deposit-title" className="font-serif text-xl" style={{ color: colors.text }}>
                Deposit
              </h2>
            </div>
            <p className="font-sans text-sm mb-5" style={{ color: colors.textSecondary }}>
              {selected?.name} pool · {pct(selected?.apy ?? 0)} APY
            </p>

            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl border mb-2"
              style={{
                borderColor: valid || amount === '' ? colors.border : '#BA7517',
              }}
            >
              <span className="font-serif text-lg" style={{ color: colors.textMuted }}>$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                aria-label="Amount to deposit"
                className="flex-1 bg-transparent outline-none font-serif text-lg tabular-nums"
                style={{ color: colors.text }}
              />
              <button
                onClick={() => setAmount(String(Math.min(IDLE_BALANCE, selected?.remaining ?? IDLE_BALANCE)))}
                className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 rounded-md transition-colors"
                style={{ backgroundColor: 'rgba(124,58,237,0.07)', color: '#7C3AED' }}
              >
                Max
              </button>
            </div>

            <div className="font-mono text-[9px] mb-1 h-3" style={{ color: '#BA7517' }}>
              {exceedsBalance
                ? `Wallet balance is ${usd(IDLE_BALANCE)}`
                : exceedsCap
                  ? `Pool has ${usd(selected?.remaining ?? 0, 0)} of capacity left`
                  : ''}
            </div>

            <div className="flex items-baseline justify-between px-1 mb-5">
              <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
                Wallet balance {usd(IDLE_BALANCE)}
              </span>
              <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
                Projected: {usd((Number(amount) || 0) * (selected?.apy ?? 0), 2)}/yr
              </span>
            </div>

            {/* Two signatures — the same ERC-20 sequence the borrow flow shows */}
            <div className="space-y-2.5 mb-5">
              <button
                onClick={() => setApproved(true)}
                disabled={approved || !valid}
                className="w-full px-4 py-2.5 rounded-xl font-sans text-xs font-medium transition-all flex items-center justify-center gap-2"
                style={{
                  backgroundColor: approved ? 'rgba(99,153,34,0.1)' : 'rgba(124,58,237,0.08)',
                  color: approved ? '#639922' : '#7C3AED',
                  cursor: approved || !valid ? 'default' : 'pointer',
                }}
              >
                {approved && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                {approved ? `Approved ${usd(parsed)} USDC` : `1 · Approve USDC`}
              </button>
              <button
                onClick={handleDeposit}
                disabled={!approved || depositing || !valid}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all"
                style={{
                  backgroundColor: approved && valid && !depositing ? '#7C3AED' : 'rgba(124,58,237,0.25)',
                  color: '#FFFFFF',
                  cursor: approved && valid && !depositing ? 'pointer' : 'not-allowed',
                }}
              >
                {depositing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                    Depositing…
                  </>
                ) : (
                  <>2 · Deposit {amount !== '' && Number.isFinite(parsed) ? usd(parsed) : ''}</>
                )}
              </button>
            </div>

            <div
              className="p-3 rounded-xl flex items-start gap-2 mb-5"
              style={{ backgroundColor: 'rgba(124,58,237,0.04)' }}
            >
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
              <div className="font-sans text-[11px] leading-relaxed" style={{ color: colors.textSecondary }}>
                Deposits can be withdrawn any time the pool has reserve buffer. Yield accrues
                continuously while your capital is supplied.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-5 py-3 rounded-xl border font-sans text-sm font-medium transition-colors hover:bg-white"
                style={{ borderColor: colors.border, color: colors.textSecondary }}
              >
                Cancel
              </button>
            </div>

            <div className="flex items-center gap-1.5 mt-4 justify-center">
              <Info className="w-3 h-3" style={{ color: colors.textMuted }} strokeWidth={1.5} />
              <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
                Transactions settle on {MONAD_TESTNET.name}
              </span>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
