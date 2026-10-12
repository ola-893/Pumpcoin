import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Users,
  Coins,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { MARKETS } from '@/lib/markets';

interface SearchEntry {
  label: string;
  hint: string;
  group: string;
  to: string;
  Icon: LucideIcon;
  /** Extra terms that should match but aren't shown. */
  keywords?: string;
}

const PAGES: SearchEntry[] = [
  { label: 'Dashboard', hint: 'Score, tiers, activity', group: 'Pages', to: '/dashboard', Icon: LayoutDashboard },
  { label: 'Borrow', hint: 'Markets and loan terms', group: 'Pages', to: '/borrow', Icon: ArrowUpRight },
  { label: 'Deposit', hint: 'Supply assets, earn yield', group: 'Pages', to: '/lend', Icon: ArrowDownLeft },
  { label: 'Activity', hint: 'Every protocol event', group: 'Pages', to: '/dashboard/activity', Icon: Clock },
  { label: 'Sponsors', hint: 'Delegated capacity graph', group: 'Pages', to: '/sponsor/graph', Icon: Users },
];

const MARKET_ENTRIES: SearchEntry[] = MARKETS.map((market) => ({
  label: market.symbol,
  hint:
    market.status === 'live'
      ? `${market.name} · live on testnet`
      : `${market.name} · coming soon`,
  group: 'Markets',
  to: '/borrow',
  Icon: Coins,
  keywords: `${market.name} ${market.pool}`,
}));

const INDEX: SearchEntry[] = [...PAGES, ...MARKET_ENTRIES];

export default function GlobalSearch() {
  const colors = useTheme();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return INDEX.filter((entry) =>
      `${entry.label} ${entry.hint} ${entry.keywords ?? ''}`.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query]);

  // Close when focus leaves the whole widget, not the input — otherwise clicking a
  // result would unmount the list before the click registers.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Cmd/Ctrl-K focuses the field, which is what anyone will try first.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(entry: SearchEntry) {
    navigate(entry.to);
    setQuery('');
    setOpen(false);
    input.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
      return;
    }
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (c + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (c - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[Math.min(cursor, results.length - 1)]);
    }
  }

  const showList = open && query.trim().length > 0;

  return (
    <div ref={wrapper} className="relative">
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors"
        style={{
          borderColor: showList ? '#7C3AED' : colors.border,
          backgroundColor: 'rgba(255,255,255,0.7)',
        }}
      >
        <Search className="w-3.5 h-3.5 shrink-0" style={{ color: colors.textMuted }} strokeWidth={1.5} />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search"
          aria-label="Search Unora"
          role="combobox"
          aria-expanded={showList}
          aria-controls="global-search-results"
          className="bg-transparent outline-none font-sans text-xs w-32 focus:w-44 transition-[width] duration-200"
          style={{ color: colors.text }}
        />
        <kbd
          className="font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0 hidden sm:block"
          style={{ borderColor: colors.border, color: colors.textMuted }}
        >
          ⌘K
        </kbd>
      </div>

      {showList && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute right-0 top-full mt-2 w-72 rounded-2xl border shadow-lg overflow-hidden z-30"
          style={{ borderColor: colors.border, backgroundColor: '#FFFDFB' }}
        >
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="font-sans text-xs" style={{ color: colors.text }}>
                No matches for “{query.trim()}”
              </div>
              <div className="font-mono text-[9px] mt-1" style={{ color: colors.textMuted }}>
                Try an asset, or a page name
              </div>
            </div>
          ) : (
            results.map((entry, i) => {
              const Icon = entry.Icon;
              const isCursor = i === cursor;
              return (
                <button
                  key={`${entry.group}-${entry.label}`}
                  role="option"
                  aria-selected={isCursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(entry)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors"
                  style={{ backgroundColor: isCursor ? 'rgba(124,58,237,0.06)' : 'transparent' }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-sans text-xs truncate" style={{ color: colors.text }}>
                      {entry.label}
                    </div>
                    <div className="font-mono text-[9px] truncate" style={{ color: colors.textMuted }}>
                      {entry.hint}
                    </div>
                  </div>
                  {isCursor && (
                    <CornerDownLeft
                      className="w-3 h-3 shrink-0"
                      style={{ color: colors.textMuted }}
                      strokeWidth={1.5}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
