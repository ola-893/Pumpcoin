import { motion } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';
import { SCORE } from '@/lib/protocol';
import { netSummary, tierBuffer, type WalletPosition } from '@/lib/position';

const ease = [0.22, 1, 0.36, 1] as const;

function usd(value: number, digits = 0): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/**
 * The one-glance answer for a wallet that both lends and borrows.
 *
 * Aave's insight: rather than making someone read a supply side and a borrow side and
 * subtract them, net the two into a single set of headline figures. Net position is the
 * headline; the rest explain how it is moving.
 *
 * Four standalone cards rather than one divided strip — the strip read as a single object
 * and made the figures look like columns of a table, when each is its own metric.
 *
 * The fourth figure is the wallet's risk metric, and it differs by side. A borrower's
 * exposure is a score downgrade raising the collateral ratio against a fixed loan, so they
 * get score buffer. A lender's exposure is idle capital, so they get the reserve buffer.
 */
export default function NetSummary({ position }: { position: WalletPosition }) {
  const colors = useTheme();
  const net = netSummary(position);
  const buffer = position.scored ? tierBuffer(SCORE.value) : null;
  const lending = position.lending;

  const risk = buffer
    ? {
        label: 'Score buffer',
        value: `${buffer.points} pts`,
        hint: `above the ${buffer.rung.name} floor`,
        tone: buffer.points <= 3 ? '#BA7517' : '#639922',
      }
    : {
        label: 'Reserve buffer',
        value: `${Math.round((lending?.health.reserveBuffer ?? 0) * 100)}%`,
        hint: 'available to withdraw',
        tone: (lending?.health.reserveBuffer ?? 1) < 0.3 ? '#BA7517' : '#639922',
      };

  const figures = [
    {
      label: 'Net position',
      value: usd(net.net),
      hint: `${usd(net.assets)} assets − ${usd(net.debt)} debt`,
      tone: net.net >= 0 ? colors.text : '#BA7517',
    },
    {
      label: 'Net APY',
      value:
        net.netApy === null
          ? '—'
          : `${net.netApy >= 0 ? '+' : ''}${(net.netApy * 100).toFixed(2)}%`,
      // Forward-looking and annualised. Spelled out because it is NOT the rate that
      // produces the Net interest figure beside it — that one is cumulative to date.
      hint: net.netApy === null ? 'no net assets to rate' : 'annualised, on net position',
      tone: net.netApy === null ? colors.textMuted : net.netApy >= 0 ? '#639922' : '#BA7517',
    },
    {
      label: 'Net interest',
      value: `${net.netInterestToDate >= 0 ? '+' : ''}${usd(net.netInterestToDate, 2)}`,
      hint: 'earned less paid, to date',
      tone: net.netInterestToDate >= 0 ? '#639922' : '#BA7517',
    },
    risk,
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
      {figures.map((figure, i) => (
        <motion.div
          key={figure.label}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 + i * 0.04, ease }}
          className="rounded-2xl border shadow-sm p-4"
          style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
        >
          <div
            className="font-mono text-[9px] uppercase tracking-widest mb-2"
            style={{ color: colors.textMuted }}
          >
            {figure.label}
          </div>
          <div
            className="font-serif text-2xl font-semibold tabular-nums leading-none"
            style={{ color: figure.tone }}
          >
            {figure.value}
          </div>
          <div
            className="font-mono text-[9px] mt-1.5 leading-relaxed"
            style={{ color: colors.textMuted }}
          >
            {figure.hint}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
