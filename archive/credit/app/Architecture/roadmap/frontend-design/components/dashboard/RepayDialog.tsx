import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Check, Loader2, Lock, Wallet, TriangleAlert, ExternalLink } from 'lucide-react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useTheme } from '@/contexts/ThemeContext';
import { BORROW_POSITION, IDLE_BALANCE } from '@/lib/position';
import { CREDIT_LINE_ABI, ERC20_ABI, PROTOCOL_ADDRESSES, toUnits } from '@/lib/onchain';
import { explorerTxUrl } from '@/lib/chains';

const ease = [0.22, 1, 0.36, 1] as const;

function usd(value: number, digits = 2): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

interface RepayDialogProps {
  onClose: () => void;
  /**
   * Live mode: the wallet's real debt and pUSD balance (token units, from the chain).
   * Omitted in demo mode, where the mock scenario figures stand in.
   */
  debt?: number;
  balance?: number;
  /** Called once a live repayment is confirmed, so the dashboard refetches. */
  onSettled?: () => void;
}

/**
 * Repay a loan — partially or in full.
 *
 * Two modes off the same UI:
 *  - Live: an `approve` on pUSD, then `CreditLine.repay()` on Monad testnet, then wait
 *    for the receipt. The confirmed state links the real transaction.
 *  - Demo (no `debt` prop): the mock scenario round-trip, kept for `?state=` views.
 *
 * The demo wallet holds $2,500 idle against a $5,088.40 debt, so "repay in full" is
 * genuinely unaffordable there — the dialog says so plainly. Full repayment releases
 * escrowed collateral, which is the fact a borrower is actually waiting on.
 */
