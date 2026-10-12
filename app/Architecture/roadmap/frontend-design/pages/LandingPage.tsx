import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import StatsSection from '@/components/StatsSection';
import Integrations from '@/components/Integrations';
import HowItWorks from '@/components/HowItWorks';
import Markets from '@/components/Markets';
import Trust from '@/components/Trust';
import CtaSection from '@/components/CtaSection';
import Newsletter from '@/components/Newsletter';
import Faq from '@/components/Faq';
import Footer from '@/components/Footer';

export default function LandingPage({ ready }: { ready: boolean }) {
  return (
    <div className="min-h-screen relative">
      {/* Base gradient */}
      <div
        className="fixed inset-0 -z-20"
        style={{
          background: 'linear-gradient(160deg, #F3EEFF 0%, #E9D5FF 20%, #DDD6FE 40%, #E9D5FF 60%, #DDD6FE 80%, #F3EEFF 100%)',
        }}
      />

      {/* Radial blobs for depth */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 15% 20%, rgba(196, 181, 253, 0.4) 0%, transparent 70%),
            radial-gradient(ellipse 50% 60% at 85% 30%, rgba(233, 213, 255, 0.5) 0%, transparent 70%),
            radial-gradient(ellipse 70% 40% at 50% 70%, rgba(167, 139, 250, 0.15) 0%, transparent 70%),
            radial-gradient(ellipse 40% 50% at 20% 85%, rgba(196, 181, 253, 0.3) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 80% 80%, rgba(233, 213, 255, 0.4) 0%, transparent 70%)
          `,
        }}
      />

      <Navbar />
      <Hero ready={ready} />
      <StatsSection ready={ready} />
      <Integrations ready={ready} />
      <HowItWorks ready={ready} />
      <Markets ready={ready} />
      <Trust ready={ready} />
      <CtaSection ready={ready} />
      <Newsletter ready={ready} />
      <Faq ready={ready} />
      <Footer ready={ready} />
    </div>
  );
}
