import { motion } from 'motion/react';
import { Lock, Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { SCORE } from '@/lib/protocol';
import { TIER_LADDER, pointsToNextTier, type TierState } from '@/lib/position';

const ease = [0.22, 1, 0.36, 1] as const;

const STATE_META: Record<TierState, { label: string; color: string }> = {
  current: { label: 'Current', color: '#7C3AED' },
  cleared: { label: 'Passed', color: '#639922' },
  locked: { label: 'Locked', color: '#BA7517' },
};

/**
 * The score-to-terms ladder, as a comparison row rather than a fanned deck.
 *
 * This lives on the Borrow page because that is where the question is live: "what would a
 * better score actually get me?" On the dashboard it was reference material competing with
 * the wallet's own numbers for the hero slot.
 *
 * Ordered lowest rung first so it reads as a ladder to climb.
 */
export default function TierLadder() {
  const colors = useTheme();
  const next = pointsToNextTier(SCORE.value);

  // Cheapest terms last, so the row climbs left to right.
  const rungs = [...TIER_LADDER].sort((a, b) => a.minScore - b.minScore);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
          Your tier sets your collateral
        </span>
        <span className="font-mono text-[9px]" style={{ color: '#7C3AED' }}>
          {next ? `${next.gap} pts to ${next.rung.name}` : 'Top tier reached'}
        </span>
      </div>

      {/* Three across only where there is room. At 390px each card gets ~100px, which is
          narrower than its own contents — the badge and the ceiling both spill out. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {rungs.map((tier, i) => {
          const meta = STATE_META[tier.state];
          return (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease }}
              className="rounded-2xl border shadow-sm p-5"
              style={{
                borderColor: tier.state === 'current' ? tier.color : colors.border,
                backgroundColor: tier.state === 'current' ? tier.fill : 'rgba(255,255,255,0.6)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="font-serif text-lg font-semibold" style={{ color: colors.text }}>
                  {tier.name}
                </span>
                <div
                  className="flex items-center gap-1 px-2 py-1 rounded-full shrink-0"
                  style={{ backgroundColor: `${meta.color}1F` }}
                >
                  {tier.state === 'locked' ? (
                    <Lock className="w-2.5 h-2.5" style={{ color: meta.color }} strokeWidth={2} />
                  ) : (
                    <Check className="w-2.5 h-2.5" style={{ color: meta.color }} strokeWidth={2.5} />
                  )}
                  <span
                    className="font-mono text-[9px] uppercase tracking-widest"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>
              </div>

              <div className="flex items-baseline gap-2 mb-1">
                <span
                  className="font-serif text-3xl font-semibold tabular-nums"
                  style={{ color: colors.text }}
                >
                  {tier.ratio}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
                  collateral
                </span>
              </div>

              <div
                className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4 pt-3.5 border-t"
                style={{ borderColor: colors.border }}
              >
                <div>
                  <div
                    className="font-mono text-[8px] uppercase tracking-widest"
                    style={{ color: colors.textMuted }}
                  >
                    Entry score
                  </div>
                  <div className="font-mono text-sm tabular-nums" style={{ color: colors.text }}>
                    {tier.minScore}
                  </div>
                </div>
                <div>
                  <div
                    className="font-mono text-[8px] uppercase tracking-widest"
                    style={{ color: colors.textMuted }}
                  >
                    Ceiling
                  </div>
                  <div className="font-mono text-sm tabular-nums" style={{ color: colors.text }}>
                    {tier.ceiling}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
