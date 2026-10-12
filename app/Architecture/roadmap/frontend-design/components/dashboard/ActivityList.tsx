import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { Search, SlidersHorizontal } from 'lucide-react';
import TokenIcon from '@/components/TokenIcon';
import {
  GROUP_ORDER,
  KIND_META,
  groupFor,
  recentActivity,
  tokenAccent,
  useLiveActivity,
  type ActivityGroupLabel,
} from '@/lib/activity';

const ease = [0.22, 1, 0.36, 1] as const;

/** How many events the dashboard shows. The full feed lives at /dashboard/activity. */
const RECENT_COUNT = 5;

/**
 * The most recent events, grouped the way a statement reads.
 *
 * Reads from the same canonical list as the Activity page, so "View all" lands on the feed
 * you were just looking at. These used to be two separate hardcoded arrays that disagreed
 * about what had happened.
 */
export default function ActivityList() {
  const colors = useTheme();
  const live = useLiveActivity();
  const events = recentActivity(live, RECENT_COUNT);

  const groups: { label: ActivityGroupLabel; items: typeof events }[] = GROUP_ORDER.map(
    (label) => ({ label, items: events.filter((event) => groupFor(event.age) === label) }),
  ).filter((group) => group.items.length > 0);

  // Flat index per row, so the stagger keeps counting across groups without a counter
  // mutated during render.
  const groupOffsets = groups.map((_, gi) =>
    groups.slice(0, gi).reduce((total, group) => total + group.items.length, 0),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease }}
      className="rounded-2xl border shadow-sm p-5"
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <span className="font-sans text-xs font-medium" style={{ color: colors.text }}>
          Transactions
        </span>
        <div className="flex items-center gap-2">
          <button
            aria-label="Search transactions"
            className="w-7 h-7 rounded-lg flex items-center justify-center border transition-colors hover:bg-white"
            style={{ borderColor: colors.border }}
          >
            <Search className="w-3.5 h-3.5" style={{ color: colors.textMuted }} strokeWidth={1.5} />
          </button>
          <button
            aria-label="Filter transactions"
            className="w-7 h-7 rounded-lg flex items-center justify-center border transition-colors hover:bg-white"
            style={{ borderColor: colors.border }}
          >
            <SlidersHorizontal
              className="w-3.5 h-3.5"
              style={{ color: colors.textMuted }}
              strokeWidth={1.5}
            />
          </button>
          <Link
            to="/dashboard/activity"
            className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'rgba(124,58,237,0.07)', color: '#7C3AED' }}
          >
            View all
          </Link>
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-5">
        {groups.map((group, gi) => (
          <div key={group.label}>
            <div
              className="font-mono text-[9px] uppercase tracking-widest mb-2"
              style={{ color: colors.textMuted }}
            >
              {group.label}
            </div>

            <div className="space-y-0.5">
              {group.items.map((event, ii) => {
                const meta = KIND_META[event.kind];
                const Icon = meta.Icon;
                const accent = event.symbol ? tokenAccent(event.symbol) : meta.color;
                return (
                  <motion.div
                    key={event.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.45 + (groupOffsets[gi] + ii) * 0.04, ease }}
                    className="flex items-center justify-between gap-3 px-2 py-2.5 rounded-xl transition-colors hover:bg-purple-50/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* The token that moved, where one did. Events that aren't transfers —
                          a score update, a capacity delegation — keep the kind's own icon
                          rather than being badged with an asset they didn't touch. */}
                      {event.symbol ? (
                        <TokenIcon symbol={event.symbol} color={accent} size={36} />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${meta.color}15` }}
                        >
                          <Icon className="w-4 h-4" style={{ color: meta.color }} strokeWidth={1.5} />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-sans text-xs font-medium truncate"
                            style={{ color: colors.text }}
                          >
                            {event.name}
                          </span>
                          {event.symbol && (
                            <span
                              className="font-mono text-[8px] px-1.5 py-0.5 rounded shrink-0"
                              style={{ backgroundColor: `${accent}18`, color: accent }}
                            >
                              {event.symbol}
                            </span>
                          )}
                        </div>
                        <div
                          className="font-mono text-[9px] truncate"
                          style={{ color: colors.textMuted }}
                        >
                          {event.detail} · {event.time}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-xs tabular-nums" style={{ color: accent }}>
                        {event.amount}
                      </div>
                      <div className="font-mono text-[8px]" style={{ color: colors.textMuted }}>
                        {meta.short}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
