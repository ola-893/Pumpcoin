import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';
import { ScrollHeader } from '@/components/animations';

const ease = [0.22, 1, 0.36, 1] as const;

const partners = [
  { name: 'Envio', role: 'Indexer' },
  { name: 'Chainlink', role: 'Oracle' },
  { name: 'Nansen', role: 'Analytics' },
  { name: 'Monad', role: 'Chain' },
  { name: 'Dynamic', role: 'Auth' },
  { name: 'Privy', role: 'Auth' },
];

export default function Integrations({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const show = ready && inView;
  const colors = useTheme();

  return (
    <section ref={ref} className="py-16 sm:py-24 px-6 sm:px-10 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <ScrollHeader className="text-center mb-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] mb-3 block" style={{ color: colors.textMuted }}>
            Built with
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-tight" style={{ color: colors.text }}>
            Powered by the best infrastructure
          </h2>
        </ScrollHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {partners.map((partner, i) => (
            <motion.div
              key={partner.name}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={show ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.5, delay: show ? 0.1 + i * 0.06 : 0, ease }}
              className="p-5 rounded-xl flex flex-col items-center justify-center text-center bg-white/50 border border-white/40"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-2 font-serif text-base font-bold"
                style={{ backgroundColor: '#F3E8FF', color: '#7C3AED' }}
              >
                {partner.name[0]}
              </div>
              <div className="font-sans text-sm font-medium" style={{ color: colors.text }}>
                {partner.name}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-widest mt-0.5" style={{ color: colors.textMuted }}>
                {partner.role}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
