import { useState } from 'react';
import { motion } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';
import { MONTHS, BORROWED_SERIES, REPAID_SERIES, formatCompact } from '@/lib/portfolio';

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Shared card shell. `right` holds a control — the chart's series toggle — so the toggle
 * sits in the card header rather than as a separate row.
 */
export function Panel({
  title,
  right,
  children,
  delay = 0,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  const colors = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      className="rounded-2xl border shadow-sm p-5 flex flex-col h-full"
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <span className="font-sans text-xs font-medium shrink-0" style={{ color: colors.text }}>
          {title}
        </span>
        {right}
      </div>
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chart bodies — no panel, so a toggle can swap between them                 */
/* -------------------------------------------------------------------------- */

export interface AnchorMetric {
  label: string;
  value: string;
  /** Defaults to body text. */
  tone?: string;
}

/**
 * The two-figure header that sits above every chart body.
 *
 * Shared so all three History tabs open the same way — a primary figure on the left, a
 * supporting one on the right, then the plot. Without it the mirrored bar chart's totals
 * floated in whitespace while the line tabs had nothing at all to anchor the curve to.
 */
export function ChartAnchor({ left, right }: { left: AnchorMetric; right: AnchorMetric }) {
  const colors = useTheme();
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <div
          className="font-mono text-[9px] uppercase tracking-widest mb-1"
          style={{ color: colors.textMuted }}
        >
          {left.label}
        </div>
        <div
          className="font-serif text-3xl font-semibold tabular-nums leading-none"
          style={{ color: colors.text }}
        >
          {left.value}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-mono text-[9px] uppercase tracking-widest mb-1"
          style={{ color: colors.textMuted }}
        >
          {right.label}
        </div>
        <div
          className="font-mono text-sm tabular-nums"
          style={{ color: right.tone ?? colors.text }}
        >
          {right.value}
        </div>
      </div>
    </div>
  );
}

/**
 * Mirrored bar chart: drawn principal above the axis, repaid principal below it.
 * The gap between the two is the outstanding balance — which is the whole story of a
 * credit line, so the two series share one scale rather than being normalised apart.
 *
 * Totals live in the `ChartAnchor` above, not in the body, so this tab is built the same
 * way as the two line tabs.
 */
export function BorrowRepayBody() {
  const colors = useTheme();
  const max = Math.max(...BORROWED_SERIES, ...REPAID_SERIES);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col flex-1">
      <div className="flex items-end gap-1.5 flex-1 min-h-[130px]">
        {MONTHS.map((month, i) => (
          <div
            key={month}
            className="flex-1 flex flex-col justify-end h-full relative cursor-pointer"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {hoveredIdx === i && (
              <div
                className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md text-[9px] font-mono whitespace-nowrap z-10 border"
                style={{ backgroundColor: '#EDE9FE', color: '#5B21B6', borderColor: '#DDD6FE' }}
              >
                {formatCompact(BORROWED_SERIES[i])}
              </div>
            )}
            <motion.div
              className="w-full rounded-t-[3px]"
              style={{
                backgroundColor: '#7C3AED',
                opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 1,
              }}
              initial={{ height: 0 }}
              animate={{ height: `${(BORROWED_SERIES[i] / max) * 100}%` }}
              transition={{ duration: 0.7, delay: 0.15 + i * 0.04, ease }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 my-1.5">
        {MONTHS.map((month, i) => (
          <div
            key={month}
            className="flex-1 text-center font-mono text-[8px] py-0.5"
            style={{
              color: colors.textMuted,
              borderTop: `1px solid ${colors.border}`,
              fontWeight: hoveredIdx === i ? 600 : 400,
            }}
          >
            {month}
          </div>
        ))}
      </div>

      <div className="flex items-start gap-1.5 flex-1 min-h-[130px]">
        {MONTHS.map((month, i) => (
          <div
            key={month}
            className="flex-1 flex flex-col justify-start h-full relative cursor-pointer"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {hoveredIdx === i && (
              <div
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md text-[9px] font-mono whitespace-nowrap z-10 border"
                style={{ backgroundColor: '#EDE9FE', color: '#5B21B6', borderColor: '#DDD6FE' }}
              >
                {formatCompact(REPAID_SERIES[i])}
              </div>
            )}
            <motion.div
              className="w-full rounded-b-[3px]"
              style={{
                backgroundColor: '#A78BFA',
                opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.4 : 1,
              }}
              initial={{ height: 0 }}
              animate={{ height: `${(REPAID_SERIES[i] / max) * 100}%` }}
              transition={{ duration: 0.7, delay: 0.15 + i * 0.04, ease }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Catmull-Rom to cubic bezier, so the line flows instead of reading as a polyline. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export interface TrendThreshold {
  value: number;
  label: string;
  color: string;
}

/**
 * Smoothed area line over `MONTHS`.
 *
 * The y-axis is always a fixed, labelled band rather than the data range, so a small move
 * doesn't render as a cliff — but it is labelled, because a silently cropped axis is how
 * charts lie. Optional thresholds draw reference lines in.
 */
export function TrendLineBody({
  series,
  yMin,
  yMax,
  ticks,
  thresholds = [],
  gradientId,
  ariaLabel,
  formatValue,
}: {
  series: number[];
  yMin: number;
  yMax: number;
  ticks: number[];
  thresholds?: TrendThreshold[];
  /** Must be unique on the page; two instances would otherwise share one gradient. */
  gradientId: string;
  ariaLabel: string;
  formatValue?: (value: number) => string;
}) {
  const colors = useTheme();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Wide viewBox to match the full-width card, so the plot renders about 340px tall
  // instead of scaling its height off a narrow aspect ratio. It also keeps the axis
  // labels at their true 11px — a narrow viewBox stretched to full width shrinks them.
  const w = 1000;
  const h = 340;
  const padX = 46;
  const padY = 20;

  const x = (i: number) => padX + (i / (series.length - 1)) * (w - padX - 10);
  const y = (value: number) => padY + (1 - (value - yMin) / (yMax - yMin)) * (h - padY * 2);

  const points = series.map((value, i) => ({ x: x(i), y: y(value) }));
  const line = smoothPath(points);
  const area = `${line} L ${x(series.length - 1)} ${h - padY} L ${x(0)} ${h - padY} Z`;
  const last = points[points.length - 1];

  return (
    <div className="flex flex-col flex-1 justify-center">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padX}
              y1={y(tick)}
              x2={w - 10}
              y2={y(tick)}
              stroke={colors.border}
              strokeWidth="1"
            />
            <text x={2} y={y(tick) + 4} fontSize="11" fill={colors.textMuted} fontFamily="monospace">
              {tick}
            </text>
          </g>
        ))}

        {thresholds.map((t) => (
          <g key={t.label}>
            <line
              x1={padX}
              y1={y(t.value)}
              x2={w - 10}
              y2={y(t.value)}
              stroke={t.color}
              strokeWidth="1"
              strokeDasharray="3 4"
              opacity="0.5"
            />
            <text
              x={padX + 3}
              y={y(t.value) - 6}
              fontSize="11"
              fill={t.color}
              opacity="0.9"
              fontFamily="monospace"
            >
              {t.label}
            </text>
          </g>
        ))}

        <motion.path
          d={area}
          fill={`url(#${gradientId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          style={{ pointerEvents: 'none' }}
        />

        <motion.path
          d={line}
          fill="none"
          stroke="#7C3AED"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease }}
          style={{ pointerEvents: 'none' }}
        />

        {/* Hover crosshair line */}
        {hoveredIdx !== null && (
          <line
            x1={points[hoveredIdx].x}
            y1={padY}
            x2={points[hoveredIdx].x}
            y2={h - padY}
            stroke={colors.textMuted}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Visible dot + tooltip on hover */}
        {hoveredIdx !== null && (
          <g style={{ pointerEvents: 'none' }}>
            <circle cx={points[hoveredIdx].x} cy={points[hoveredIdx].y} r="6" fill="#FFFFFF" stroke="#7C3AED" strokeWidth="2" />
            <rect
              x={points[hoveredIdx].x - 28}
              y={points[hoveredIdx].y - 28}
              width="56"
              height="18"
              rx="4"
              fill="#EDE9FE"
              stroke="#DDD6FE"
              strokeWidth="1"
            />
            <text
              x={points[hoveredIdx].x}
              y={points[hoveredIdx].y - 16}
              textAnchor="middle"
              fontSize="10"
              fill="#5B21B6"
              fontFamily="monospace"
            >
              {formatValue ? formatValue(series[hoveredIdx]) : formatCompact(series[hoveredIdx])}
            </text>
          </g>
        )}

        {/* Full-chart invisible overlay for mouse tracking */}
        <rect
          x={padX}
          y={padY}
          width={w - padX - 10}
          height={h - padY * 2}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onMouseMove={(e) => {
            const svg = e.currentTarget.closest('svg');
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * w;
            let closest = 0;
            let minDist = Infinity;
            for (let i = 0; i < points.length; i++) {
              const dist = Math.abs(points[i].x - svgX);
              if (dist < minDist) {
                minDist = dist;
                closest = i;
              }
            }
            setHoveredIdx(closest);
          }}
          onMouseLeave={() => setHoveredIdx(null)}
        />

        {/* Permanent end dot */}
        <motion.circle
          cx={last.x}
          cy={last.y}
          r="4"
          fill="#7C3AED"
          stroke="#FFFFFF"
          strokeWidth="2"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, delay: 1.2, ease }}
          style={{ pointerEvents: 'none' }}
        />
      </svg>

      <div
        className="flex items-center justify-between mt-4 pt-3 border-t"
        style={{ borderColor: colors.border }}
      >
        {MONTHS.map((month, i) => (
          <span
            key={month}
            className="font-mono text-[8px]"
            style={{
              color: hoveredIdx === i ? colors.text : colors.textMuted,
              fontWeight: hoveredIdx === i ? 600 : 400,
            }}
          >
            {month}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Donut                                                                     */
/* -------------------------------------------------------------------------- */

export interface DonutSlice {
  label: string;
  hint: string;
  value: number;
  color: string;
}

/** Donut of how a fixed pot of capital is split. */
export function AllocationDonut({
  title,
  right,
  delay = 0,
  slices,
  centerLabel,
  formatCenter = formatCompact,
  ariaLabel,
}: {
  title: string;
  right?: React.ReactNode;
  delay?: number;
  slices: DonutSlice[];
  centerLabel: string;
  formatCenter?: (total: number) => string;
  ariaLabel: string;
}) {
  const colors = useTheme();

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const size = 148;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Each slice is an arc offset by the sum of the slices before it. Computed purely —
  // accumulating into a variable during the render map trips the React Compiler.
  const fractions = slices.map((slice) => (total > 0 ? slice.value / total : 0));
  const offsets = fractions.map((_, i) => fractions.slice(0, i).reduce((a, b) => a + b, 0));

  return (
    <Panel title={title} right={right} delay={delay}>
      <div className="relative my-auto mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={ariaLabel}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(0,0,0,0.05)"
            strokeWidth={stroke}
          />
          {slices.map((slice, i) => {
            const dash = fractions[i] * circumference;
            const offset = offsets[i] * circumference;
            return (
              <motion.circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={`${dash} ${circumference - dash}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: -offset }}
                transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease }}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono text-[8px] uppercase tracking-widest"
            style={{ color: colors.textMuted }}
          >
            {centerLabel}
          </span>
          <span className="font-serif text-lg font-semibold tabular-nums" style={{ color: colors.text }}>
            {formatCenter(total)}
          </span>
        </div>
      </div>

      <div className="pt-5 space-y-2.5">
        {slices.map((slice) => (
          <div key={slice.label} className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
            <div className="min-w-0 flex-1">
              <div className="font-sans text-[11px]" style={{ color: colors.text }}>
                {slice.label}
              </div>
              <div className="font-mono text-[9px] truncate" style={{ color: colors.textMuted }}>
                {slice.hint}
              </div>
            </div>
            <span
              className="font-mono text-[10px] tabular-nums shrink-0"
              style={{ color: colors.text }}
            >
              {Math.round((total > 0 ? slice.value / total : 0) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
