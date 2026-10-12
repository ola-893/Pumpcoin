import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { useTheme } from '@/contexts/ThemeContext';
import { Bell, Wallet, Loader2, RefreshCw, ExternalLink, ShieldCheck, TriangleAlert, FlaskConical } from 'lucide-react';
import { useUnoraWallet } from '@/hooks/useUnoraWallet';
import { useOnchainPosition, type OnchainPosition } from '@/hooks/useOnchainPosition';
import { PROTOCOL_ADDRESSES, explorerFor, formatTokenUsd } from '@/lib/onchain';
import { resolveWalletState, type WalletPosition } from '@/lib/position';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import PageHeader from '@/components/dashboard/PageHeader';
import NetSummary from '@/components/dashboard/NetSummary';
import PositionsDeck from '@/components/dashboard/PositionsDeck';
import PositionChart from '@/components/dashboard/PositionChart';
import LendingSection from '@/components/dashboard/LendingSection';
import EmptyWalletState from '@/components/dashboard/EmptyWalletState';
import ActivityList from '@/components/dashboard/ActivityList';
import RepayDialog from '@/components/dashboard/RepayDialog';
import FaucetButton from '@/components/dashboard/FaucetButton';

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Time-aware greeting with no name.
 *
 * There is no name to show — a wallet is an address — and inventing one meant every
 * visitor was greeted as the same fictional person. Aave just says "Good morning." and it
 * reads as intentional rather than unfinished.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function GreetingHeader() {
  const colors = useTheme();

  return (
    <PageHeader
      dense
      title={`${greeting()}.`}
      subtitle={new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}
    >
      <button
        aria-label="Notifications"
        className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-sm transition-colors hover:bg-white"
        style={{ borderColor: colors.border }}
      >
        <Bell className="w-4 h-4" style={{ color: colors.textMuted }} strokeWidth={1.5} />
      </button>
    </PageHeader>
  );
}

/* -------------------------------------------------------------------------- */
/*  Demo view — ?state= overrides, kept for pitch screenshots                  */
/* -------------------------------------------------------------------------- */

/** Two facts about the score, not five — the rest are already on the deck's score card. */
function ScoreProvenance() {
  const colors = useTheme();
  return (
    <div className="flex items-center justify-center gap-2.5 -mt-1 mb-4">
      <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
        ScoreRegistry #1247 · soulbound
      </span>
      <span style={{ color: colors.textMuted }}>·</span>
      <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
        Updated via Chainlink CRE
      </span>
    </div>
  );
}

/** One action, where the loan it acts on sits (demo figures). */
function DemoLoanActions({ onRepay }: { onRepay: () => void }) {
  const colors = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease }}
      className="rounded-2xl border shadow-sm p-4 flex items-center justify-between gap-4 mb-4 flex-wrap"
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'rgba(186,117,23,0.1)' }}
        >
          <Wallet className="w-4 h-4" style={{ color: '#BA7517' }} strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
            Demo loan
          </div>
          <div className="font-mono text-[10px] tabular-nums" style={{ color: colors.textMuted }}>
            mock data via ?state= — the live view reads your real position below
          </div>
        </div>
      </div>
      <button
        onClick={onRepay}
        className="px-4 py-2 rounded-xl font-sans text-xs font-medium transition-all hover:opacity-90 shrink-0"
        style={{ backgroundColor: '#7C3AED', color: '#FFFFFF' }}
      >
        Repay
      </button>
    </motion.div>
  );
}

