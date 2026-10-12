import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Search } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import TierLadder from '@/components/dashboard/TierLadder';
import PageHeader, { StatusNote } from '@/components/dashboard/PageHeader';
import MarketTable from '@/components/borrow/MarketTable';
import BorrowFlow from '@/components/borrow/BorrowFlow';
import { useUnoraWallet } from '@/hooks/useUnoraWallet';
import { SCORE } from '@/lib/protocol';
import {
  MARKETS,
  POOLS,
  formatCompactUsd,
  totalBorrows,
  totalDeposits,
  type Market,
  type PoolId,
} from '@/lib/markets';

const ease = [0.22, 1, 0.36, 1] as const;

type SortKey = 'liquidity' | 'apr' | 'borrows';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'apr', label: 'Lowest APR' },
  { key: 'borrows', label: 'Total borrows' },
];

export default function BorrowPage() {
  const colors = useTheme();
  const { authenticated, isCorrectNetwork, login } = useUnoraWallet();

  const [selected, setSelected] = useState<Market | null>(null);
  const [poolFilter, setPoolFilter] = useState<PoolId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('liquidity');

  /** `null` while disconnected — the tables read this to decide what's actionable. */
  const score = authenticated ? SCORE.value : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = MARKETS.filter((m) => {
      if (poolFilter !== 'all' && m.pool !== poolFilter) return false;
      if (!q) return true;
      return m.symbol.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });

    return filtered.sort((a, b) => {
      // Deployed reserves always float above roadmap ones, whatever the sort key.
      if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
      if (sortKey === 'apr') return a.baseApr - b.baseApr;
      if (sortKey === 'borrows') return b.totalBorrows - a.totalBorrows;
      return b.liquidity - a.liquidity;
    });
  }, [poolFilter, query, sortKey]);

  /** Pools with at least one matching market, in the canonical order. */
  const sections = useMemo(
    () =>
      POOLS.map((pool) => {
        const poolMarkets = visible.filter((m) => m.pool === pool.id);
        return {
          pool,
          markets: poolMarkets,
          // Only deployed reserves carry real principal — a pool of roadmap assets is empty.
          borrows: poolMarkets
            .filter((m) => m.status === 'live')
            .reduce((sum, m) => sum + m.totalBorrows, 0),
        };
      }).filter((section) => section.markets.length > 0),
    [visible],
  );

  const isFiltered = poolFilter !== 'all' || query.trim() !== '';

  return (
    <DashboardLayout>
        <PageHeader
          title="Borrow"
          subtitle="Borrow against your onchain credit history, not a fixed overcollateralised deposit. The better your record, the less you lock."
          note={
            <StatusNote>
              Demo market data · credit-line contracts live on Monad testnet
            </StatusNote>
          }
        >
          <Stat label="Total deposits" value={totalDeposits()} />
          <Stat label="Total loans" value={totalBorrows()} />
        </PageHeader>

        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {/* Filters — hidden once a market is opened */}
          {!selected && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12, ease }}
              className="flex items-center gap-2 mb-6 flex-wrap"
            >
              <FilterChip
                label="All pools"
                count={MARKETS.length}
                active={poolFilter === 'all'}
                onClick={() => setPoolFilter('all')}
              />
              {POOLS.map((pool) => (
                <FilterChip
                  key={pool.id}
                  label={pool.name}
                  count={MARKETS.filter((m) => m.pool === pool.id).length}
                  active={poolFilter === pool.id}
                  onClick={() => setPoolFilter(pool.id)}
                />
              ))}

              <div className="ml-auto flex items-center gap-3">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                  style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
                >
                  <Search className="w-3.5 h-3.5" style={{ color: colors.textMuted }} strokeWidth={1.5} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter assets"
                    aria-label="Filter assets"
                    className="bg-transparent outline-none font-sans text-xs w-32"
                    style={{ color: colors.text }}
                  />
                </div>

                <div
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border"
                  style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
                >
                  <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
                    Sort
                  </span>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    aria-label="Sort markets"
                    className="bg-transparent outline-none font-sans text-xs cursor-pointer"
                    style={{ color: colors.text }}
                  >
                    {SORTS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {/* Market list, or the borrow flow once a market is opened */}
          {selected && authenticated ? (
            <BorrowFlow
              market={selected}
              isCorrectNetwork={isCorrectNetwork}
              onBack={() => setSelected(null)}
            />
          ) : (
            <div className="space-y-8">
              {sections.map(({ pool, markets, borrows: poolBorrows }, index) => (
                <motion.section
                  key={pool.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.18 + index * 0.06, ease }}
                >
                  <div className="flex items-end justify-between gap-6 mb-3">
                    <div className="min-w-0">
                      <h2 className="font-serif text-lg" style={{ color: colors.text }}>
                        {pool.name}
                      </h2>
                      <p className="font-sans text-xs leading-relaxed max-w-xl" style={{ color: colors.textSecondary }}>
                        {pool.description}
                      </p>
                      <p className="font-mono text-[9px] mt-1" style={{ color: colors.textMuted }}>
                        {pool.riskNote}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
                        Total borrowed
                      </div>
                      <div className="font-mono text-xs tabular-nums" style={{ color: colors.text }}>
                        {poolBorrows > 0 ? formatCompactUsd(poolBorrows) : '—'}
                      </div>
                    </div>
                  </div>

                  <MarketTable
                    markets={markets}
                    score={score}
                    onSelect={(market) => setSelected(market)}
                    onRequireWallet={login}
                  />
                </motion.section>
              ))}

              {sections.length === 0 && (
                <div
                  className="rounded-2xl border shadow-sm px-6 py-16 text-center"
                  style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
                >
                  <div className="font-sans text-sm mb-1" style={{ color: colors.text }}>
                    No markets match {isFiltered ? 'that filter' : 'your score'}
                  </div>
                  <div className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
                    Try a different asset or pool.
                  </div>
                </div>
              )}

              <p className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
                Rates shown are base rates. Your score moves your collateral ratio, not the market rate.
              </p>

              {/* The ladder belongs here, where the trade-off is the live question. */}
              <TierLadder />
            </div>
          )}
        </div>
    </DashboardLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const colors = useTheme();
  return (
    <div className="text-right">
      <div className="font-mono text-[9px] uppercase tracking-widest mb-0.5" style={{ color: colors.textMuted }}>
        {label}
      </div>
      <div className="font-serif text-xl font-semibold tabular-nums" style={{ color: colors.text }}>
        {formatCompactUsd(value)}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg font-sans text-xs transition-colors"
      style={{
        backgroundColor: active ? '#7C3AED' : 'rgba(124,58,237,0.07)',
        color: active ? '#FFFFFF' : '#7C3AED',
      }}
    >
      {label}
      <span className="font-mono text-[10px] ml-1.5" style={{ opacity: 0.7 }}>
        {count}
      </span>
    </button>
  );
}
