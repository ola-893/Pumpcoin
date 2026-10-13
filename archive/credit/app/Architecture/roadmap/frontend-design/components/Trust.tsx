import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';
import { ScrollHeader } from '@/components/animations';

const ease = [0.22, 1, 0.36, 1] as const;

const trustStats = [
  { value: '4', label: 'Core contracts', detail: 'ScoreRegistry, LendingPool, StreamManager, SponsorGraph' },
  { value: '<1s', label: 'Default detection', detail: 'Stream stalls flagged in real-time' },
  { value: '20–80%', label: 'Collateral range', detail: 'Score-based, not fixed' },
  { value: '100%', label: 'Onchain', detail: 'Chainlink CRE verified scores' },
];

export default function Trust({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const show = ready && inView;
  const colors = useTheme();

  return (
    <section ref={ref} id="trust" className="py-20 sm:py-28 px-6 sm:px-10 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <ScrollHeader className="mb-12">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] mb-3 block" style={{ color: colors.textMuted }}>
            Trust by design
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.1] mb-3" style={{ color: colors.text }}>
            Transparent. Verifiable.
            <br />
            <span className="italic" style={{ color: colors.textSecondary }}>Open to verify.</span>
          </h2>
          <p className="font-sans text-sm sm:text-base max-w-xl" style={{ color: colors.textSecondary }}>
            Every score computation, every loan, every repayment stream — all onchain.
            No black boxes. No hidden logic.
          </p>
        </ScrollHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {trustStats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: show ? 0.15 + i * 0.1 : 0, ease }}
              className="p-6 rounded-xl bg-white/50 border border-white/40"
            >
              <div
                className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight leading-none mb-3"
                style={{ color: colors.text }}
              >
                {stat.value}
              </div>
              <div className="font-sans text-sm font-medium mb-1.5" style={{ color: colors.text }}>
                {stat.label}
              </div>
              <div className="font-sans text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                {stat.detail}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