function DemoDashboard({ position }: { position: WalletPosition }) {
  const colors = useTheme();
  const [repayOpen, setRepayOpen] = useState(false);
  const hasBorrower = position.scored;
  const lending = position.lending;

  return (
    <>
      {/* Way back to the live view, so demo mode is never a one-way door. */}
      <div
        className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border mb-6 flex-wrap"
        style={{ borderColor: colors.border, backgroundColor: 'rgba(124,58,237,0.04)' }}
      >
        <span className="flex items-center gap-2 font-mono text-[10px]" style={{ color: colors.textMuted }}>
          <FlaskConical className="w-3.5 h-3.5" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
          Product demo — sample data for pitch screenshots, not your wallet's position.
        </span>
        <Link
          to="/dashboard"
          className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors"
          style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: '#7C3AED' }}
        >
          Back to live data
        </Link>
      </div>
      <NetSummary position={position} />
      <PositionsDeck position={position} />
      {hasBorrower && <ScoreProvenance />}
      {hasBorrower && <DemoLoanActions onRepay={() => setRepayOpen(true)} />}
      <div className="mb-4">
        <PositionChart position={position} />
      </div>
      {lending && (
        <div className="mb-4">
          <LendingSection lending={lending} />
        </div>
      )}
      <ActivityList />
      {repayOpen && <RepayDialog onClose={() => setRepayOpen(false)} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Live view — real reads against the deployed ProofLine contracts            */
/* -------------------------------------------------------------------------- */

/** The wallet's real numbers, one glance. Derived from CreditLine, not a scenario. */
function OnchainSummary({
  creditLimit,
  debt,
  available,
  collateral,
  ltv,
}: {
  creditLimit: number;
  debt: number;
  available: number;
  collateral: number;
  ltv: number;
}) {
  const colors = useTheme();

  const figures = [
    {
      label: 'Credit limit',
      value: formatTokenUsd(creditLimit),
      hint: `collateral × ${ltv}% LTV`,
      tone: colors.text,
    },
    {
      label: 'Borrowed',
      value: formatTokenUsd(debt),
      hint: 'pUSD outstanding',
      tone: debt > 0 ? '#BA7517' : colors.text,
    },
    {
      label: 'Available to borrow',
      value: formatTokenUsd(available),
      hint: 'headroom, capped by pool liquidity',
      tone: '#639922',
    },
    {
      label: 'Collateral locked',
      value: formatTokenUsd(collateral),
      hint: 'pCOL in CreditLine',
      tone: colors.text,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
      {figures.map((figure, i) => (
        <motion.div
          key={figure.label}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 + i * 0.04, ease }}
          className="rounded-2xl border shadow-sm p-4"
          style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
        >
          <div
            className="font-mono text-[9px] uppercase tracking-widest mb-2"
            style={{ color: colors.textMuted }}
          >
            {figure.label}
          </div>
          <div
            className="font-serif text-2xl font-semibold tabular-nums leading-none"
            style={{ color: figure.tone }}
          >
            {figure.value}
          </div>
          <div className="font-mono text-[9px] mt-1.5 leading-relaxed" style={{ color: colors.textMuted }}>
            {figure.hint}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/** Real credential provenance, straight from AttestationRegistry. */
function CredentialStrip({ position }: { position: OnchainPosition }) {
  const colors = useTheme();
  const credential = position.credential;
  if (!credential) return null;

  return (
    <div className="flex items-center justify-center gap-2.5 -mt-1 mb-4 flex-wrap">
      <ShieldCheck className="w-3 h-3" style={{ color: '#639922' }} strokeWidth={2} />
      <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
        {credential.tier} · {credential.source} credential
      </span>
      <span style={{ color: colors.textMuted }}>·</span>
      <span className="font-mono text-[9px]" style={{ color: colors.textMuted }}>
        {credential.expired ? 'expired' : `valid until ${credential.expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
      </span>
      <span style={{ color: colors.textMuted }}>·</span>
      <a
        href={explorerFor(PROTOCOL_ADDRESSES.attestationRegistry)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[9px] inline-flex items-center gap-1 transition-opacity hover:opacity-70"
        style={{ color: '#7C3AED' }}
      >
        AttestationRegistry
        <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.5} />
      </a>
    </div>
  );
}

/**
 * The live position cards. Same visual language as the demo deck, but every figure is a
 * contract read — there is nothing to rotate to the front because there is nothing hidden.
 */
function OnchainDeck({ position, onRepay }: { position: OnchainPosition; onRepay: () => void }) {
  const { collateral, debt, creditLimit, availableToBorrow: available, loanTokenBalance, collateralTokenBalance, vaultBudget } = position;
  const utilization = creditLimit > 0 ? Math.min(debt / creditLimit, 1) : 0;

  const cards = [
    {
      key: 'loan',
      tone: '#BA7517',
      fill: '#EFE3D3',
      badge: debt > 0 ? 'Borrowing' : 'No debt',
      label: 'Credit line',
      value: formatTokenUsd(debt),
      sub: `${formatTokenUsd(creditLimit)} limit · ${Math.round(utilization * 100)}% used`,
      action:
        debt > 0 ? (
          <button
            onClick={onRepay}
            className="px-4 py-2 rounded-xl font-sans text-xs font-medium transition-all hover:opacity-90"
            style={{ backgroundColor: '#7C3AED', color: '#FFFFFF' }}
          >
            Repay
          </button>
        ) : null,
      fields: [
        { label: 'Available', value: formatTokenUsd(available) },
        { label: 'Wallet pUSD', value: formatTokenUsd(loanTokenBalance) },
      ],
    },
    {
      key: 'collateral',
      tone: '#7C3AED',
      fill: '#E7DBF1',
      badge: collateral > 0 ? 'Locked' : 'None',
      label: 'Collateral',
      value: formatTokenUsd(collateral),
      sub: collateral > 0 ? 'pCOL escrowed in CreditLine' : 'deposit pCOL to open a credit line',
      action: null,
      fields: [{ label: 'Wallet pCOL', value: formatTokenUsd(collateralTokenBalance) }],
    },
    {
      key: 'vault',
      tone: '#639922',
      fill: '#E3E8D5',
      badge: vaultBudget > 0 ? 'Funded' : 'Empty',
      label: 'Repayment vault',
      value: formatTokenUsd(vaultBudget),
      sub: 'pUSD reserved for delegated auto-repay',
      action: null,
      fields: [] as { label: string; value: string }[],
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16 + i * 0.06, ease }}
          className="rounded-3xl p-5 border shadow-lg flex flex-col"
          style={{ backgroundColor: card.fill, borderColor: card.tone }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <img src="/Unora icon.png" alt="" className="h-4 w-auto" />
              <span className="font-serif font-bold text-sm" style={{ color: '#111111' }}>
                Unora
              </span>
            </div>
            <div
              className="px-2 py-1 rounded-full shrink-0"
              style={{ backgroundColor: `${card.tone}1F` }}
            >
              <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: card.tone }}>
                {card.badge}
              </span>
            </div>
          </div>

          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: '#6B6A66' }}>
            {card.label}
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <span className="font-serif text-4xl font-semibold tabular-nums leading-none" style={{ color: '#111111' }}>
              {card.value}
            </span>
            {card.action}
          </div>
          <div className="font-mono text-[9px] mt-1.5" style={{ color: card.tone }}>
            {card.sub}
          </div>

          {card.fields.length > 0 && (
            <div className="flex items-center gap-7 mt-3.5 pt-3.5 border-t" style={{ borderColor: `${card.tone}33` }}>
              {card.fields.map((field) => (
                <div key={field.label}>
                  <div className="font-mono text-[8px] uppercase tracking-widest" style={{ color: '#6B6A66' }}>
                    {field.label}
                  </div>
                  <div className="font-mono text-sm tabular-nums" style={{ color: '#111111' }}>
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/** Event history needs the indexer; the position above is the live chain truth. */
function OnchainActivityNote() {
  const colors = useTheme();
  return (
    <div
      className="rounded-2xl border shadow-sm p-4 flex items-center justify-between gap-4 flex-wrap"
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      <span className="font-mono text-[10px] leading-relaxed" style={{ color: colors.textMuted }}>
        Event history arrives with the indexer. Everything above is read live from the
        deployed contracts.
      </span>
      <a
        href={explorerFor(PROTOCOL_ADDRESSES.creditLine)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[10px] inline-flex items-center gap-1.5 transition-opacity hover:opacity-70 shrink-0"
        style={{ color: '#7C3AED' }}
      >
        CreditLine on explorer
        <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
      </a>
    </div>
  );
}

function LiveDashboard() {
  const colors = useTheme();
  const { address } = useUnoraWallet();
  const { position, isLoading, isError, refetch } = useOnchainPosition(address);
  const [repayOpen, setRepayOpen] = useState(false);
  // The faucet row offers itself until the wallet holds some of each demo token.
  const hasFaucetRun =
    !!position && position.loanTokenBalance > 0 && position.collateralTokenBalance > 0;

  if (isLoading) {
    return (
      <div className="rounded-2xl border shadow-sm p-12 flex flex-col items-center gap-3 mb-4" style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: colors.textMuted }} />
        <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
          Reading your position from Monad testnet…
        </span>
      </div>
    );
  }

  if (isError || !position) {
    return (
      <div className="rounded-2xl border shadow-sm p-12 flex flex-col items-center gap-3 mb-4" style={{ borderColor: '#BA7517', backgroundColor: 'rgba(186,117,23,0.05)' }}>
        <TriangleAlert className="w-5 h-5" style={{ color: '#BA7517' }} strokeWidth={1.5} />
        <span className="font-sans text-sm" style={{ color: colors.text }}>
          Couldn't read your position from the contracts.
        </span>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border font-sans text-xs font-medium transition-colors hover:bg-white"
          style={{ borderColor: colors.border, color: colors.text }}
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          Retry
        </button>
      </div>
    );
  }

  const empty =
    position.collateral === 0 &&
    position.debt === 0 &&
    position.vaultBudget === 0 &&
    !position.credential;

  if (empty) {
    return (
      <>
        <EmptyWalletState />
        <div className="mt-4">
          <FaucetButton onDone={refetch} />
        </div>
        {/* The rich product view still exists — point at it, since an empty live
            dashboard is exactly where someone goes looking for it. */}
        <div
          className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border mt-4 flex-wrap"
          style={{ borderColor: colors.border, backgroundColor: 'rgba(124,58,237,0.04)' }}
        >
          <span className="flex items-center gap-2 font-mono text-[10px]" style={{ color: colors.textMuted }}>
            <FlaskConical className="w-3.5 h-3.5" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
            Want the full product view (score, loan, charts, sponsor graph)?
          </span>
          <Link
            to="/dashboard?state=both-multi"
            className="font-mono text-[10px] px-3 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: '#7C3AED' }}
          >
            Open product demo
          </Link>
        </div>
        <div className="mt-4">
          <OnchainActivityNote />
        </div>
      </>
    );
  }

  return (
    <>
      <OnchainSummary
        creditLimit={position.creditLimit}
        debt={position.debt}
        available={position.availableToBorrow}
        collateral={position.collateral}
        ltv={position.ltv}
      />
      <CredentialStrip position={position} />
      <OnchainDeck position={position} onRepay={() => setRepayOpen(true)} />
      {!hasFaucetRun && (
        <div className="mb-4">
          <FaucetButton onDone={refetch} />
        </div>
      )}
      <div className="mb-4">
        <OnchainActivityNote />
      </div>
      {repayOpen && position.debt > 0 && (
        <RepayDialog
          debt={position.debt}
          balance={position.loanTokenBalance}
          onSettled={refetch}
          onClose={() => setRepayOpen(false)}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The dashboard adapts to what the wallet actually has:
 *
 *   live (?state= absent) -> real contract reads for the connected wallet
 *   demo (?state=...)     -> the named mock scenarios, kept for pitch screenshots
 *
 * The demo mode exists because judges may want the full product story (markets, sponsor
 * graph, charts) that the deployed ProofLine contracts don't implement yet — but the
 * default is what the chain actually says.
 */
export default function Dashboard() {
  const { search } = useLocation();
  const demo = useMemo(() => resolveWalletState(search), [search]);
  const isDemo = new URLSearchParams(search).has('state');

  return (
    <DashboardLayout>
      <GreetingHeader />

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {isDemo ? <DemoDashboard position={demo.position} /> : <LiveDashboard />}
      </div>
    </DashboardLayout>
  );
}
