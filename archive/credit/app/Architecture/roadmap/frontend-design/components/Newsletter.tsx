import { useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';
import { ScrollHeader } from '@/components/animations';

const ease = [0.22, 1, 0.36, 1] as const;

export default function Newsletter({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const show = ready && inView;
  const colors = useTheme();
  const [email, setEmail] = useState('');

  return (
    <section ref={ref} className="py-20 sm:py-28 px-6 sm:px-10 lg:px-16">
      <div className="max-w-xl mx-auto">
        <ScrollHeader>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] mb-3 block" style={{ color: colors.textMuted }}>
            Stay updated
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-tight mb-3" style={{ color: colors.text }}>
            Be the first to know.
          </h2>
          <p className="font-sans text-sm sm:text-base" style={{ color: colors.textSecondary }}>
            Get notified when we launch on mainnet, add new markets, or ship new features.
          </p>
        </ScrollHeader>

          <motion.div
            className="flex gap-3 mt-6"
            initial={{ opacity: 0, y: 15 }}
            animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
            transition={{ duration: 0.6, delay: show ? 0.2 : 0, ease }}
          >
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-4 py-3 font-sans text-sm rounded-xl bg-white/60 border border-white/40 outline-none transition-colors focus:border-purple-300"
              style={{ color: colors.text }}
            />
            <button
              className="px-6 py-3 font-sans text-sm font-medium rounded-xl transition-all duration-300 hover:opacity-90"
              style={{ backgroundColor: '#7C3AED', color: 'white' }}
            >
              Notify me
            </button>
          </motion.div>
      </div>
    </section>
  );
}
