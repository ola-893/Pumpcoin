import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ScrollHeader } from '@/components/animations';

const ease = [0.22, 1, 0.36, 1] as const;

const markets = [
  {
    name: 'General',
    desc: 'Core lending pool. Score-based collateral for all borrowers.',
    tokens: ['MON', 'USDC', 'WETH'],
    tvl: '$0',
    apy: '4.2%',
  },
  {
    name: 'Bluechip',
    desc: 'Conservative. Stablecoin-only collateral, lower risk.',
    tokens: ['USDC', 'USDT', 'DAI'],
    tvl: '$0',
    apy: '3.8%',
  },
  {
    name: 'Sponsored',
    desc: 'Vouched pools. Sponsor-backed, higher ceilings.',
    tokens: ['MON', 'USDC'],
    tvl: '$0',
    apy: '5.1%',
  },
];

export default function Markets({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const show = ready && inView;
  const colors = useTheme();

  return (
    <section ref={ref} id="markets" className="py-10 sm:py-16 px-4 sm:px-6 lg:px-10">
      <div className="max-w-7xl mx-auto rounded-3xl bg-white/70 backdrop-blur-md border border-white/50 shadow-[0_8px_40px_rgba(124,58,237,0.06)] p-8 sm:p-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-10">
          <ScrollHeader>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] mb-3 block" style={{ color: colors.textMuted }}>
              Markets
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.1]" style={{ color: colors.text }}>
              Earn yield. Deploy capital.
            </h2>
          </ScrollHeader>
          <a
            href="#"
            className="mt-4 sm:mt-0 font-sans text-sm flex items-center gap-1.5 transition-colors"
            style={{ color: '#7C3AED' }}
          >
            View all markets
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {markets.map((market, i) => (
            <motion.div
              key={market.name}
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={show ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 30, scale: 0.97 }}
              transition={{ duration: 0.6, delay: show ? 0.15 + i * 0.1 : 0, ease }}
              className="group p-6 rounded-xl bg-white/50 border border-white/40 transition-all hover:bg-white/70 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-xl tracking-tight" style={{ color: colors.text }}>
                  {market.name}
                </h3>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: colors.text }} />
              </div>
              <p className="font-sans text-sm leading-relaxed mb-5" style={{ color: colors.textSecondary }}>
                {market.desc}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {market.tokens.map((token) => (
                  <span
                    key={token}
                    className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-600"
                  >
                    {token}
                  </span>
                ))}
              </div>

              <div className="pt-4 border-t border-white/40 flex items-center justify-between">
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-widest" style={{ color: colors.textMuted }}>TVL</div>
                  <div className="font-serif text-lg font-semibold" style={{ color: colors.text }}>{market.tvl}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[8px] uppercase tracking-widest" style={{ color: colors.textMuted }}>APY</div>
                  <div className="font-serif text-lg font-semibold" style={{ color: '#7C3AED' }}>{market.apy}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
