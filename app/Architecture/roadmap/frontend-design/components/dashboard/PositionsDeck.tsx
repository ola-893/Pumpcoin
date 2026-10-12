import { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Check, ChevronUp, Handshake } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SCORE } from '@/lib/protocol';
import {
  BORROW_POSITION,
  POSITION_TONES as TONE,
  TIER_LADDER,
  blendedApy,
  poolName,
  positionValue,
  type WalletPosition,
} from '@/lib/position';

const ease = [0.22, 1, 0.36, 1] as const;

const CARD_W = 320;
const CARD_H = 224;
/**
 * Horizontal step between stacked cards, and therefore exactly how much of a side card stays
 * visible. Card content is left-aligned, so the step has to exceed the card's own padding or
 * the label slides under the front card.
 */
const SPREAD = 296;

/** Below this the fan is replaced by a plain stack — see `PositionsDeck`.
 *
 * `xl`, not `md`. The fanned deck spans 2 x SPREAD + CARD_W = 912px, and the content column
 * only offers that much at 1280 once the 240px rail and the page gutters are subtracted. At
 * 1024 it has 720px, so a fan there pushes the outer two cards off-screen.
 */
const FAN_QUERY = '(min-width: 1280px)';

interface DeckCard {
  key: string;
  badge: string;
  locked: boolean;
  label: string;
  value: string;
  sub: string;
  fields: { label: string; value: string }[];
  color: string;
  fill: string;
}

