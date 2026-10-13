import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Users, ShieldAlert, ArrowUpRight, Network } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import PageHeader from '@/components/dashboard/PageHeader';
import { shortAddress, explorerAddressUrl } from '@/lib/chains';
import {
  SPONSOR_NODES,
  SPONSOR_EDGES,
  TIERS,
  tierFor,
  layoutNetwork,
  delegatedBy,
  receivedBy,
} from '@/lib/sponsorNetwork';

const ease = [0.22, 1, 0.36, 1] as const;

const CANVAS = { width: 680, height: 500 } as const;

function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

export default function SponsorGraphPage() {
  const colors = useTheme();
  const [selectedId, setSelectedId] = useState<string>('you');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Deterministic layout — computed once, not on every hover/selection.
  const positions = useMemo(
    () => layoutNetwork(SPONSOR_NODES, SPONSOR_EDGES, CANVAS.width, CANVAS.height),
    [],
  );

  const selected = positions.get(selectedId);

  const totalDelegated = useMemo(() => delegatedBy('you'), []);
  const totalReceived = useMemo(() => receivedBy('you'), []);
  const slashedCount = SPONSOR_EDGES.filter((e) => e.slashed).length;

  // Everything connected to the hovered node, so the rest can be dimmed.
  const activeId = hoveredId ?? selectedId;
  const connected = useMemo(() => {
    const set = new Set<string>([activeId]);
    for (const edge of SPONSOR_EDGES) {
      if (edge.sponsor === activeId) set.add(edge.sponsored);
      if (edge.sponsored === activeId) set.add(edge.sponsor);
    }
    return set;
  }, [activeId]);

  const selectedSponsors = SPONSOR_EDGES.filter((e) => e.sponsored === selectedId);
  const selectedSponsored = SPONSOR_EDGES.filter((e) => e.sponsor === selectedId);

  return (
    <DashboardLayout>
        <PageHeader
          title="Sponsor graph"
          subtitle="Every edge is delegated capacity. If a sponsored wallet defaults, the sponsor's own capacity is slashed onchain — trust here has a price."
        />

        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {/* The SponsorGraph contract doesn't exist yet — this page is the design target,
              rendered over sample network data so the interaction can be judged. */}
          <div
            className="flex items-center gap-2 p-3.5 rounded-2xl border mb-6"
            style={{ borderColor: colors.border, backgroundColor: 'rgba(124,58,237,0.04)' }}
          >
            <Network className="w-4 h-4 shrink-0" style={{ color: '#7C3AED' }} strokeWidth={1.5} />
            <span className="font-mono text-[10px] leading-relaxed" style={{ color: colors.textMuted }}>
              Design preview — the SponsorGraph contract is the next build. Edges below are
              sample data showing the intended delegation and slashing mechanics.
            </span>
          </div>
          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease }}
            className="grid grid-cols-4 gap-4 mb-6"
          >
            {[
              { label: 'Network size', value: String(SPONSOR_NODES.length), hint: 'wallets' },
              { label: 'You delegate', value: formatUsd(totalDelegated), hint: 'to 3 wallets' },
              { label: 'Delegated to you', value: formatUsd(totalReceived), hint: 'from 1 sponsor' },
              { label: 'Slashed edges', value: String(slashedCount), hint: 'past defaults' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-4 rounded-2xl border shadow-sm"
                style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
              >
                <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: colors.textMuted }}>
                  {stat.label}
                </div>
                <div className="font-serif text-xl font-semibold" style={{ color: colors.text }}>
                  {stat.value}
                </div>
                <div className="font-mono text-[9px]" style={{ color: colors.textMuted }}>{stat.hint}</div>
              </div>
            ))}
          </motion.div>

          <div className="grid grid-cols-[1.6fr_1fr] gap-6 items-start">
            {/* Graph */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16, ease }}
              className="rounded-2xl border shadow-sm p-4"
              style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
            >
              <svg
                viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
                className="w-full h-auto"
                role="img"
                aria-label="Force-directed graph of sponsor relationships"
              >
                <defs>
                  <marker
                    id="sponsor-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M2 1L8 5L2 9" fill="none" stroke="#B4B2A9" strokeWidth="1.5" strokeLinecap="round" />
                  </marker>
                </defs>

                {/* Edges */}
                {SPONSOR_EDGES.map((edge) => {
                  const from = positions.get(edge.sponsor);
                  const to = positions.get(edge.sponsored);
                  if (!from || !to) return null;

                  const isActive = edge.sponsor === activeId || edge.sponsored === activeId;
                  const stroke = edge.slashed ? '#BA7517' : isActive ? '#7C3AED' : '#D3D1C7';

                  // Stop short of the target node so the arrowhead doesn't sit under it.
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const offset = to.radius + 7;

                  return (
                    <line
                      key={`${edge.sponsor}-${edge.sponsored}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x - (dx / dist) * offset}
                      y2={to.y - (dy / dist) * offset}
                      stroke={stroke}
                      strokeWidth={edge.slashed ? 2 : isActive ? 2 : 1}
                      strokeDasharray={edge.slashed ? '5 4' : undefined}
                      opacity={isActive ? 1 : 0.45}
                      markerEnd="url(#sponsor-arrow)"
                    />
                  );
                })}

                {/* Nodes */}
                {[...positions.values()].map((node) => {
                  const tier = TIERS[tierFor(node.score)];
                  const isSelected = node.id === selectedId;
                  const dimmed = !connected.has(node.id);

                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedId(node.id)}
                      onMouseEnter={() => setHoveredId(node.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{ cursor: 'pointer' }}
                      opacity={dimmed ? 0.3 : 1}
                    >
                      {node.isYou && (
                        <circle cx={node.x} cy={node.y} r={node.radius + 6} fill="none" stroke="#7C3AED" strokeWidth="1" strokeDasharray="3 3" />
                      )}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.radius}
                        fill={tier.fill}
                        stroke={isSelected ? '#111111' : tier.color}
                        strokeWidth={isSelected ? 2 : 1.5}
                      />
                      <text
                        x={node.x}
                        y={node.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="12"
                        fontWeight="500"
                        fill={tier.color}
                      >
                        {node.score}
                      </text>
                      <text
                        x={node.x}
                        y={node.y + node.radius + 13}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#5F5E5A"
                      >
                        {node.handle}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Legend */}
              <div className="flex items-center gap-5 px-2 pt-3 border-t flex-wrap" style={{ borderColor: colors.border }}>
                {Object.entries(TIERS).map(([key, tier]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tier.color }} />
                    <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
                      {tier.label}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0 border-t-2 border-dashed" style={{ borderColor: '#BA7517' }} />
                  <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>slashed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>node size = ceiling</span>
                </div>
              </div>
            </motion.div>

            {/* Detail panel */}
            <motion.div
              key={selectedId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease }}
              className="rounded-2xl border shadow-sm p-6"
              style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
            >
              {selected && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-mono text-sm"
                      style={{
                        backgroundColor: TIERS[tierFor(selected.score)].fill,
                        color: TIERS[tierFor(selected.score)].color,
                      }}
                    >
                      {selected.score}
                    </div>
                    <div>
                      <div className="font-serif text-lg" style={{ color: colors.text }}>
                        {selected.handle}
                      </div>
                      <div className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
                        {TIERS[tierFor(selected.score)].label}
                      </div>
                    </div>
                  </div>

                  <a
                    href={explorerAddressUrl(selected.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 font-mono text-[10px] mb-5 transition-opacity hover:opacity-70"
                    style={{ color: '#7C3AED' }}
                  >
                    {shortAddress(selected.address, 6)}
                    <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                  </a>

                  <div className="space-y-3 pb-5 mb-5 border-b" style={{ borderColor: colors.border }}>
                    <div className="flex items-baseline justify-between">
                      <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>Loan ceiling</span>
                      <span className="font-mono text-xs" style={{ color: colors.text }}>{formatUsd(selected.ceiling)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>Delegates out</span>
                      <span className="font-mono text-xs" style={{ color: colors.text }}>{formatUsd(delegatedBy(selected.id))}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="font-sans text-xs" style={{ color: colors.textSecondary }}>Receives</span>
                      <span className="font-mono text-xs" style={{ color: colors.text }}>{formatUsd(receivedBy(selected.id))}</span>
                    </div>
                  </div>

                  {/* Sponsored by */}
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Network className="w-3.5 h-3.5" style={{ color: colors.textMuted }} strokeWidth={1.5} />
                      <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
                        Sponsored by
                      </span>
                    </div>
                    {selectedSponsors.length === 0 ? (
                      <div className="font-sans text-xs" style={{ color: colors.textMuted }}>
                        No sponsor — this wallet is on its own score.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedSponsors.map((edge) => {
                          const node = positions.get(edge.sponsor);
                          return (
                            <button
                              key={edge.sponsor}
                              onClick={() => setSelectedId(edge.sponsor)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-purple-50/60"
                              style={{ backgroundColor: 'rgba(124,58,237,0.04)' }}
                            >
                              <span className="font-sans text-xs" style={{ color: colors.text }}>
                                {node?.handle ?? edge.sponsor}
                              </span>
                              <span className="font-mono text-[10px]" style={{ color: colors.textMuted }}>
                                {formatUsd(edge.capacity)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Sponsors */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-3.5 h-3.5" style={{ color: colors.textMuted }} strokeWidth={1.5} />
                      <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
                        Sponsors
                      </span>
                    </div>
                    {selectedSponsored.length === 0 ? (
                      <div className="font-sans text-xs" style={{ color: colors.textMuted }}>
                        Not sponsoring anyone yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedSponsored.map((edge) => {
                          const node = positions.get(edge.sponsored);
                          return (
                            <button
                              key={edge.sponsored}
                              onClick={() => setSelectedId(edge.sponsored)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors hover:bg-purple-50/60"
                              style={{
                                backgroundColor: edge.slashed ? 'rgba(186,117,23,0.08)' : 'rgba(124,58,237,0.04)',
                              }}
                            >
                              <span className="flex items-center gap-2 font-sans text-xs" style={{ color: colors.text }}>
                                {edge.slashed && (
                                  <ShieldAlert className="w-3 h-3" style={{ color: '#BA7517' }} strokeWidth={1.5} />
                                )}
                                {node?.handle ?? edge.sponsored}
                              </span>
                              <span
                                className="font-mono text-[10px]"
                                style={{ color: edge.slashed ? '#BA7517' : colors.textMuted }}
                              >
                                {edge.slashed ? 'slashed' : formatUsd(edge.capacity)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </div>
    </DashboardLayout>
  );
}
