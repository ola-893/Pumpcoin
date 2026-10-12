import { motion } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';
import { AllocationDonut } from '@/components/dashboard/PortfolioCharts';
import { poolName, type LendingPosition } from '@/lib/position';
import { POOL_COLORS } from '@/lib/markets';

const ease = [0.22, 1, 0.36, 1] as const;

function formatUsd(value: number, digits = 0): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Pool health — the lender's risk figure, and purely informational.
 *
 * Utilization and reserve buffer are the same number from two sides, but lenders look for
 * both, so both are shown. Utilization is the risk figure: the higher it is, the more of
 * the pool is out on loan when a withdrawal lands.
 */
function PoolHealthCard({ lending }: { lending: LendingPosition }) {
  const colors = useTheme();

  const { utilization, reserveBuffer } = lending.health;

  // Utilization is weighted across holdings, so name the pool only when there is one.
  const label =
    lending.holdings.length === 1
      ? poolName(lending.holdings[0].pool)
      : `${lending.holdings.length} pools`;

  const meters = [
    {
      label: 'Reserve buffer',
      value: reserveBuffer,
      color: reserveBuffer < 0.3 ? '#BA7517' : '#639922',
      hint: 'undrawn and available',
    },
    {
      label: 'Utilization',
      value: utilization,
      color: utilization > 0.85 ? '#BA7517' : '#7C3AED',
      hint: 'out on loan',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25, ease }}
      className="rounded-2xl border shadow-sm p-5 flex flex-col h-full"
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      <div className="flex items-center justify-between mb-5">
        <span className="font-sans text-xs font-medium" style={{ color: colors.text }}>
          Pool health
        </span>
        <span
          className="font-mono text-[9px] px-2 py-1 rounded-full"
          style={{ backgroundColor: 'rgba(124,58,237,0.07)', color: '#7C3AED' }}
        >
          {label}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-5">
        {meters.map((meter) => (
          <div key={meter.label}>
            <div className="flex items-baseline justify-between mb-2">
              <span
                className="font-mono text-[9px] uppercase tracking-widest"
                style={{ color: colors.textMuted }}
              >
                {meter.label}
              </span>
              <span
                className="font-serif text-lg font-semibold tabular-nums"
                style={{ color: colors.text }}
              >
                {Math.round(meter.value * 100)}%
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: meter.color }}
                initial={{ width: 0 }}
                animate={{ width: `${meter.value * 100}%` }}
                transition={{ duration: 0.8, delay: 0.4, ease }}
              />
            </div>
            <div className="font-mono text-[9px] mt-1.5" style={{ color: colors.textMuted }}>
              {meter.hint}
            </div>
          </div>
        ))}
      </div>

      {/* No action here on purpose. The dashboard reports; withdrawing is a transaction and
          lives on the Deposit page, next to the balance it acts on. */}
    </motion.div>
  );
}

/**
 * The lender half of the dashboard: pool health and the action, plus the tranche split
 * when there is more than one tranche to split.
 *
 * Deliberately small. The headline lending figures live in the positions deck and the
 * yield curve lives in the History chart's Yield tab — repeating them here was the bulk of
 * what made the dashboard read like a report rather than a dashboard.
 */
export default function LendingSection({ lending }: { lending: LendingPosition }) {
  const multiPool = lending.holdings.length > 1;

  const poolSlices = lending.holdings.map((holding) => ({
    label: poolName(holding.pool),
    hint: `${formatUsd(holding.deposited)} · ${formatPct(holding.apy, 2)} APY`,
    value: holding.value,
    color: POOL_COLORS[holding.pool],
  }));

  return (
    <div className={`grid gap-4 ${multiPool ? 'grid-cols-1 lg:grid-cols-[1.4fr_1fr]' : 'grid-cols-1'}`}>
      <PoolHealthCard lending={lending} />

      {multiPool && (
        <AllocationDonut
          title="Across pools"
          delay={0.3}
          slices={poolSlices}
          centerLabel="Deposited"
          formatCenter={(total) => formatUsd(total)}
          ariaLabel="Deposited capital split across lending pools"
        />
      )}
    </div>
  );
}
