import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, MoreHorizontal } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import PageHeader, { StatusNote } from '@/components/dashboard/PageHeader';
import WithdrawDialog from '@/components/dashboard/WithdrawDialog';
import DepositDialog from '@/components/dashboard/DepositDialog';
import TokenIcon from '@/components/TokenIcon';
import {
  MARKETS,
  POOLS,
  POOL_COLORS,
  formatApr,
  formatCompactUsd,
  formatFullUsd,
  liveMarkets,
  marketDeposits,
  supplyApy,
  utilizationOf,
  type Market,
  type PoolId,
} from '@/lib/markets';
import { positionValue, resolveWalletState } from '@/lib/position';

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Columns: asset, APY, total supplied, capacity filled, available, your balance, action.
 *
 * Numeric columns are fixed-width and right-aligned. With `fr` widths a number sits at the
 * left of a too-wide column, so the gap to the next column reads as uneven even though the
 * gap is constant — right-aligning makes every value hug the same edge and the spacing reads
 * true. Only the asset column flexes.
 */
const GRID =
  'grid-cols-[minmax(0,1.5fr)_76px_112px_120px_96px_112px_150px]';

function formatExactUsd(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * How full the deposit cap is.
 *
 * Aave surfaces this on its deposit table and it is the single most useful thing on the row:
 * it tells a supplier whether there is room, and it warns existing suppliers that they are
 * near the point where the rate curve steepens.
 */
function CapacityBar({ filled, tone }: { filled: number; tone: string }) {
  const colors = useTheme();
  return (
    <div className="flex items-center justify-end gap-2">
      <div
        className="w-12 h-1 rounded-full overflow-hidden shrink-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: tone }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(filled, 1) * 100}%` }}
          transition={{ duration: 0.8, delay: 0.3, ease }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums w-8 text-right" style={{ color: colors.textMuted }}>
        {Math.round(filled * 100)}%
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
  action,
  delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
  action?: React.ReactNode;
  delay?: number;
}) {
  const colors = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      className="p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      <div className="min-w-0">
        <div
          className="font-mono text-[9px] uppercase tracking-widest mb-1.5"
          style={{ color: colors.textMuted }}
        >
          {label}
        </div>
        <div
          className="font-serif text-xl font-semibold tabular-nums leading-none"
          style={{ color: tone ?? colors.text }}
        >
          {value}
        </div>
        {hint && (
          <div className="font-mono text-[9px] mt-1.5" style={{ color: colors.textMuted }}>
            {hint}
          </div>
        )}
      </div>
      {action}
    </motion.div>
  );
}

/**
 * Deposit page, grouped by pool the way Aave groups by hub.
 *
 * Each pool gets its own section with a description and a total, because the pools are a
 * choice — general-purpose, low-risk, or sponsor-backed — and a flat list of assets hides
 * that. Every row reads from `lib/markets`, so this page and the borrow page cannot quote
 * different sizes or rates for the same reserve.
 */
export default function LendPage() {
  const colors = useTheme();
  const { search } = useLocation();
  // Demo scenarios remain available via ?state=; the default view shows real wallet data
  // from the deployed contracts (the Unora pools are not live yet, so user figures are 0).
  const demo = resolveWalletState(search);
  const position = new URLSearchParams(search).has('state') ? demo.position : { scored: false, lending: null };
  const [withdrawPool, setWithdrawPool] = useState<PoolId | null | undefined>(undefined);
  const [depositPool, setDepositPool] = useState<PoolId | null | undefined>(undefined);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Principal plus yield, so this figure equals the sum of the per-row balances below it.
  const deposited = position.lending ? positionValue(position.lending) : 0;

  const live = liveMarkets();
  const totalSupplied = live.reduce((sum, m) => sum + marketDeposits(m), 0);
  const totalBorrowed = live.reduce((sum, m) => sum + m.totalBorrows, 0);
  const weightedApy =
    totalSupplied > 0
      ? live.reduce((sum, m) => sum + supplyApy(m) * marketDeposits(m), 0) / totalSupplied
      : 0;

  // Deposits are USDC tranches, so a holding belongs to the USDC market whatever tranche it
  // sits in — the same rule the market detail page uses.
  const holdingFor = (market: Market) =>
    market.symbol === 'USDC'
      ? (position.lending?.holdings.find((h) => h.pool === market.pool) ?? null)
      : null;

  return (
    <DashboardLayout>
      <PageHeader
        title="Deposit"
        subtitle="Supply assets to Unora pools and earn yield. Your deposits fund borrower credit lines backed by onchain reputation."          note={
            <StatusNote>
              Demo market data · deposit contracts land with the Unora pools
            </StatusNote>
          }
      />

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Protocol totals, then the wallet's own position */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Total deposits"
            value={formatCompactUsd(totalSupplied)}
            hint={formatFullUsd(totalSupplied)}
            delay={0.05}
          />
          <StatCard
            label="Total loans"
            value={formatCompactUsd(totalBorrowed)}
            hint={`${((totalBorrowed / (totalSupplied || 1)) * 100).toFixed(1)}% utilized`}
            delay={0.1}
          />
          <StatCard
            label="Average APY"
            value={`${(weightedApy * 100).toFixed(2)}%`}
            hint="weighted across live pools"
            tone="#639922"
            delay={0.15}
          />
          <StatCard
            label="Your deposits"
            value={formatExactUsd(deposited)}
            hint={
              position.lending
                ? `incl. ${formatExactUsd(position.lending.accruedYield)} yield`
                : 'nothing supplied yet'
            }
            tone={deposited > 0 ? '#639922' : undefined}
            delay={0.2}
          />
        </div>

        {/* One section per pool */}
        {POOLS.map((pool, poolIndex) => {
          const markets = MARKETS.filter((m) => m.pool === pool.id);
          if (markets.length === 0) return null;

          const poolSupplied = markets
            .filter((m) => m.status === 'live')
            .reduce((sum, m) => sum + marketDeposits(m), 0);
          const liveCount = markets.filter((m) => m.status === 'live').length;

          return (
            <motion.section
              key={pool.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 + poolIndex * 0.06, ease }}
            >
              {/* Pool header — the hub block */}
              <div className="flex items-end justify-between gap-6 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: `${POOL_COLORS[pool.id]}18` }}
                  >
                    <span
                      className="font-serif font-bold text-sm"
                      style={{ color: POOL_COLORS[pool.id] }}
                    >
                      {pool.name.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-serif text-lg" style={{ color: colors.text }}>
                      {pool.name}
                    </h2>
                    <p
                      className="font-sans text-xs leading-relaxed max-w-xl"
                      style={{ color: colors.textSecondary }}
                    >
                      {pool.description}
                    </p>
                    <p className="font-mono text-[9px] mt-1" style={{ color: colors.textMuted }}>
                      {pool.riskNote}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className="font-mono text-[9px] uppercase tracking-widest"
                    style={{ color: colors.textMuted }}
                  >
                    Total deposits
                  </div>
                  <div
                    className="font-mono text-xs tabular-nums mt-0.5"
                    style={{ color: colors.text }}
                  >
                    {poolSupplied > 0 ? formatCompactUsd(poolSupplied) : '—'}
                  </div>
                  <div className="font-mono text-[9px] mt-0.5" style={{ color: colors.textMuted }}>
                    {liveCount} of {markets.length} live
                  </div>
                </div>
              </div>

              {/* Pool table */}
              {/* Scrolls sideways rather than clipping. `overflow-hidden` here silently cut
                  off the right-hand columns below ~1100px with no way to reach them. */}
              <div
                className="rounded-2xl border shadow-sm overflow-x-auto"
                style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
              >
                <div
                  className={`grid ${GRID} gap-4 px-4 sm:px-6 py-3 border-b text-[10px] font-mono uppercase tracking-widest min-w-[980px]`}
                  style={{ borderColor: colors.border, color: colors.textMuted, fontWeight: 600, letterSpacing: '0.1em' }}
                >
                  <span>Asset</span>
                  <span className="text-right">APY</span>
                  <span className="text-right">Total supplied</span>
                  <span className="text-right">Capacity</span>
                  <span className="text-right">Available</span>
                  <span className="text-right">Your balance</span>
                  <span className="text-right">Actions</span>
                </div>

                {markets.map((market) => {
                  const isSoon = market.status === 'soon';
                  const deposits = marketDeposits(market);
                  const cap = market.supplyCap;
                  const filled = isSoon || cap === 0 ? 0 : deposits / cap;
                  const holding = holdingFor(market);

                  return (
                    <div
                      key={`${market.pool}-${market.symbol}`}
                      className={`grid ${GRID} gap-4 px-4 sm:px-6 py-4 border-b last:border-b-0 items-center transition-colors hover:bg-purple-50/30 min-w-[980px]`}
                      style={{ borderColor: colors.border, opacity: isSoon ? 0.6 : 1 }}
                    >
                      {/* Asset */}
                      <div className="flex items-center gap-3 min-w-0">
                        <TokenIcon symbol={market.symbol} color={market.accent} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/borrow/${market.symbol}`}
                              className="font-sans text-xs font-medium hover:underline underline-offset-2"
                              style={{ color: colors.text }}
                            >
                              {market.symbol}
                            </Link>
                            {!isSoon && (
                              <span className="flex items-center gap-1">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: '#639922' }}
                                />
                                <span className="font-mono text-[9px]" style={{ color: '#639922' }}>
                                  Live
                                </span>
                              </span>
                            )}
                          </div>
                          <div
                            className="font-mono text-[9px] truncate"
                            style={{ color: colors.textMuted }}
                          >
                            {market.name}
                          </div>
                        </div>
                      </div>

                      {/* APY. Undefined before deployment — there is no utilization to
                          derive a supply rate from, and showing the borrow rate here was
                          the same bug already fixed on the borrow page. */}
                      <div
                        className="font-mono text-sm tabular-nums text-right"
                        style={{ color: isSoon ? colors.textMuted : '#639922' }}
                      >
                        {isSoon ? '—' : formatApr(supplyApy(market))}
                      </div>

                      {/* Total supplied */}
                      <div className="text-right">
                        <div className="font-mono text-xs tabular-nums" style={{ color: colors.text }}>
                          {isSoon ? '—' : formatCompactUsd(deposits)}
                        </div>
                        {!isSoon && (
                          <div className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
                            {utilizationOf(market) > 0
                              ? `${(utilizationOf(market) * 100).toFixed(0)}% utilized`
                              : 'no borrows'}
                          </div>
                        )}
                      </div>

                      {/* Capacity */}
                      <div className="text-right">
                        {isSoon ? (
                          <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
                            —
                          </span>
                        ) : (
                          <CapacityBar
                            filled={filled}
                            tone={filled > 0.85 ? '#BA7517' : POOL_COLORS[market.pool]}
                          />
                        )}
                      </div>

                      {/* Available */}
                      <div className="text-right font-mono text-xs tabular-nums" style={{ color: colors.textMuted }}>
                        {isSoon ? '—' : formatCompactUsd(market.liquidity)}
                      </div>

                      {/* Your balance — withdraw opens preselected to this pool when
                          the wallet actually holds here, deposit otherwise. */}
                      <div className="text-right">
                        {isSoon ? (
                          <span className="font-mono text-xs tabular-nums" style={{ color: colors.textMuted }}>
                            —
                          </span>
                        ) : holding ? (
                          <button
                            onClick={() => setWithdrawPool(market.pool)}
                            className="font-mono text-xs tabular-nums underline-offset-2 hover:underline"
                            style={{ color: colors.text }}
                          >
                            {formatExactUsd(holding.value)}
                          </button>
                        ) : (
                          <span className="font-mono text-xs tabular-nums" style={{ color: colors.textMuted }}>
                            $0.00
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end relative" ref={openMenu === `${market.pool}-${market.symbol}` ? menuRef : undefined}>
                        {isSoon ? (
                          <span
                            className="px-3 py-2 rounded-lg font-mono text-[9px] uppercase tracking-widest whitespace-nowrap"
                            style={{
                              backgroundColor: 'rgba(136,135,128,0.1)',
                              color: colors.textMuted,
                            }}
                          >
                            Coming soon
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => setOpenMenu(openMenu === `${market.pool}-${market.symbol}` ? null : `${market.pool}-${market.symbol}`)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center border transition-colors hover:bg-white"
                              style={{ borderColor: colors.border }}
                            >
                              <MoreHorizontal className="w-4 h-4" style={{ color: colors.textMuted }} strokeWidth={2} />
                            </button>

                            {openMenu === `${market.pool}-${market.symbol}` && (
                              <div
                                className="absolute right-0 top-full mt-1 w-44 rounded-xl border shadow-lg z-20 overflow-hidden"
                                style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)' }}
                              >
                                <button
                                  onClick={() => {
                                    setOpenMenu(null);
                                    setDepositPool(market.pool);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-4 py-2.5 font-sans text-xs transition-colors hover:bg-purple-50 text-left"
                                  style={{ color: colors.text }}
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
                                  Deposit
                                </button>
                                <Link
                                  to={`/borrow/${market.symbol}`}
                                  onClick={() => setOpenMenu(null)}
                                  className="w-full flex items-center gap-2.5 px-4 py-2.5 font-sans text-xs transition-colors hover:bg-purple-50"
                                  style={{ color: colors.text }}
                                >
                                  <ArrowUpRight className="w-3.5 h-3.5" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
                                  View details
                                </Link>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.section>
          );
        })}
      </div>

      {withdrawPool !== undefined && position.lending && (
        <WithdrawDialog
          lending={position.lending}
          preselectedPool={withdrawPool}
          onClose={() => setWithdrawPool(undefined)}
        />
      )}

      {depositPool !== undefined && (
        <DepositDialog
          preselectedPool={depositPool}
          onClose={() => setDepositPool(undefined)}
        />
      )}
    </DashboardLayout>
  );
}
