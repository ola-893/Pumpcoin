import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ScrollHeader } from '@/components/animations';

const ease = [0.22, 1, 0.36, 1] as const;

export default function CtaSection({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const show = ready && inView;
  const colors = useTheme();

  return (
    <section ref={ref} className="py-24 sm:py-32 px-6 sm:px-10 lg:px-16">
      <div className="max-w-4xl mx-auto text-center">
        <ScrollHeader className="mb-5" rise={56} drift={-32}>
          <h2
            className="font-serif text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.1]"
            style={{ color: colors.text }}
          >
            Your reputation is your collateral.
          </h2>
        </ScrollHeader>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: show ? 0.3 : 0, ease }}
          className="font-sans text-sm sm:text-base mb-8 max-w-lg mx-auto"
          style={{ color: colors.textSecondary }}
        >
          Borrowers unlock lower collateral. Lenders earn yield from score-verified pools.
          Start building your onchain credit score today.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: show ? 0.5 : 0, ease }}
        >
          <Link
            to="/lend"
            className="inline-flex items-center gap-2 px-7 py-3 font-sans text-sm font-medium rounded-full transition-all duration-300 hover:opacity-90 shadow-lg"
            style={{ backgroundColor: '#7C3AED', color: 'white' }}
          >
            Get your score
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/lend"
            className="inline-flex items-center gap-2 px-7 py-3 font-sans text-sm font-medium rounded-full bg-white/70 border border-white/50 transition-all duration-300 hover:bg-white/90"
            style={{ color: '#7C3AED' }}
          >
            Explore pools
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
