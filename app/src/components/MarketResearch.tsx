import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw, Search } from 'lucide-react';
import { Badge, Empty, Note, PageTitle } from './UI';
type Row = { id: string; name: string; price: number | null; liquidity: number | null; volume: number | null; change: number | null; dex: string; url: string };
type Snapshot<T> = { provider: string; network: string; fetchedAt: string; rows: T[] };
const dollars = (n: number | null) => n === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: n >= 100000 ? 'compact' : 'standard', maximumFractionDigits: n < 1 ? 6 : 2 }).format(n);
async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/market-data/' + path, { signal, redirect: 'error' });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Market data unavailable.'); return result;
}
export function MarketResearch() {
  const [monad, setMonad] = useState<Snapshot<Row>>();
  const [error, setError] = useState(''), [busy, setBusy] = useState(true), [query, setQuery] = useState(''), [clock, setClock] = useState(Date.now());
  async function refresh(signal?: AbortSignal) { setBusy(true); setError(''); try { setMonad(await read<Snapshot<Row>>('monad', signal)); } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Market data unavailable.'); } finally { if (!signal?.aborted) setBusy(false); } }
  useEffect(() => { const c = new AbortController(); void refresh(c.signal); const timer = setInterval(() => setClock(Date.now()), 10000); return () => { c.abort(); clearInterval(timer); }; }, []);
  const stale = (stamp?: string) => !stamp || clock - Date.parse(stamp) > 60000;
  const rows = monad?.rows.filter(r => `${r.name} ${r.dex}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <div className="container page"><PageTitle eyebrow="MARKET RESEARCH" title={<>Market data.<br /><em>Know the source.</em></>} body="Public Monad market snapshots with their source, network and observation time."><button className="button secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} />Refresh Monad</button></PageTitle>
    <div className="market-source"><strong>Monad mainnet · DEX Screener</strong><Badge tone={error || stale(monad?.fetchedAt) ? 'amber' : 'neutral'}>{error ? 'Unavailable' : monad ? stale(monad.fetchedAt) ? 'Stale snapshot' : 'Fetched snapshot' : 'Loading'}</Badge>{monad && <small>Fetched {new Date(monad.fetchedAt).toLocaleTimeString()} · provider data may be cached</small>}</div>
    <Note>These prices support research. Monad mainnet prices are separate from Klaris’s testnet pool, executable quotes and vault share valuation.</Note>
    <label className="search-box markets-search"><Search size={18} /><input aria-label="Search markets" placeholder="Filter pools by asset or venue" value={query} onChange={e => setQuery(e.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error} Previously fetched rows are stale reference data.</p>}{busy && !monad && <p role="status">Requesting Monad markets…</p>}
    {!!rows.length && <div className="table-wrap"><table><thead><tr><th>Pool / venue</th><th>Base-token price</th><th>24h change</th><th>Liquidity</th><th>24h volume</th><th>Source</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><strong>{r.name}</strong><small>{r.dex}</small></td><td>{dollars(r.price)}</td><td className={r.change !== null && r.change < 0 ? 'loss' : ''}>{r.change === null ? 'Unavailable' : `${r.change.toFixed(2)}%`}</td><td>{dollars(r.liquidity)}</td><td>{dollars(r.volume)}</td><td><a href={r.url} target="_blank" rel="noreferrer" aria-label={`Inspect ${r.name} on DEX Screener`}><ArrowUpRight size={18} /></a></td></tr>)}</tbody></table></div>}
    {!busy && !error && !rows.length && <Empty title="No matching Monad pools."><p>Adjust the filter or refresh later.</p></Empty>}
  </div>;
}
