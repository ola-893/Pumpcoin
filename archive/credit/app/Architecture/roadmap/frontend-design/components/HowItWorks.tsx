import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Scan, TrendingDown, CreditCard, RotateCcw } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ScrollHeader } from '@/components/animations';

const ease = [0.22, 1, 0.36, 1] as const;

const steps = [
  {
    num: '01',
    icon: Scan,
    title: 'Scan & score',
    desc: 'Your cross-chain wallet activity is indexed and scored. The more consistent your history, the higher your score.',
  },
  {
    num: '02',
    icon: TrendingDown,
    title: 'Borrow',
    desc: 'Use your score as collateral. Higher scores mean lower collateral requirements and better rates.',
  },
  {
    num: '03',
    icon: CreditCard,
    title: 'Repay via stream',
    desc: 'Continuous micro-payment streams. Each successful tick improves your score automatically.',
  },
  {
    num: '04',
    icon: RotateCcw,
    title: 'Build reputation',
    desc: 'Your score grows over time. Better scores unlock lower collateral and higher loan ceilings.',
  },
];

export default function HowItWorks({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const show = ready && inView;
  const colors = useTheme();

  return (
    <section ref={ref} id="how-it-works" className="py-20 sm:py-28 px-6 sm:px-10 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <ScrollHeader className="mb-14">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] mb-3 block" style={{ color: colors.textMuted }}>
            How it works
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.1]" style={{ color: colors.text }}>
            Four steps.
            <br />
            <span className="italic" style={{ color: colors.textSecondary }}>One protocol.</span>
          </h2>
        </ScrollHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: show ? 0.15 + i * 0.1 : 0, ease }}
              className="p-6 rounded-xl bg-white/50 border border-white/40"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
                  {step.num}
                </span>
                <step.icon className="w-4 h-4" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
              </div>
              <h3 className="font-serif text-lg tracking-tight mb-2" style={{ color: colors.text }}>
                {step.title}
              </h3>
              <p className="font-sans text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
