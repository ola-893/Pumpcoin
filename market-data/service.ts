export type MarketRow = { id: string; name: string; price: number | null; liquidity: number | null; volume: number | null; change: number | null; dex: string; url: string };
export type Snapshot<T> = { provider: string; network: string; fetchedAt: string; rows: T[]; purpose: 'research-only' };
export const finite = (v: unknown, signed = false): number | null => {
  if (typeof v !== 'number' && (typeof v !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v))) return null;
  const n = Number(v); return Number.isFinite(n) && (signed || n >= 0) ? n : null;
};
const label = (v: unknown, fallback: string) => typeof v === 'string' && v.length > 0 ? v.slice(0, 120) : fallback;
export function dexRows(input: any): MarketRow[] {
  if (!Array.isArray(input)) throw new Error('Invalid market response.');
  const seen = new Set<string>();
  return input.slice(0, 100).flatMap((p: any) => {
    if (p?.chainId !== 'monad' || !/^0x(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(p.pairAddress) || seen.has(p.pairAddress)) return [];
    seen.add(p.pairAddress);
    return [{ id: `monad_${p.pairAddress}`, name: `${label(p.baseToken?.symbol, '?')} / ${label(p.quoteToken?.symbol, '?')}`, dex: label(p.dexId, 'Unknown venue'), price: finite(p.priceUsd), liquidity: finite(p.liquidity?.usd), volume: finite(p.volume?.h24), change: finite(p.priceChange?.h24, true), url: `https://dexscreener.com/monad/${p.pairAddress}` }];
  });
}
// Fixed provider hosts and paths. No browser-supplied URL, key, or network.
const DEX = 'https://api.dexscreener.com/token-pairs/v1/monad/0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';
export function marketService(request: typeof fetch = fetch, now = () => Date.now()) {
  const cache = new Map<string, { expires: number; value: Snapshot<any> }>();
  const running = new Map<string, Promise<Snapshot<any>>>();
  async function json(url: string, headers: Record<string, string> = {}) {
    let response: Response;
    try { response = await request(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw new Error('Market provider is unreachable. Retry later.'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(response.status === 429 ? 'Provider rate limit reached. Retry later.' : `Market provider unavailable (HTTP ${response.status}).`);
    }
    const reader = response.body?.getReader(); if (!reader) throw new Error('Empty market response.');
    const chunks: Uint8Array[] = []; let length = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 1048576) throw new Error('Market response is too large.'); chunks.push(value); } }
    finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    const buffer = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new Error('Invalid market response.'); }
  }
  async function read(): Promise<Snapshot<MarketRow>> {
    const kind = 'monad';
    const saved = cache.get(kind); if (saved && saved.expires > now()) return saved.value;
    const pending = running.get(kind); if (pending) return pending;
    const work = (async () => {
      const raw = await json(DEX);
      const result: Snapshot<MarketRow> = { provider: 'DEX Screener', network: 'Monad mainnet', fetchedAt: new Date(now()).toISOString(), rows: dexRows(raw), purpose: 'research-only' };
      cache.set(kind, { expires: now() + 60000, value: result }); return result;
    })();
    running.set(kind, work);
    try { return await work; } finally { running.delete(kind); }
  }
  return { read };
}
