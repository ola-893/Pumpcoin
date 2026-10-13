/**
 * Sponsor network — MOCK DATA.
 *
 * Models the `SponsorGraph` contract's vouching relationships: a sponsor delegates
 * part of their own borrowing capacity to another wallet, and that capacity is
 * slashed if the sponsored wallet defaults. Replace this with an indexer query
 * (`SponsorGraph` events via Envio) when the backend lands.
 */

export interface SponsorNode {
  id: string;
  /** Display name. Real version would resolve an ENS / Nansen label. */
  handle: string;
  address: string;
  score: number;
  /** Max outstanding principal this wallet can carry. */
  ceiling: number;
  /** The connected wallet. */
  isYou?: boolean;
}

export interface SponsorEdge {
  /** Node id of the wallet doing the vouching. */
  sponsor: string;
  /** Node id of the wallet being vouched for. */
  sponsored: string;
  /** Capacity delegated, in USDC. */
  capacity: number;
  /** True when this relationship has been slashed by a default. */
  slashed?: boolean;
}

export const SPONSOR_NODES: SponsorNode[] = [
  { id: 'you', handle: 'You', address: '0x8f2a4c9b1e7d3056af82c41d9b0e7f13a5c41d02', score: 72, ceiling: 12_400, isYou: true },
  { id: 'fischer', handle: 'D. Fischer', address: '0x1b9e77a3c4f08d25e6a1b7c309f4d8e25a0c6b71', score: 91, ceiling: 68_000 },
  { id: 'okafor', handle: 'M. Okafor', address: '0x4d3c81f2a9b760e5c1d8f42a07b3e9c6d15a8f30', score: 88, ceiling: 48_000 },
  { id: 'adeyemi', handle: 'K. Adeyemi', address: '0x7a2f5c9e1b480d63f2a9c7e105b4d8f36e20a94c', score: 81, ceiling: 31_500 },
  { id: 'novak', handle: 'S. Novak', address: '0x9c6b3e8a2f150d74c9b1e6a307f4d2c85e19b70a', score: 76, ceiling: 24_800 },
  { id: 'moreau', handle: 'L. Moreau', address: '0x2e8d4f1b7a930c56e2d8a1f407b6c3e95d07a2f1', score: 58, ceiling: 9_200 },
  { id: 'reyes', handle: 'T. Reyes', address: '0x5f1a9c3e8b270d64a3c9e2f105b7d8a46e30c92b', score: 61, ceiling: 8_400 },
  { id: 'lindqvist', handle: 'J. Lindqvist', address: '0x8b4e2a7c1f960d35c7a2e8b104f6d9c53e27a18d', score: 54, ceiling: 6_100 },
  { id: 'haddad', handle: 'R. Haddad', address: '0x3a7c1e9f4b280d56a1c7e3f209b5d8a64e17c03f', score: 43, ceiling: 3_200 },
  { id: 'bello', handle: 'A. Bello', address: '0x6d2b8f4a1c970e53b8d2a6f104c7e9b35a28d71e', score: 47, ceiling: 4_050 },
];

export const SPONSOR_EDGES: SponsorEdge[] = [
  { sponsor: 'fischer', sponsored: 'okafor', capacity: 20_000 },
  { sponsor: 'okafor', sponsored: 'you', capacity: 8_000 },
  { sponsor: 'okafor', sponsored: 'adeyemi', capacity: 15_000 },
  { sponsor: 'okafor', sponsored: 'novak', capacity: 12_000 },
  { sponsor: 'you', sponsored: 'reyes', capacity: 3_000 },
  { sponsor: 'you', sponsored: 'lindqvist', capacity: 2_000 },
  { sponsor: 'you', sponsored: 'bello', capacity: 1_500, slashed: true },
  { sponsor: 'adeyemi', sponsored: 'haddad', capacity: 2_500 },
  { sponsor: 'novak', sponsored: 'moreau', capacity: 4_000 },
];

export type ScoreTier = 'prime' | 'established' | 'building' | 'thin';

