import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';

export default function Navbar() {
  const colors = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  useEffect(() => {
    return scrollY.on('change', (y) => {
      setScrolled(y > 50);
    });
  }, [scrollY]);

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 sm:px-6 pt-3"
      initial={false}
    >
      <motion.nav
        className="w-full max-w-7xl flex items-center justify-between transition-all duration-500 ease-out"
        animate={{
          paddingLeft: scrolled ? '28px' : '24px',
          paddingRight: scrolled ? '28px' : '24px',
          paddingTop: scrolled ? '12px' : '12px',
          paddingBottom: scrolled ? '12px' : '12px',
          borderRadius: scrolled ? '9999px' : '0px',
          backgroundColor: scrolled ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0)',
          boxShadow: scrolled ? '0 4px 24px rgba(124, 58, 237, 0.08)' : '0 0px 0px rgba(0, 0, 0, 0)',
          backdropFilter: scrolled ? 'blur(12px)' : 'blur(0px)',
        }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <a href="/" className="flex items-center gap-2">
          <img src="/Unora icon.png" alt="" className="h-7 w-auto" />
          <span
            className="font-serif font-bold text-lg tracking-tight transition-all duration-300"
            style={{ color: colors.text }}
          >
            Unora
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-7 font-sans text-sm transition-colors duration-300"
          style={{ color: colors.textSecondary }}
        >
          <a href="#how-it-works" className="hover:text-[#111111] transition-colors">How it works</a>
          <a href="#markets" className="hover:text-[#111111] transition-colors">Markets</a>
          <a href="#trust" className="hover:text-[#111111] transition-colors">Trust</a>
          <a href="#faq" className="hover:text-[#111111] transition-colors">FAQ</a>
        </nav>

        <Link
          to="/lend"
          className="px-5 py-2 font-sans text-sm font-medium rounded-full transition-all duration-300 hover:opacity-80"
          style={{ backgroundColor: colors.text, color: colors.bg }}
        >
          Get Started
        </Link>
      </motion.nav>
    </motion.header>
  );
}
