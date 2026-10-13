import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';

const sponsors = [
  {
    name: 'Envio',
    role: 'Indexing',
    bounty: '$1,000',
    desc: 'Cross-chain wallet activity indexing via HyperIndex.',
    color: '#2563EB',
  },
  {
    name: 'Nansen AI',
    role: 'Wallet Analytics',
    bounty: '$5,000',
    desc: 'Wallet labels and fraud-risk signal enrichment.',
    color: '#F59E0B',
  },
  {
    name: 'Chainlink CRE',
    role: 'Oracle / Compute',
    bounty: '$3,000',
    desc: 'Verifiable score computation and onchain relay.',
    color: '#2563EB',
  },
  {
    name: 'Perpl',
    role: 'Risk / Analytics',
    bounty: '$5,000',
    desc: 'Best analytics and risk tool integration.',
    color: '#8B5CF6',
  },
  {
    name: 'Dynamic',
    role: 'Wallet Onboarding',
    bounty: '$5,000',
    desc: 'Embedded wallets for non-crypto-native users.',
    color: '#EC4899',
  },
  {
    name: 'Privy',
    role: 'Wallet Onboarding',
    bounty: '$5,000',
    desc: 'Alternative embedded wallet provider.',
    color: '#10B981',
  },
];

export default function SponsorBounties() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });
  const colors = useTheme();

  return (
    <section ref={ref} id="sponsors" className="py-24 sm:py-40 bg-white" style={{ borderBottom: `1px solid ${colors.border}` }}>
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-20"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] mb-4 block" style={{ color: colors.textMuted }}>
            Sponsor bounties
          </span>
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.1]" style={{ color: colors.text }}>
            Built with the ecosystem.
            <br />
            <span className="italic" style={{ color: colors.textMuted }}>Competing for $24k+ in bounties.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border border-[#111111]">
          {sponsors.map((s, i) => (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="group p-6 sm:p-8 transition-colors cursor-default border-b sm:border-b-0 sm:border-r border-[#111111] last:border-r-0 hover:bg-[#111111]"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-serif text-xl tracking-tight group-hover:text-white" style={{ color: colors.text }}>
                    {s.name}
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: s.color }}>
                    {s.role}
                  </span>
                </div>
                <span className="font-mono text-xs font-bold group-hover:text-white" style={{ color: colors.text }}>
                  {s.bounty}
                </span>
              </div>
              <p className="font-sans text-sm leading-relaxed group-hover:text-white/60" style={{ color: colors.textSecondary }}>
                {s.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
