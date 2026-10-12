import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';

function shortAddress(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

const contracts = [
  { label: 'ScoreRegistry', address: '0x0000000000000000000000000000000000000000', role: 'Soulbound credit score NFT per wallet' },
  { label: 'LendingPool', address: '0x0000000000000000000000000000000000000000', role: 'Tranche pool with tiered interest rates' },
  { label: 'StreamManager', address: '0x0000000000000000000000000000000000000000', role: 'Continuous micro-payment repayment streams' },
  { label: 'SponsorGraph', address: '0x0000000000000000000000000000000000000000', role: 'Vouching relationships and capacity delegation' },
  { label: 'ReservePool', address: '0x0000000000000000000000000000000000000000', role: 'Default buffer protecting senior lenders' },
];

export default function Infrastructure() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });
  const colors = useTheme();

  return (
    <section ref={ref} id="infrastructure" className="py-24 sm:py-40" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.text}` }}>
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24">
          <div className="lg:col-span-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
              className="lg:sticky lg:top-32"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] mb-4 block" style={{ color: colors.textMuted }}>
                Infrastructure
              </span>
              <h2 className="font-serif text-4xl sm:text-5xl tracking-tight leading-[1.1] mb-6" style={{ color: colors.text }}>
                Onchain contracts
              </h2>
              <p className="font-sans text-sm leading-relaxed max-w-md" style={{ color: colors.textSecondary }}>
                Five layers form the lending pipeline. Each holds one boundary — from indexing your history, to scoring, to streaming repayments.
              </p>
            </motion.div>
          </div>

          <div className="lg:col-span-7">
            {contracts.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, x: 20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="group grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 py-6 border-b border-[#E5E5E5] hover:border-[#111111] transition-colors"
              >
                <div className="sm:col-span-4">
                  <span className="font-mono text-xs sm:text-sm font-bold tracking-tight group-hover:text-[#D946EF] transition-colors"
                    style={{ color: colors.text }}
                  >
                    {c.label}
                  </span>
                </div>
                <div className="sm:col-span-3">
                  <span className="font-mono text-[10px] sm:text-xs" style={{ color: colors.textMuted }}>
                    {shortAddress(c.address)}
                  </span>
                </div>
                <div className="sm:col-span-5">
                  <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>
                    {c.role}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
