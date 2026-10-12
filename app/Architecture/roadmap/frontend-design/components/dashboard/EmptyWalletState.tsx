import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Shown when a wallet has neither a score nor a deposit — nothing to chart yet.
 *
 * The two CTAs use the landing hero's button treatment (full-radius pills, purple fill
 * and a white ghost) so the first thing a new wallet sees is the same invitation as the
 * marketing page. The ghost button swaps the hero's `border-white/50` for the theme
 * border, which is invisible against the cream app surface.
 */
export default function EmptyWalletState() {
  const colors = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1, ease }}
      className="rounded-2xl border shadow-sm px-8 py-20 flex flex-col items-center text-center"
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      <img src="/Unora icon.png" alt="" className="h-8 w-auto mb-6 opacity-80" />

      <h2 className="font-serif text-2xl tracking-tight mb-2" style={{ color: colors.text }}>
        Nothing onchain yet
      </h2>
      <p className="font-sans text-sm max-w-sm leading-relaxed mb-8" style={{ color: colors.textSecondary }}>
        Unora prices your collateral from your credit history. Verify a payout to get your
        score, or earn from the pools while you build history.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Link
          to="/get-scored"
          className="inline-flex items-center gap-2 px-7 py-3 font-sans text-sm font-medium rounded-full transition-all duration-300 hover:opacity-90 shadow-lg"
          style={{ backgroundColor: '#7C3AED', color: 'white' }}
        >
          Get scored
        </Link>
        <Link
          to="/lend"
          className="inline-flex items-center gap-2 px-7 py-3 font-sans text-sm font-medium rounded-full bg-white/70 border transition-all duration-300 hover:bg-white/90"
          style={{ borderColor: colors.border, color: '#7C3AED' }}
        >
          Earn yield
        </Link>
      </div>
    </motion.div>
  );
}
