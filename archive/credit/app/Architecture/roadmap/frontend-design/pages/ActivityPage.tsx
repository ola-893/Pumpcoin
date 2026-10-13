import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ExternalLink, Info } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import PageHeader from '@/components/dashboard/PageHeader';
import TokenIcon from '@/components/TokenIcon';
import { KIND_META, tokenAccent, useLiveActivity, type ActivityKind } from '@/lib/activity';
import { PROTOCOL_ADDRESSES, explorerFor } from '@/lib/onchain';

const ease = [0.22, 1, 0.36, 1] as const;

const FILTERS: { key: ActivityKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'stream', label: 'Stream' },
  { key: 'repayment', label: 'Repayments' },
  { key: 'score', label: 'Score' },
  { key: 'deposit', label: 'Deposits' },
  { key: 'loan', label: 'Loans' },
  { key: 'sponsor', label: 'Sponsorships' },
  { key: 'default', label: 'Defaults' },
];

/**
 * The wallet's event history.
 *
 * Until the indexer is wired, the chain's own explorer is the honest event source —
 * every Deposit/Withdraw/Borrow/Repaid event is visible there against the contract
 * address. The simulated feed below is sample data, behind `?demo=1`, for judging the
 * eventual UI.
 */
export default function ActivityPage() {
  const colors = useTheme();
  const isDemo = new URLSearchParams(window.location.search).has('demo');
  const [filter, setFilter] = useState<ActivityKind | 'all'>('all');
  const live = useLiveActivity();

  const visible = useMemo(
    () => (filter === 'all' ? live : live.filter((e) => e.kind === filter)),
    [filter, live],
  );

  const counts = useMemo(() => {
    const map = new Map<ActivityKind, number>();
    for (const event of live) map.set(event.kind, (map.get(event.kind) ?? 0) + 1);
    return map;
  }, [live]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Activity"
        subtitle="Every protocol event on your wallet — deposits, borrows, repayments, and score changes."
      />

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {!isDemo && (
          <>
            {/* Real event source: the explorer, until the indexer is connected. */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08, ease }}
              className="rounded-2xl border shadow-sm p-6 mb-6"
              style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
            >
              <div className="flex items-start gap-3 mb-4">
                <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
                <p className="font-sans text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                  Your in-app event feed arrives with the indexer. Right now, every event your
                  wallet generates — collateral deposits, borrows, repayments — is recorded
                  onchain and visible on the explorer.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'CreditLine', address: PROTOCOL_ADDRESSES.creditLine, note: 'borrows, repays, collateral' },
                  { label: 'AttestationRegistry', address: PROTOCOL_ADDRESSES.attestationRegistry, note: 'credential writes' },
                  { label: 'RepaymentVault', address: PROTOCOL_ADDRESSES.repaymentVault, note: 'auto-repay budgets' },
                ].map((contract) => (
                  <a
                    key={contract.label}
                    href={explorerFor(contract.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 rounded-xl border transition-colors hover:bg-purple-50/40 group"
                    style={{ borderColor: colors.border }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-sans text-xs font-medium" style={{ color: colors.text }}>
                        {contract.label}
                      </span>
                      <ExternalLink
                        className="w-3 h-3 transition-opacity group-hover:opacity-100"
                        style={{ color: '#7C3AED', opacity: 0.5 }}
                        strokeWidth={1.5}
                      />
                    </div>
                    <div className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
                      {contract.note}
                    </div>
                  </a>
                ))}
              </div>
            </motion.div>

            {/* The sample feed, clearly offered as a demo. */}
            <div
              className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border mb-6 flex-wrap"
              style={{ borderColor: colors.border, backgroundColor: 'rgba(124,58,237,0.04)' }}
            >
              <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
                Want to see the feed design? It's available as sample data.
              </span>
              <a
                href="?demo=1"
                className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: '#7C3AED' }}
              >
                View sample feed
              </a>
            </div>
          </>
        )}

        {isDemo && (
          <div
            className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border mb-6 flex-wrap"
            style={{ borderColor: colors.border, backgroundColor: 'rgba(124,58,237,0.04)' }}
          >
            <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
              Sample data — simulated events for judging the UI, not your wallet's history.
            </span>
            <a
              href="/dashboard/activity"
              className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: '#7C3AED' }}
            >
              Back to real view
            </a>
          </div>
        )}

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
        >
          <div className="p-4 rounded-2xl border shadow-sm" style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}>
            <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>Events recorded</div>
            <div className="font-serif text-xl font-semibold" style={{ color: colors.text }}>{isDemo ? live.length : '—'}</div>
          </div>
          <div className="p-4 rounded-2xl border shadow-sm" style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}>
            <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>Stream ticks</div>
            <div className="font-serif text-xl font-semibold" style={{ color: colors.text }}>{isDemo ? counts.get('stream') ?? 0 : '—'}</div>
          </div>
          <div className="p-4 rounded-2xl border shadow-sm" style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}>
            <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>Defaults</div>
            <div className="font-serif text-xl font-semibold" style={{ color: '#BA7517' }}>{isDemo ? counts.get('default') ?? 0 : '—'}</div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16, ease }}
          className="flex items-center gap-2 mb-5 flex-wrap"
        >
          {FILTERS.map((option) => {
            const isActive = filter === option.key;
            const count = option.key === 'all' ? live.length : counts.get(option.key) ?? 0;
            return (
              <button
                key={option.key}
                onClick={() => setFilter(option.key)}
                className="px-3 py-1.5 rounded-lg font-sans text-xs transition-colors"
                style={{
                  backgroundColor: isActive ? '#7C3AED' : 'rgba(124,58,237,0.07)',
                  color: isActive ? '#FFFFFF' : '#7C3AED',
                }}
              >
                {option.label}
                {isDemo && (
                  <span className="font-mono text-[10px] ml-1.5" style={{ opacity: 0.7 }}>{count}</span>
                )}
              </button>
            );
          })}
        </motion.div>

        {/* Event list */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease }}
          className="rounded-2xl border shadow-sm overflow-x-auto"
          style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
        >
          <div
            className="grid grid-cols-[minmax(0,2.2fr)_1fr_84px] gap-3 sm:gap-4 px-4 sm:px-6 py-3 border-b text-[10px] font-mono uppercase tracking-widest min-w-[560px]"
            style={{ borderColor: colors.border, color: colors.textMuted }}
          >
            <span>Event</span>
            <span className="text-right">Amount</span>
            <span className="text-right">When</span>
          </div>

          <AnimatePresence mode="popLayout" initial={false}>
            {(isDemo ? visible : []).map((event, i) => {
              const meta = KIND_META[event.kind];
              const Icon = meta.Icon;
              const accent = event.symbol ? tokenAccent(event.symbol) : meta.color;
              return (
                <motion.div
                  key={event.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.28, delay: Math.min(i * 0.025, 0.3), ease }}
                  className="grid grid-cols-[minmax(0,2.2fr)_1fr_84px] gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 border-b last:border-b-0 items-center transition-colors hover:bg-purple-50/30 min-w-[560px]"
                  style={{ borderColor: colors.border }}
                >
                  <div className="flex items-center gap-3">
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
                        <span className="font-sans text-xs font-medium" style={{ color: colors.text }}>
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
                      <div className="font-mono text-[9px] truncate" style={{ color: colors.textMuted }}>
                        {event.detail}
                      </div>
                    </div>
                  </div>

                  <div className="font-mono text-xs text-right" style={{ color: accent }}>
                    {event.amount}
                  </div>

                  <div className="font-mono text-[10px] text-right" style={{ color: colors.textMuted }}>
                    {event.time}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {!isDemo && (
            <div className="px-6 py-14 text-center">
              <div className="font-sans text-sm mb-1" style={{ color: colors.text }}>
                No in-app events yet
              </div>
              <div className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
                The indexer hasn't been connected — see the explorer links above for your real history.
              </div>
            </div>
          )}

          {isDemo && visible.length === 0 && (
            <div className="px-6 py-12 text-center font-sans text-sm" style={{ color: colors.textMuted }}>
              No events of this type yet.
            </div>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