export interface TierStyle {
  label: string;
  color: string;
  fill: string;
}

/** Score banding. Deliberately avoids red — this is a status scale, not an alarm. */
export const TIERS: Record<ScoreTier, TierStyle> = {
  prime: { label: 'Prime', color: '#639922', fill: 'rgba(99,153,34,0.16)' },
  established: { label: 'Established', color: '#7C3AED', fill: 'rgba(124,58,237,0.16)' },
  building: { label: 'Building', color: '#BA7517', fill: 'rgba(186,117,23,0.16)' },
  thin: { label: 'Thin file', color: '#888780', fill: 'rgba(136,135,128,0.16)' },
};

export function tierFor(score: number): ScoreTier {
  if (score >= 80) return 'prime';
  if (score >= 65) return 'established';
  if (score >= 50) return 'building';
  return 'thin';
}

export interface PositionedNode extends SponsorNode {
  x: number;
  y: number;
  radius: number;
}

/**
 * Minimal force-directed layout, hand-rolled to avoid pulling in d3.
 *
 * Three forces, run for a fixed number of iterations so the result is
 * deterministic across renders:
 *   - pairwise repulsion, so nodes spread out
 *   - spring attraction along edges, so connected wallets cluster
 *   - gentle pull to centre, so disconnected components don't drift off-canvas
 *
 * `alpha` decays each pass so the layout settles instead of oscillating.
 */
export function layoutNetwork(
  nodes: SponsorNode[],
  edges: SponsorEdge[],
  width: number,
  height: number,
  iterations = 500,
): Map<string, PositionedNode> {
  const positions = new Map<string, PositionedNode>();

  // Seed on a phyllotaxis spiral — deterministic and avoids overlapping starts.
  const golden = Math.PI * (3 - Math.sqrt(5));
  nodes.forEach((node, i) => {
    const spread = 70 + (i % 6) * 34;
    positions.set(node.id, {
      ...node,
      x: width / 2 + Math.cos(i * golden) * spread,
      y: height / 2 + Math.sin(i * golden) * spread,
      // Area proportional to ceiling, clamped so the smallest stay clickable.
      radius: Math.max(11, Math.min(30, 9 + Math.sqrt(node.ceiling) / 11)),
    });
  });

  const maxRadius = 34;
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;

    // Repulsion
    const list = [...positions.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy || 0.01;
        const dist = Math.sqrt(distSq);
        const push = (5_200 * alpha) / distSq;
        const fx = (dx / dist) * push;
        const fy = (dy / dist) * push;
        a.x -= fx;
        a.y -= fy;
        b.x += fx;
        b.y += fy;
      }
    }

    // Springs
    for (const edge of edges) {
      const a = positions.get(edge.sponsor);
      const b = positions.get(edge.sponsored);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const desired = 135;
      const pull = (dist - desired) * 0.022 * alpha;
      const fx = (dx / dist) * pull;
      const fy = (dy / dist) * pull;
      a.x += fx;
      a.y += fy;
      b.x -= fx;
      b.y -= fy;
    }

    // Centring
    for (const node of positions.values()) {
      node.x += (width / 2 - node.x) * 0.005 * alpha;
      node.y += (height / 2 - node.y) * 0.005 * alpha;
    }
  }

  // Clamp inside the viewBox so nothing renders off-canvas.
  for (const node of positions.values()) {
    node.x = Math.max(maxRadius + 14, Math.min(width - maxRadius - 14, node.x));
    node.y = Math.max(maxRadius + 14, Math.min(height - maxRadius - 14, node.y));
  }

  return positions;
}

/** Total capacity a wallet has delegated out. */
export function delegatedBy(walletId: string): number {
  return SPONSOR_EDGES.filter((e) => e.sponsor === walletId).reduce((sum, e) => sum + e.capacity, 0);
}

/** Total capacity delegated to a wallet by its sponsors. */
export function receivedBy(walletId: string): number {
  return SPONSOR_EDGES.filter((e) => e.sponsored === walletId).reduce((sum, e) => sum + e.capacity, 0);
}