export default function RepayDialog({ onClose, debt, balance, onSettled }: RepayDialogProps) {
  const colors = useTheme();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const isLive = typeof debt === 'number' && typeof balance === 'number';

  const principal = isLive ? debt! : BORROW_POSITION.drawn + BORROW_POSITION.interestPaid;
  const totalOwed = principal;
  const walletBalance = isLive ? balance! : IDLE_BALANCE;
  const collateral = BORROW_POSITION.collateralLocked;

  const [amount, setAmount] = useState('');
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [repaying, setRepaying] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const parsed = Number(amount);
  const exceedsBalance = Number.isFinite(parsed) && parsed > walletBalance;
  const exceedsDebt = Number.isFinite(parsed) && parsed > totalOwed;
  const valid = Number.isFinite(parsed) && parsed > 0 && !exceedsBalance && !exceedsDebt;
  const isFullRepay = Number.isFinite(parsed) && parsed >= totalOwed;
  const fullRepayAffordable = walletBalance >= totalOwed;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !repaying && !approving) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, repaying, approving]);

  // Live mode: the real receipt. Demo mode: the mock round-trip.
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: isLive && !!txHash },
  });

  useEffect(() => {
    if (receipt && onSettled) onSettled();
  }, [receipt, onSettled]);

  /** Stand-in for the hash a real `CreditLine.repay()` would return (demo mode only). */
  function mockTxHash(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }

  async function handleApprove() {
    if (!address || !isLive) return;
    setApproving(true);
    setError(undefined);
    try {
      await writeContractAsync({
        address: PROTOCOL_ADDRESSES.loanToken,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PROTOCOL_ADDRESSES.creditLine, toUnits(parsed)],
      });
      setApproved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 120) : 'Approval failed');
    } finally {
      setApproving(false);
    }
  }

  async function handleRepay() {
    setError(undefined);
    if (isLive) {
      if (!address) return;
      setRepaying(true);
      try {
        const hash = await writeContractAsync({
          address: PROTOCOL_ADDRESSES.creditLine,
          abi: CREDIT_LINE_ABI,
          functionName: 'repay',
          args: [toUnits(parsed)],
        });
        setTxHash(hash);
      } catch (e) {
        setError(e instanceof Error ? e.message.slice(0, 120) : 'Repayment failed');
      } finally {
        setRepaying(false);
      }
    } else {
      setRepaying(true);
      setTimeout(() => {
        setTxHash(mockTxHash() as `0x${string}`);
        setRepaying(false);
      }, 1500);
    }
  }

  const confirming = isLive && !!txHash && !receipt;
  const confirmed = !!txHash && (isLive ? !!receipt : true);

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
        onClick={repaying || approving ? undefined : onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="repay-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease }}
        className="relative w-full max-w-[420px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border shadow-2xl p-5 sm:p-6"
        style={{ borderColor: colors.border, backgroundColor: '#FFFDFB' }}
      >
        {!repaying && !approving && !confirming && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5"
          >
            <X className="w-4 h-4" style={{ color: colors.textMuted }} strokeWidth={1.5} />
          </button>
        )}

        {confirming ? (
          /* ---- Live: waiting for the receipt ---- */
          <div className="pt-2 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: '#7C3AED' }} strokeWidth={2} />
            <h2 className="font-serif text-xl mb-1" style={{ color: colors.text }}>
              Confirming repayment…
            </h2>
            <p className="font-sans text-sm mb-6" style={{ color: colors.textSecondary }}>
              {usd(parsed)} toward your credit line on Monad testnet
            </p>
            <a
              href={explorerTxUrl(txHash)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] transition-opacity hover:opacity-70"
              style={{ color: '#7C3AED' }}
            >
              {txHash!.slice(0, 10)}…{txHash!.slice(-8)} ↗
            </a>
          </div>
        ) : confirmed ? (
          /* ---- Confirmed ---- */
          <div className="pt-2">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: 'rgba(99,153,34,0.12)' }}
            >
              <Check className="w-5 h-5" style={{ color: '#639922' }} strokeWidth={2.5} />
            </div>
            <h2 className="font-serif text-xl mb-1" style={{ color: colors.text }}>
              Repayment confirmed
            </h2>
            <p className="font-sans text-sm mb-2" style={{ color: colors.textSecondary }}>
              {usd(parsed)} paid toward your credit line
            </p>
            <p className="font-mono text-[10px] mb-1 leading-relaxed" style={{ color: colors.textMuted }}>
              {isFullRepay
                ? `Debt cleared.${!isLive ? ` ${usd(collateral, 0)} of collateral released back to your wallet.` : ''}`
                : `Remaining debt: ${usd(totalOwed - parsed)}`}
            </p>
            {!isLive && !isFullRepay && (
              <p className="font-mono text-[10px] mb-1" style={{ color: colors.textMuted }}>
                Collateral stays locked until the loan is fully repaid.
              </p>
            )}
            <a
              href={explorerTxUrl(txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10px] mb-6 transition-opacity hover:opacity-70"
              style={{ color: '#7C3AED' }}
            >
              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
              {txHash!.slice(0, 10)}…{txHash!.slice(-8)}
            </a>
            <button
              onClick={onClose}
              className="w-full px-5 py-3 rounded-xl font-sans text-sm font-medium transition-all hover:opacity-90"
              style={{ backgroundColor: '#7C3AED', color: '#FFFFFF' }}
            >
              Done
            </button>
          </div>
        ) : (
          /* ---- Amount + signatures ---- */
          <>
            <h2 id="repay-title" className="font-serif text-xl mb-1" style={{ color: colors.text }}>
              Repay loan
            </h2>
            <p className="font-sans text-sm mb-5" style={{ color: colors.textSecondary }}>
              {isLive ? 'Your credit line on Monad testnet' : `Demo loan · ${usd(BORROW_POSITION.drawn, 0)} principal · ${usd(BORROW_POSITION.interestPaid)} interest to date`}
            </p>

            {/* Debt summary */}
            <div
              className="p-3.5 rounded-xl mb-4 flex items-center justify-between"
              style={{ backgroundColor: 'rgba(186,117,23,0.06)' }}
            >
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
                  Total owed
                </div>
                <div className="font-serif text-xl font-semibold tabular-nums" style={{ color: colors.text }}>
                  {usd(totalOwed)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
                  Wallet balance
                </div>
                <div className="font-serif text-xl font-semibold tabular-nums flex items-center gap-1.5" style={{ color: colors.text }}>
                  <Wallet className="w-3.5 h-3.5" style={{ color: colors.textMuted }} strokeWidth={1.5} />
                  {usd(walletBalance)}
                </div>
              </div>
            </div>

            {!fullRepayAffordable && (
              <p className="font-mono text-[9px] mb-4 leading-relaxed" style={{ color: '#BA7517' }}>
                Your balance covers {Math.floor((walletBalance / totalOwed) * 100)}% of the debt —
                repay what you can, or top up your wallet first.
              </p>
            )}

            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl border mb-2"
              style={{ borderColor: valid || amount === '' ? colors.border : '#BA7517' }}
            >
              <span className="font-serif text-lg" style={{ color: colors.textMuted }}>$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^0-9.]/g, ''));
                  setApproved(false);
                }}
                placeholder="0.00"
                aria-label="Amount to repay"
                className="flex-1 bg-transparent outline-none font-serif text-lg tabular-nums"
                style={{ color: colors.text }}
              />
              <button
                onClick={() => {
                  setAmount(String(Math.min(totalOwed, walletBalance)));
                  setApproved(false);
                }}
                className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 rounded-md transition-colors"
                style={{ backgroundColor: 'rgba(124,58,237,0.07)', color: '#7C3AED' }}
              >
                Max
              </button>
            </div>

            <div className="font-mono text-[9px] mb-1 h-3" style={{ color: '#BA7517' }}>
              {exceedsBalance
                ? `Wallet balance is ${usd(walletBalance)}`
                : exceedsDebt
                  ? `Debt is ${usd(totalOwed)} — no more to repay`
                  : ''}
            </div>

            <div className="flex items-center gap-2 mb-5">
              {[0.25, 0.5, 0.75].map((fraction) => (
                <button
                  key={fraction}
                  onClick={() => {
                    setAmount(String(Math.round(totalOwed * fraction)));
                    setApproved(false);
                  }}
                  className="px-3 py-1.5 rounded-lg font-mono text-[10px] transition-colors"
                  style={{ backgroundColor: 'rgba(124,58,237,0.07)', color: '#7C3AED' }}
                >
                  {fraction * 100}%
                </button>
              ))}
              <button
                disabled={!fullRepayAffordable}
                onClick={() => {
                  setAmount(String(totalOwed));
                  setApproved(false);
                }}
                title={fullRepayAffordable ? undefined : 'Wallet balance is too low to repay in full'}
                className="px-3 py-1.5 rounded-lg font-mono text-[10px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'rgba(124,58,237,0.07)', color: '#7C3AED' }}
              >
                Repay in full
              </button>
            </div>

            {/* Two signatures */}
            <div className="space-y-2.5 mb-5">
              {isLive && (
                <button
                  onClick={handleApprove}
                  disabled={approved || approving || !valid}
                  className="w-full px-4 py-2.5 rounded-xl font-sans text-xs font-medium transition-all flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: approved ? 'rgba(99,153,34,0.1)' : 'rgba(124,58,237,0.08)',
                    color: approved ? '#639922' : '#7C3AED',
                    cursor: approved || !valid ? 'default' : 'pointer',
                  }}
                >
                  {approving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                      Approving…
                    </>
                  ) : (
                    <>
                      {approved && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                      {approved ? `Approved ${usd(parsed || 0)} pUSD` : '1 · Approve pUSD'}
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleRepay}
                disabled={(isLive ? !approved : !valid) || repaying || !valid}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all"
                style={{
                  backgroundColor: valid && (isLive ? approved : true) && !repaying ? '#7C3AED' : 'rgba(124,58,237,0.25)',
                  color: '#FFFFFF',
                  cursor: valid && (isLive ? approved : true) && !repaying ? 'pointer' : 'not-allowed',
                }}
              >
                {repaying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                    Repaying…
                  </>
                ) : (
                  <>{isLive ? '2 · ' : ''}Repay {amount !== '' && Number.isFinite(parsed) ? usd(parsed) : ''}</>
                )}
              </button>
            </div>

            {error && (
              <div
                className="p-3 rounded-xl mb-4 flex items-start gap-2"
                style={{ backgroundColor: 'rgba(186,117,23,0.08)' }}
              >
                <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#BA7517' }} strokeWidth={1.5} />
                <span className="font-mono text-[10px] leading-relaxed break-all" style={{ color: '#BA7517' }}>
                  {error}
                </span>
              </div>
            )}

            {/* Collateral consequence — the fact the borrower is waiting on */}
            <div
              className="p-3 rounded-xl flex items-start gap-2 mb-5"
              style={{ backgroundColor: 'rgba(124,58,237,0.04)' }}
            >
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
              <div className="font-sans text-[11px] leading-relaxed" style={{ color: colors.textSecondary }}>
                {isFullRepay ? (
                  <>
                    <span className="font-medium" style={{ color: colors.text }}>
                      Repaying in full closes the credit line
                    </span>
                    {!isLive && <> and releases {usd(collateral, 0)} of escrowed collateral back to your wallet.</>}
                    {isLive && ' — collateral becomes withdrawable once debt is zero.'}
                  </>
                ) : (
                  <>
                    Partial payments reduce the debt; {isLive ? 'collateral' : `${usd(collateral, 0)} of collateral`} stays
                    locked until the loan is fully repaid.
                  </>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={repaying || approving}
              className="w-full px-5 py-3 rounded-xl border font-sans text-sm font-medium transition-colors hover:bg-white"
              style={{ borderColor: colors.border, color: colors.textSecondary }}
            >
              Cancel
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
