import { fresh, integer } from './encoding.js';
import type { Evidence, Interpretation, Policy, Strategy } from './types.js';
export function validateInterpretation(value: unknown, evidence: Evidence): Interpretation {
  const x = value as Interpretation;
  const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.sort().join();
  if (!x || !['BUY','SELL','HOLD'].includes(x.action) || typeof x.symbol !== 'string' || !Array.isArray(x.factors) || x.factors.length > 30 || !Array.isArray(x.classifications) || x.classifications.length > 100) throw new Error('Malformed local research interpretation.');
  if(!exact(x,['action','symbol','factors','classifications'])||x.factors.some(f=>!exact(f,['evidenceId','stance','explanation']))||x.classifications.some(c=>!exact(c,['postId','symbol','sentiment','conviction','urgency'])))throw new Error('Unexpected local interpretation fields.');
  const refs = new Set([...evidence.posts.map(p => p.id), ...evidence.markets.map(m => m.evidenceId)]);
  for (const f of x.factors) if (!refs.has(f.evidenceId) || !['support','oppose'].includes(f.stance) || typeof f.explanation !== 'string' || !f.explanation.trim() || f.explanation.length > 500) throw new Error('Research output contains an unsupported citation.');
  const seen = new Set<string>();
  for (const c of x.classifications) {
    if (!evidence.posts.some(p => p.id === c.postId) || !evidence.markets.some(m => m.symbol === c.symbol) || !['bullish','bearish','neutral'].includes(c.sentiment) || !['low','medium','high'].includes(c.conviction) || !['low','medium','high'].includes(c.urgency) || seen.has(`${c.postId}:${c.symbol}`)) throw new Error('Invalid or duplicate post classification.');
    seen.add(`${c.postId}:${c.symbol}`);
  }
  if (x.action !== 'HOLD' && (!evidence.markets.some(m => m.symbol === x.symbol) || !x.factors.length)) throw new Error('A practice proposal requires cited market evidence.');
  if(x.action==='BUY'&&evidence.posts.some(p=>!x.classifications.some(c=>c.postId===p.id&&c.symbol===x.symbol)))throw new Error('Entry interpretation omits a selected source classification.');
  return structuredClone(x);
}
export function signal(p: Policy, strategy: Strategy, e: Evidence, x: Interpretation, now: number, omit?: string) {
  const reasons: string[] = [];
  const market = e.markets.filter(m => m.symbol === x.symbol);
  if (market.length !== 1) reasons.push('Instrument identity is missing or ambiguous.');
  const m = market[0];
  if (!m || !fresh(m.observedAt, now, p.maxAgeSeconds) || integer(m.price) === 0n || integer(m.liquidity) === 0n || !m.safe) reasons.push('Fresh price, liquidity and passing safety evidence are required.');
  if (e.mode === 'synthetic-test') reasons.push('Synthetic test evidence cannot produce practice orders.');
  const eligible = e.posts.filter(post => post.id !== omit && post.author !== omit && fresh(post.publishedAt, now, p.maxAgeSeconds));
  const classifications = x.classifications.filter(c => c.symbol === x.symbol && eligible.some(post => post.id === c.postId));
  const supports = classifications.filter(c => c.sentiment === 'bullish' && c.conviction !== 'low');
  const opposes = classifications.filter(c => c.sentiment === 'bearish');
  if (strategy === 'multi-kol') {
    const posts = supports.map(c => eligible.find(post => post.id === c.postId)!).filter(post => post.source === 'x' && p.voices.includes(post.author));
    const roots = posts.map((_, i) => i);
    const root = (i: number): number => roots[i] === i ? i : (roots[i] = root(roots[i]));
    const texts = posts.map(post => post.text.trim().toLowerCase().replace(/\s+/g, ' '));
    // Shared origin or copied text links a single evidence group, including transitive copies.
    for (let i = 0; i < posts.length; i++) for (let j = 0; j < i; j++) {
      if (posts[i].originId === posts[j].originId || texts[i] === texts[j]) roots[root(i)] = root(j);
    }
    const groups = new Map<number, Set<string>>();
    posts.forEach((post, i) => {const voices=groups.get(root(i))??new Set<string>();voices.add(post.author);groups.set(root(i),voices);});
    const matched = new Map<string, number>();
    function assign(group:number,seen:Set<string>):boolean {
      for(const author of [...groups.get(group)!].sort()) {
        if(seen.has(author))continue;seen.add(author);
        if(!matched.has(author)||assign(matched.get(author)!,seen)){matched.set(author,group);return true;}
      }
      return false;
    }
    for(const group of groups.keys())assign(group,new Set());
    const distinct = matched.size;
    if (distinct < p.convergence) reasons.push(`Independent selected-voice support ${distinct} is below ${p.convergence}.`);
    if (opposes.some(c => eligible.find(post => post.id === c.postId)?.source === 'x')) reasons.push('Conflicting selected-voice evidence blocks a new entry.');
    if (!e.sources.some(s => s.source === 'x' && s.available)) reasons.push('Authorized X observations are unavailable.');
  } else {
    const supportedNews = supports.filter(c => eligible.find(post => post.id === c.postId)?.source === 'news' && x.factors.some(f => f.evidenceId === c.postId && f.stance === 'support'));
    if (!supportedNews.length) reasons.push('A cited, fresh supporting news catalyst is required.');
    if (opposes.some(c => eligible.find(post => post.id === c.postId)?.source === 'news')) reasons.push('Conflicting news evidence blocks a new entry.');
    if (!e.sources.some(s => s.source === 'news' && s.available)) reasons.push('Configured news observations are unavailable.');
  }
  if (!e.sources.some(s => s.source === 'ryo' && s.available)) reasons.push('Authentic RYO market evidence is unavailable.');
  if (!p.symbols.includes(x.symbol)) reasons.push('Instrument is outside the signed watchlist.');
  return { pass: reasons.length === 0, reasons, market: m };
}
export function sensitivity(p: Policy, s: Strategy, e: Evidence, x: Interpretation, now: number) {
  const keys = s === 'multi-kol' ? [...new Set(e.posts.filter(p => p.source === 'x').map(p => p.author))] : e.posts.filter(p => p.source === 'news').map(p => p.id);
  return keys.slice(0,20).map(omitted => ({ omitted, wouldPass: signal(p,s,e,x,now,omitted).pass }));
}
