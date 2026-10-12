export type Market = { id: string; name: string; price: number | null; liquidity: number | null; volume: number | null; change: number | null; dex: string; url: string };
const number = (x: unknown) => { if ((typeof x !== 'string' && typeof x !== 'number') || (typeof x === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(x))) return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
export function parseMarkets(input: unknown): Market[] {
  const x = input as { data?: Array<{ id?: unknown; attributes?: Record<string, unknown>; relationships?: { dex?: { data?: { id?: string } } } }> };
  if (!Array.isArray(x?.data)) throw new Error('Market provider returned an invalid response.');
  return x.data.flatMap(p => {
    const a = p.attributes;
    if (typeof p.id !== 'string' || !p.id.startsWith('monad_') || !a || typeof a.name !== 'string' || typeof a.address !== 'string' || !/^0x(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(a.address)) return [];
    const volume = a.volume_usd as Record<string, unknown> | undefined, change = a.price_change_percentage as Record<string, unknown> | undefined;
    return [{ id: p.id, name: a.name, price: number(a.base_token_price_usd), liquidity: number(a.reserve_in_usd), volume: number(volume?.h24), change: number(change?.h24), dex: typeof p.relationships?.dex?.data?.id === 'string' ? p.relationships.dex.data.id : 'Unknown venue', url: `https://www.geckoterminal.com/monad/pools/${a.address}` }];
  });
}
