import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';
import { ScrollHeader } from '@/components/animations';

const ease = [0.22, 1, 0.36, 1] as const;

const stats = [
  { value: '$0', label: 'Total value locked', note: 'testnet' },
  { value: '20–80%', label: 'Collateral range', note: 'score-based' },
  { value: '<1s', label: 'Default detection', note: 'stream stalls' },
  { value: '4', label: 'Core contracts', note: 'onchain' },
];

export default function StatsSection({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const show = ready && inView;
  const colors = useTheme();

  return (
    <section ref={ref} id="stats" className="py-20 sm:py-28 px-6 sm:px-10 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <ScrollHeader className="mb-12">
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight" style={{ color: colors.text }}>
            The protocol in numbers
          </h2>
        </ScrollHeader>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 lg:divide-x" style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: show ? 0.15 + i * 0.1 : 0, ease }}
              className="text-left px-6 sm:px-8 py-4"
            >
              <div
                className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-none mb-3"
                style={{ color: colors.text }}
              >
                {stat.value}
              </div>
              <div className="font-mono text-[10px] sm:text-xs uppercase tracking-widest" style={{ color: colors.textMuted }}>
                {stat.label}
              </div>
              <div className="font-mono text-[9px] mt-1" style={{ color: colors.textMuted }}>
                {stat.note}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
