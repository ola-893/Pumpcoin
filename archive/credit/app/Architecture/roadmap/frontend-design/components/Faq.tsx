import { useRef, useState } from 'react';
import { motion, useInView, AnimatePresence } from 'motion/react';
import { Plus, Minus } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ScrollHeader } from '@/components/animations';

const ease = [0.22, 1, 0.36, 1] as const;

const faqs = [
  {
    q: 'What is Unora?',
    a: 'Unora is a credit-scored, undercollateralized lending protocol on Monad. Your on-chain history builds a verifiable credit score that determines your collateral requirements and loan terms.',
  },
  {
    q: 'How does undercollateralized lending work?',
    a: 'Traditional DeFi requires 150%+ collateral. Unora uses your on-chain reputation (score) to reduce collateral to 20-80%. Higher scores mean less collateral locked.',
  },
  {
    q: 'What is a Soulbound Score NFT?',
    a: 'Your credit score is a non-transferable (soulbound) NFT on-chain. It grows as you repay loans on time and can\'t be sold or transferred — it\'s uniquely yours.',
  },
  {
    q: 'How does sponsor vouching work?',
    a: 'A sponsor can vouch for a borrower by delegating part of their capacity. If the borrower defaults, the sponsor\'s ceiling gets slashed — real skin in the game.',
  },
  {
    q: 'What happens on default?',
    a: 'StreamManager detects repayment stalls in real-time (<1s). The ReservePool covers the loss, and the borrower\'s score is slashed. Sponsors who vouched also take a ceiling hit.',
  },
  {
    q: 'Is it audited?',
    a: 'Unora is built on audited infrastructure (Chainlink CRE, Envio). Smart contracts will undergo independent audit before mainnet. All code is open-source and verifiable.',
  },
];

function FaqItem({ faq, isOpen, toggle, delay, show }: { faq: typeof faqs[0]; isOpen: boolean; toggle: () => void; delay: number; show: boolean }) {
  const colors = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
      transition={{ duration: 0.5, delay: show ? delay : 0, ease }}
      className="border-b border-white/30 last:border-b-0"
    >
      <button
        onClick={toggle}
        className="w-full py-5 flex items-center justify-between text-left gap-4"
      >
        <span className="font-serif text-base sm:text-lg tracking-tight" style={{ color: colors.text }}>
          {faq.q}
        </span>
        {/* justify-center as well as items-center — with only items-center the icon sits
            against the left edge of the circle instead of in the middle of it. */}
        <div
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center border border-white/40 bg-white/40 transition-colors"
          style={{ color: colors.text }}
        >
          {isOpen ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="overflow-hidden"
          >
            <p className="pb-5 font-sans text-sm sm:text-base leading-relaxed max-w-2xl" style={{ color: colors.textSecondary }}>
              {faq.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Faq({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const show = ready && inView;
  const colors = useTheme();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section ref={ref} id="faq" className="py-10 sm:py-16 px-4 sm:px-6 lg:px-10">
      <div className="max-w-7xl mx-auto rounded-3xl bg-white/70 backdrop-blur-md border border-white/50 shadow-[0_8px_40px_rgba(124,58,237,0.06)] p-8 sm:p-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <ScrollHeader className="lg:col-span-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] mb-3 block" style={{ color: colors.textMuted }}>
              FAQs
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl tracking-tight mb-3" style={{ color: colors.text }}>
              Common questions.
            </h2>
            <p className="font-sans text-sm sm:text-base" style={{ color: colors.textSecondary }}>
              Can't find what you're looking for?{' '}
              <a href="#" className="underline hover:text-[#111111] transition-colors">Reach out</a>.
            </p>
          </ScrollHeader>

          <div className="lg:col-span-8">
            {faqs.map((faq, i) => (
              <FaqItem
                key={i}
                faq={faq}
                isOpen={openIndex === i}
                toggle={() => setOpenIndex(openIndex === i ? null : i)}
                delay={0.1 + i * 0.05}
                show={show}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
