import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import BorrowStepper from '@/components/borrow/BorrowStepper';
import TokenIcon from '@/components/TokenIcon';
import LoanRequestStep from '@/components/borrow/LoanRequestStep';
import CollateralLockStep from '@/components/borrow/CollateralLockStep';
import LoanActiveStep from '@/components/borrow/LoanActiveStep';
import { PROTOCOL, formatPercent } from '@/lib/protocol';
import { formatApr, type Market } from '@/lib/markets';
import { MONAD_TESTNET } from '@/lib/chains';

const ease = [0.22, 1, 0.36, 1] as const;

const DEFAULT_AMOUNT = 5_000;

/** Stand-in for the hash a real `LendingPool.borrow()` call would return. */
function mockTxHash(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

interface Props {
  market: Market;
  isCorrectNetwork: boolean;
  /** Returns to the market list. */
  onBack: () => void;
}

export default function BorrowFlow({ market, isCorrectNetwork, onBack }: Props) {
  const colors = useTheme();

  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);

  function handleConfirm() {
    setTxHash(mockTxHash());
    setStep(2);
  }

  return (
    <div>
      {/* Which reserve this loan draws on */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease }}
        className="mb-6 flex items-center justify-between gap-4"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-sans text-xs transition-opacity hover:opacity-70"
          style={{ color: '#7C3AED' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          All markets
        </button>

        <div className="flex items-center gap-3">
          <TokenIcon symbol={market.symbol} color={market.accent} size={28} />
          <div className="text-right">
            <div className="font-sans text-xs font-medium" style={{ color: colors.text }}>
              {market.symbol}
            </div>
            <div className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
              {formatApr(market.baseApr)} base APR
            </div>
          </div>
        </div>
      </motion.div>

      {!isCorrectNetwork && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease }}
          className="mb-6 p-4 rounded-2xl border flex items-start gap-3"
          style={{ borderColor: '#EF9F27', backgroundColor: 'rgba(186,117,23,0.06)' }}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#BA7517' }} strokeWidth={1.5} />
          <div className="font-sans text-xs leading-relaxed" style={{ color: '#854F0B' }}>
            Your wallet is on the wrong network. Switch to {MONAD_TESTNET.name} to request a loan.
          </div>
        </motion.div>
      )}

      <BorrowStepper current={step} />

      {step === 0 && (
        <LoanRequestStep
          amount={amount}
          market={market}
          onAmountChange={setAmount}
          onContinue={() => setStep(1)}
        />
      )}

      {step === 1 && (
        <CollateralLockStep
          amount={amount}
          market={market}
          onBack={() => setStep(0)}
          onConfirm={handleConfirm}
        />
      )}

      {step === 2 && <LoanActiveStep amount={amount} market={market} txHash={txHash} />}

      <p className="mt-6 font-mono text-[10px] text-center" style={{ color: colors.textMuted }}>
        Collateral ratio {formatPercent(PROTOCOL.collateralRatio)} · {PROTOCOL.termDays}-day term ·
        streamed repayment
      </p>
    </div>
  );
}
