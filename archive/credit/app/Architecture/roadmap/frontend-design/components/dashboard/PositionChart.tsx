import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { SCORE } from '@/lib/protocol';
import {
  BORROWED_SERIES,
  REPAID_SERIES,
  SCORE_SERIES,
  formatCompact,
} from '@/lib/portfolio';
import { YIELD_SERIES, type WalletPosition } from '@/lib/position';
import {
  BorrowRepayBody,
  ChartAnchor,
  Panel,
  TrendLineBody,
  type AnchorMetric,
  type TrendThreshold,
} from '@/components/dashboard/PortfolioCharts';

type SeriesKey = 'borrow' | 'score' | 'yield';

interface SeriesOption {
  key: SeriesKey;
  /** Toggle label — short, so three fit on one row. */
  label: string;
  /** Primary figure on the left of the anchor row. */
  primary: AnchorMetric;
  /** Supporting figure on the right. */
  secondary: AnchorMetric;
}

const SCORE_THRESHOLDS: TrendThreshold[] = [
  { value: 80, label: 'Prime 80', color: '#639922' },
  { value: 65, label: 'Established 65', color: '#7C3AED' },
];

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const last = (values: number[]) => values[values.length - 1];
const first = (values: number[]) => values[0];

const TOTAL_DRAWN = sum(BORROWED_SERIES);
const TOTAL_REPAID = sum(REPAID_SERIES);

/**
 * One chart, several subjects, rather than three charts competing for the page.
 *
 * Aave does this with a 1D/1W/1M/1Y/All control over a single plot. The same idea applies
 * here: the wallet's history is one story, and which slice of it you want is a toggle, not
 * three separate cards. Each series keeps its natural rendering — borrowing reads as
 * mirrored bars, the score and yield as lines — so the toggle changes the subject without
 * pretending the shapes are interchangeable.
 *
 * Every tab gets the same two-figure anchor header. A curve with no number attached makes
 * you read the axis to learn anything, which is the opposite of a dashboard.
 *
 * The options are built from what the wallet actually has, so a lender-only wallet never
 * sees a Borrowed tab.
 */
export default function PositionChart({ position }: { position: WalletPosition }) {
  const colors = useTheme();

  const options: SeriesOption[] = [];
  if (position.scored) {
    options.push({
      key: 'borrow',
      label: 'Borrowed',
      primary: { label: 'Drawn', value: formatCompact(TOTAL_DRAWN) },
      secondary: {
        label: 'Repaid',
        value: `${formatCompact(TOTAL_REPAID)} · ${Math.round((TOTAL_REPAID / TOTAL_DRAWN) * 100)}%`,
        tone: '#639922',
      },
    });
    options.push({
      key: 'score',
      label: 'Score',
      primary: { label: 'Score', value: String(SCORE.value) },
      secondary: {
        label: 'Since Jan',
        value: `+${last(SCORE_SERIES) - first(SCORE_SERIES)} pts`,
        tone: '#639922',
      },
    });
  }
  if (position.lending) {
    options.push({
      key: 'yield',
      label: 'Yield',
      primary: { label: 'Earned to date', value: `$${last(YIELD_SERIES).toFixed(2)}` },
      secondary: {
        label: 'This month',
        value: `+$${(last(YIELD_SERIES) - YIELD_SERIES[YIELD_SERIES.length - 2]).toFixed(2)}`,
        tone: '#639922',
      },
    });
  }

  const [requested, setRequested] = useState<SeriesKey>(options[0]?.key ?? 'borrow');
  // The wallet state can change under us (the ?state= override), so fall back rather than
  // rendering a series that no longer exists.
  const activeKey = options.some((o) => o.key === requested) ? requested : options[0]?.key;
  const active = options.find((o) => o.key === activeKey);

  if (!active) return null;

  const toggle = (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg shrink-0"
      style={{ backgroundColor: 'rgba(124,58,237,0.07)' }}
      role="tablist"
      aria-label="Chart series"
    >
      {options.map((option) => {
        const isActive = option.key === active.key;
        return (
          <button
            key={option.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => setRequested(option.key)}
            className="px-2.5 py-1 rounded-md font-mono text-[9px] uppercase tracking-widest transition-colors"
            style={{
              backgroundColor: isActive ? '#FFFFFF' : 'transparent',
              color: isActive ? '#7C3AED' : colors.textMuted,
              boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.06)' : undefined,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <Panel title="History" right={toggle} delay={0.2}>
      {/* Fixed height so switching tabs doesn't shift the page beneath the card. No flex-1
          here — its flex-basis of 0 would override the height and let each tab size to its
          own content, which is what caused the jump. Shorter below `lg`, where the bar
          chart's eight columns get cramped. */}
      <div className="flex flex-col h-[360px] lg:h-[454px]">
        <ChartAnchor left={active.primary} right={active.secondary} />

        {active.key === 'borrow' && <BorrowRepayBody />}

        {active.key === 'score' && (
          <TrendLineBody
            series={SCORE_SERIES}
            yMin={40}
            yMax={100}
            ticks={[40, 60, 80, 100]}
            thresholds={SCORE_THRESHOLDS}
            gradientId="score-fill"
            ariaLabel="Credit score by month"
            formatValue={(v) => String(v)}
          />
        )}

        {active.key === 'yield' && (
          <TrendLineBody
            series={YIELD_SERIES}
            yMin={0}
            yMax={600}
            ticks={[0, 200, 400, 600]}
            gradientId="yield-fill"
            ariaLabel="Accrued yield by month"
            formatValue={(v) => `$${v}`}
          />
        )}
      </div>
    </Panel>
  );
}