function usd(value: number, digits = 0): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function pct(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Builds the cards the wallet actually holds. Each entry is something owned, so the deck
 * doubles as the conditional rendering — a wallet with only a score gets one card, a wallet
 * doing both gets three.
 */
function buildCards(position: WalletPosition): DeckCard[] {
  const cards: DeckCard[] = [];
  const lending = position.lending;

  if (position.scored) {
    cards.push({
      key: 'score',
      badge: 'Soulbound',
      locked: false,
      label: 'Credit score',
      value: String(SCORE.value),
      sub: `${TIER_LADDER.find((t) => t.state === 'current')?.name ?? 'Scored'} tier`,
      fields: [
        { label: 'Repayment', value: pct(SCORE.repaymentRate, 0) },
        { label: 'History', value: `${SCORE.historyMonths} mo` },
      ],
      ...TONE.score,
    });

    cards.push({
      key: 'borrow',
      badge: 'Streaming',
      locked: false,
      label: `Loan #${BORROW_POSITION.loanId}`,
      value: usd(BORROW_POSITION.drawn),
      sub: `${pct(BORROW_POSITION.apr)} APR · ${pct(BORROW_POSITION.collateralRatio, 0)} collateral`,
      fields: [
        { label: 'Locked', value: usd(BORROW_POSITION.collateralLocked) },
        {
          label: 'Ceiling',
          value: TIER_LADDER.find((t) => t.state === 'current')?.ceiling ?? '—',
        },
      ],
      ...TONE.borrow,
    });
  }

  if (lending) {
    const deposited = lending.holdings.reduce((sum, h) => sum + h.deposited, 0);
    const value = positionValue(lending);
    const apy = blendedApy(lending);
    const single = lending.holdings.length === 1 ? lending.holdings[0] : null;

    cards.push({
      key: 'deposit',
      badge: 'Earning',
      locked: false,
      label: 'Deposited',
      value: usd(deposited),
      sub: single
        ? `${poolName(single.pool)} · ${pct(single.apy)} APY`
        : `${lending.holdings.length} pools · ${pct(apy)} APY`,
      fields: [
        { label: 'Yield', value: usd(lending.accruedYield, 2) },
        { label: 'Value', value: usd(value) },
      ],
      ...TONE.deposit,
    });
  }

  return cards;
}

/** The card's contents, shared by the fan and the stacked layout. */
function CardBody({ card, showChevron }: { card: DeckCard; showChevron?: boolean }) {
  return (
    <>
      {/* Wordmark + status badge */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <img src="/Unora icon.png" alt="" className="h-4 w-auto" />
          <span className="font-serif font-bold text-sm" style={{ color: '#111111' }}>
            Unora
          </span>
        </div>

        <div
          className="flex items-center gap-1 px-2 py-1 rounded-full shrink-0"
          style={{ backgroundColor: `${card.color}1F` }}
        >
          {card.locked ? (
            <Lock className="w-2.5 h-2.5" style={{ color: card.color }} strokeWidth={2} />
          ) : card.key === 'borrow' ? (
            <Handshake className="w-2.5 h-2.5" style={{ color: card.color }} strokeWidth={2} />
          ) : (
            <Check className="w-2.5 h-2.5" style={{ color: card.color }} strokeWidth={2.5} />
          )}
          <span
            className="font-mono text-[9px] uppercase tracking-widest"
            style={{ color: card.color }}
          >
            {card.badge}
          </span>
        </div>
      </div>

      {/* What this card is */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono text-[9px] uppercase tracking-widest"
          style={{ color: '#6B6A66' }}
        >
          {card.label}
        </span>
        {showChevron && (
          <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: card.color }} strokeWidth={2} />
        )}
      </div>

      {/* The figure */}
      <div className="mt-auto flex items-baseline gap-2">
        <span
          className="font-serif text-4xl font-semibold tabular-nums leading-none"
          style={{ color: '#111111' }}
        >
          {card.value}
        </span>
      </div>
      <div className="font-mono text-[9px] mt-1.5" style={{ color: card.color }}>
        {card.sub}
      </div>

      {/* Supporting detail */}
      <div
        className="flex items-center gap-7 mt-3.5 pt-3.5 border-t"
        style={{ borderColor: `${card.color}33` }}
      >
        {card.fields.map((field) => (
          <div key={field.label}>
            <div
              className="font-mono text-[8px] uppercase tracking-widest"
              style={{ color: '#6B6A66' }}
            >
              {field.label}
            </div>
            <div className="font-mono text-sm tabular-nums" style={{ color: '#111111' }}>
              {field.value}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Fanned deck of the wallet's positions. Front card is the wallet's identity — its soulbound
 * score — with the borrow and deposit positions behind it.
 *
 * Clicking a card rotates it to the front rather than navigating; there is no per-position
 * page, and the point is comparing the three at a glance.
 *
 * Below `md` the fan is replaced by a stack. The cards are 320px wide and fanned ±296px, so
 * on a phone the outer two are almost entirely off-screen and the deck becomes a horizontal
 * scroll — the exact thing the fan exists to avoid.
 */
export default function PositionsDeck({ position }: { position: WalletPosition }) {
  const cards = buildCards(position);
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const fan = useMediaQuery(FAN_QUERY);

  if (cards.length === 0) return null;

  if (!fan) {
    return (
      <div className="space-y-3 mb-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 + i * 0.06, ease }}
            className="rounded-3xl p-5 border shadow-lg flex flex-col"
            style={{ backgroundColor: card.fill, borderColor: card.color }}
          >
            <CardBody card={card} />
          </motion.div>
        ))}
      </div>
    );
  }

  const bringToFront = (index: number) =>
    setOrder((prev) => [index, ...prev.filter((i) => i !== index)]);

  // A card added since the last render (state change) won't be in `order` yet.
  const ordered = [
    ...order.filter((i) => i < cards.length),
    ...cards.map((_, i) => i).filter((i) => !order.includes(i)),
  ];

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ height: CARD_H + 56 }}
    >
      {ordered.map((cardIndex, deckPosition) => (
        <PositionCard
          key={cards[cardIndex].key}
          card={cards[cardIndex]}
          deckPosition={deckPosition}
          total={ordered.length}
          onSelect={() => bringToFront(cardIndex)}
        />
      ))}
    </div>
  );
}

function PositionCard({
  card,
  deckPosition,
  total,
  onSelect,
}: {
  card: DeckCard;
  deckPosition: number;
  total: number;
  onSelect: () => void;
}) {
  const colors = useTheme();
  const isFront = deckPosition === 0;

  // Front card sits centre; the rest fan out symmetrically to either side.
  const side = deckPosition === 0 ? 0 : deckPosition % 2 === 1 ? -1 : 1;
  const depth = Math.ceil(deckPosition / 2);
  const offsetX = side * depth * SPREAD;
  const offsetY = isFront ? 0 : -10 * depth;
  const scale = isFront ? 1 : 0.93 - (depth - 1) * 0.03;
  const rotate = side * depth * 4;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-label={`${card.label}: ${card.value}. ${card.sub}.`}
      initial={false}
      animate={{ x: offsetX, y: offsetY, scale, rotate, zIndex: total - deckPosition }}
      transition={{ duration: 0.55, ease }}
      whileHover={isFront ? undefined : { scale: scale + 0.025, y: offsetY - 5 }}
      className="absolute rounded-3xl p-5 text-left border shadow-lg flex flex-col"
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: card.fill,
        borderColor: isFront ? card.color : colors.border,
        cursor: isFront ? 'default' : 'pointer',
      }}
    >
      <CardBody card={card} showChevron={!isFront} />
    </motion.button>
  );
}
