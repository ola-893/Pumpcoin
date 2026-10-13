import { Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const STEPS = ['Request', 'Lock collateral', 'Repayment'] as const;

/** Progress indicator for the three-step borrow flow. `current` is zero-indexed. */
export default function BorrowStepper({ current }: { current: number }) {
  const colors = useTheme();

  return (
    <div className="flex items-center gap-4 mb-8">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const filled = done || active;

        return (
          <div key={label} className="flex items-center gap-4 flex-1 last:flex-none">
            <div className="flex items-center gap-2.5 shrink-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-[11px] transition-colors"
                style={{
                  backgroundColor: filled ? '#7C3AED' : 'transparent',
                  border: filled ? '1px solid #7C3AED' : `1px solid ${colors.border}`,
                  color: filled ? '#FFFFFF' : colors.textMuted,
                }}
              >
                {done ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : i + 1}
              </div>
              <span
                className="font-sans text-xs whitespace-nowrap"
                style={{
                  color: active ? colors.text : colors.textMuted,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {label}
              </span>
            </div>

            {i < STEPS.length - 1 && (
              <div
                className="h-px flex-1 transition-colors"
                style={{ backgroundColor: done ? '#7C3AED' : colors.border }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
