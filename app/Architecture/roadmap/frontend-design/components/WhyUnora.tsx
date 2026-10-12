import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Shield, Users, Zap, TrendingUp, Lock, Eye } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function WhyUnora() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });
  const colors = useTheme();

  const props = [
    {
      icon: Shield,
      title: 'Genuinely undercollateralized',
      desc: 'Not just marketing. Collateral ratios scale from 80% (new wallets) down to 20% (proven/sponsored). Nobody gets 0%, but nobody pays 100% either.',
      color: colors.accent,
    },
    {
      icon: Users,
      title: 'Sponsor vouching',
      desc: 'Your friend\'s trust is now on the line. Sponsors delegate their capacity, and if you default, their ceiling gets slashed. Real skin in the game.',
      color: colors.accentSecondary,
    },
    {
      icon: Zap,
      title: 'Velocity caps',
      desc: 'The fix for "farm small loans, then default big." Your max new loan is capped by your proven history, not just your sponsor\'s balance.',
      color: colors.accentHighlight,
    },
    {
      icon: TrendingUp,
      title: 'Score that grows',
      desc: 'Every successful repayment stream tick improves your score. Build your reputation on-chain, one payment at a time.',
      color: colors.accent,
    },
    {
      icon: Lock,
      title: 'Verifiable via Chainlink',
      desc: 'Your score isn\'t a black box. Chainlink CRE relays the computation onchain — verifiable, not just trusted.',
      color: colors.accentSecondary,
    },
    {
      icon: Eye,
      title: 'Real-time default detection',
      desc: 'No waiting for a due date. StreamManager flags a stall immediately. Early detection, early intervention.',
      color: colors.accentHighlight,
    },
  ];

  return (
    <section ref={ref} className="py-24 sm:py-40" style={{ backgroundColor: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-20"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] mb-4 block" style={{ color: colors.textMuted }}>
            Why Unora
          </span>
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.1]" style={{ color: colors.text }}>
            Not just another lending fork.
            <br />
            <span className="italic" style={{ color: colors.textMuted }}>A new trust primitive.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0" style={{ border: `1px solid ${colors.text}` }}>
          {props.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="group p-8 transition-colors"
              style={{
                borderRight: (i % 3 !== 2) ? `1px solid ${colors.text}` : 'none',
                borderBottom: (i < 3) ? `1px solid ${colors.text}` : 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <p.icon className="w-6 h-6 mb-4" style={{ color: p.color }} strokeWidth={1.5} />
              <h3 className="font-serif text-xl tracking-tight mb-3" style={{ color: colors.text }}>
                {p.title}
              </h3>
              <p className="font-sans text-sm leading-relaxed" style={{ color: colors.textSecondary }}>
                {p.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
