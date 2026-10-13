import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Lock, MoreHorizontal } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import TokenIcon from '@/components/TokenIcon';
import {
  formatApr,
  formatCompactUsd,
  formatFullUsd,
  type Market,
} from '@/lib/markets';

const ease = [0.22, 1, 0.36, 1] as const;

interface Props {
  markets: Market[];
  /** Score of the connected wallet, or null when disconnected. */
  score: number | null;
  /** Opens the borrow flow for this market. Called only when connected. */
  onSelect: (market: Market) => void;
  /** Raised instead of `onSelect` when there is no wallet yet. */
  onRequireWallet: () => void;
}

export default function MarketTable({ markets, score, onSelect, onRequireWallet }: Props) {
  const colors = useTheme();
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

  return (
    <div
      className="rounded-2xl border shadow-sm overflow-x-auto"
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      {/* Column headers */}
      <div
        className="grid grid-cols-[1.9fr_0.7fr_0.8fr_1fr_1fr_120px] gap-4 px-4 sm:px-6 py-3 border-b text-[10px] font-mono uppercase tracking-widest min-w-[820px]"
        style={{ borderColor: colors.border, color: colors.textMuted, fontWeight: 600, letterSpacing: '0.1em' }}
      >
        <span>Asset</span>
        <span>Min score</span>
        <span className="text-right">Base APR</span>
        <span className="text-right">Total borrows</span>
        <span className="text-right">Liquidity</span>
        <span />
      </div>

      {markets.map((market, i) => {
        const isSoon = market.status === 'soon';
        const gated = market.minScore > 0;
        // A connected wallet below the gate sees the market but can't open it.
        const blocked = gated && score !== null && score < market.minScore;
        // Not-yet-deployed reserves are inert regardless of wallet state.
        const inert = isSoon || blocked;

        return (
          <motion.div
            key={`${market.pool}-${market.symbol}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.3), ease }}
            className="grid grid-cols-[1.9fr_0.7fr_0.8fr_1fr_1fr_120px] gap-4 px-4 sm:px-6 py-4 border-b last:border-b-0 items-center transition-colors hover:bg-purple-50/30 min-w-[820px]"
            style={{ borderColor: colors.border, opacity: isSoon ? 0.6 : 1 }}
          >
            {/* Asset — the name links to the market's detail page */}
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
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#639922' }} />
                      <span className="font-mono text-[9px]" style={{ color: '#639922' }}>
                        Live
                      </span>
                    </span>
                  )}
                </div>
                <div className="font-mono text-[9px] truncate" style={{ color: colors.textMuted }}>
                  {market.name}
                </div>
              </div>
            </div>

            {/* Score gate */}
            <div className="flex items-center gap-1.5">
              {isSoon ? (
                <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>—</span>
              ) : gated ? (
                <>
                  <Lock className="w-3 h-3" style={{ color: colors.textMuted }} strokeWidth={1.5} />
                  <span className="font-mono text-[10px]" style={{ color: colors.textSecondary }}>
                    {market.minScore}+
                  </span>
                </>
              ) : (
                <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
                  Any
                </span>
              )}
            </div>

            {/* APR — the planned rate is still useful for a reserve that isn't live yet */}
            <div className="text-right">
              <div className="font-mono text-xs tabular-nums" style={{ color: isSoon ? colors.textMuted : colors.text }}>
                {formatApr(market.baseApr)}
              </div>
              {isSoon && (
                <div className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
                  target
                </div>
              )}
            </div>

            {/* Total borrows */}
            <div className="text-right">
              {isSoon ? (
                <div className="font-mono text-xs" style={{ color: colors.textMuted }}>—</div>
              ) : (
                <>
                  <div className="font-mono text-xs tabular-nums" style={{ color: colors.text }}>
                    {formatCompactUsd(market.totalBorrows)}
                  </div>
                  <div className="font-mono text-[9px] tabular-nums" style={{ color: colors.textMuted }}>
                    {formatFullUsd(market.totalBorrows)}
                  </div>
                </>
              )}
            </div>

            {/* Liquidity */}
            <div className="text-right">
              {isSoon ? (
                <div className="font-mono text-xs" style={{ color: colors.textMuted }}>—</div>
              ) : (
                <>
                  <div className="font-mono text-xs tabular-nums" style={{ color: colors.text }}>
                    {formatCompactUsd(market.liquidity)}
                  </div>
                  <div className="font-mono text-[9px] tabular-nums" style={{ color: colors.textMuted }}>
                    {formatFullUsd(market.liquidity)}
                  </div>
                </>
              )}
            </div>

            {/* Action */}
            <div className="flex justify-end relative" ref={openMenu === market.symbol ? menuRef : undefined}>
              {isSoon ? (
                <span
                  className="px-3 py-2 rounded-lg font-mono text-[9px] uppercase tracking-widest"
                  style={{ backgroundColor: 'rgba(136,135,128,0.1)', color: colors.textMuted }}
                >
                  Coming soon
                </span>
              ) : (
                <>
                  <button
                    onClick={() => setOpenMenu(openMenu === market.symbol ? null : market.symbol)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center border transition-colors hover:bg-white"
                    style={{
                      borderColor: colors.border,
                      cursor: blocked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <MoreHorizontal className="w-4 h-4" style={{ color: colors.textMuted }} strokeWidth={2} />
                  </button>

                  {openMenu === market.symbol && (
                    <div
                      className="absolute right-0 top-full mt-1 w-44 rounded-xl border shadow-lg z-20 overflow-hidden"
                      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)' }}
                    >
                      <button
                        onClick={() => {
                          setOpenMenu(null);
                          if (score === null) onRequireWallet();
                          else onSelect(market);
                        }}
                        disabled={inert}
                        title={blocked ? `Requires a score of ${market.minScore}` : undefined}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 font-sans text-xs transition-colors hover:bg-purple-50 text-left"
                        style={{ color: blocked ? colors.textMuted : colors.text }}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" style={{ color: blocked ? colors.textMuted : '#7C3AED' }} strokeWidth={1.5} />
                        Borrow
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
          </motion.div>
        );
      })}
    </div>
  );
}
