import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';

const ease = [0.22, 1, 0.36, 1] as const;

export default function Footer({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const show = ready && inView;
  const colors = useTheme();

  return (
    <footer ref={ref} className="py-12 sm:py-16" style={{ borderTop: `1px solid ${colors.border}` }}>
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-10 mb-12"
        >
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <img src="/Unora icon.png" alt="" className="h-7 w-auto" />
              <span className="font-serif font-bold text-lg" style={{ color: colors.text }}>Unora</span>
            </div>
            <p className="font-sans text-sm leading-relaxed max-w-xs" style={{ color: colors.textSecondary }}>
              Credit-scored, undercollateralized lending on Monad.
              Trust that's earned, not assumed.
            </p>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: colors.textMuted }}>
              Protocol
            </div>
            <ul className="space-y-2.5 font-sans text-sm" style={{ color: colors.textSecondary }}>
              <li><a href="#" className="hover:text-[#111111] transition-colors">ScoreRegistry</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">LendingPool</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">StreamManager</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">SponsorGraph</a></li>
            </ul>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: colors.textMuted }}>
              Resources
            </div>
            <ul className="space-y-2.5 font-sans text-sm" style={{ color: colors.textSecondary }}>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">GitHub</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Brand</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Security</a></li>
            </ul>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: colors.textMuted }}>
              Community
            </div>
            <ul className="space-y-2.5 font-sans text-sm" style={{ color: colors.textSecondary }}>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Discord</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Twitter</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Blog</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Governance</a></li>
            </ul>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-4" style={{ color: colors.textMuted }}>
              Legal
            </div>
            <ul className="space-y-2.5 font-sans text-sm" style={{ color: colors.textSecondary }}>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Terms</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Privacy</a></li>
              <li><a href="#" className="hover:text-[#111111] transition-colors">Policy</a></li>
            </ul>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={show ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: show ? 0.2 : 0 }}
          className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: `1px solid ${colors.border}` }}
        >
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
            &copy; 2026 Unora Labs
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
            Built on Monad
          </span>
        </motion.div>
      </div>
    </footer>
  );
}
