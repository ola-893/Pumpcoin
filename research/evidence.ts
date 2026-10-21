import { digest,integer,time } from './encoding.js';
import { normalizeCapture,type Capture } from './normalization.js';
import type { Evidence,Policy,Trace } from './types.js';
/** Internal consistency only: an operator can still fabricate an entire signed capture. */
export function validateTimeline(e:Evidence,at:string,trace:Trace|null=null) {
  const decision=time(at),captured=time(e.capturedAt);
  if(captured>decision)throw new Error('Evidence capture is later than the decision.');
  const unique=(values:string[])=>values.length===new Set(values).size;
  if(!unique(e.posts.map(p=>p.id))||!unique(e.markets.map(m=>m.evidenceId)))throw new Error('Duplicate evidence references.');
  for(const m of e.markets){integer(m.price);integer(m.liquidity);if(time(m.observedAt)>captured)throw new Error('Market observation is later than capture.');}
  for(const p of e.posts)if(time(p.publishedAt)>captured)throw new Error('Post publication is later than capture.');
  for(const s of e.sources)if(time(s.retrievedAt)>captured)throw new Error('Source retrieval is later than capture.');
  if(trace&&(time(trace.startedAt)<captured||time(trace.finishedAt)<time(trace.startedAt)||time(trace.finishedAt)>decision))throw new Error('Invalid source-to-inference-to-decision timeline.');
}
export function verifyNormalization(e:Evidence,p:Policy) {
  const markets:Evidence['markets']=[],posts:Evidence['posts']=[],seen=new Set<string>(),claimed=new Set<string>();
  for(const value of e.raw){
    const c=value as Capture;if(!c||!['ryo','ryo-observation','news','x'].includes(c.kind))throw new Error('Missing reproducible source capture.');
    const key=c.kind==='ryo'||c.kind==='ryo-observation'?`ryo:${c.symbol}`:c.kind==='news'?`news:${c.feed}`:`x:${c.account}`;
    if(seen.has(key))throw new Error('Duplicate source capture.');seen.add(key);
    if((c.kind==='ryo'||c.kind==='ryo-observation')&&!p.symbols.includes(c.symbol)||c.kind==='news'&&!p.newsFeeds.includes(c.feed)||c.kind==='x'&&!p.voices.includes(c.account))throw new Error('Capture is outside the signed source policy.');
    if(time(c.receivedAt)>time(e.capturedAt))throw new Error('Raw response receipt is later than capture.');
    if(c.kind==='ryo'||c.kind==='ryo-observation')for(const x of c.exchanges)if(time(x.receivedAt)>time(c.receivedAt))throw new Error('Tool receipt is later than the market capture.');
    const normalized=normalizeCapture(c);markets.push(...normalized.markets);posts.push(...normalized.posts);
    if(c.kind!=='ryo-observation')claimed.add(key);
  }
  if(digest(markets)!==digest(e.markets)||digest(posts)!==digest(e.posts))throw new Error('Normalized observations differ from raw source captures.');
  for(const source of e.sources.filter(s=>s.available)) {
    const selected=source.source==='ryo'?p.symbols.map(s=>`ryo:${s}`):source.source==='news'?p.newsFeeds.map(s=>`news:${s}`):source.source==='x'?p.voices.map(s=>`x:${s}`):[source.source];
    if(!selected.length||selected.some(key=>!claimed.has(key)))throw new Error('Source coverage claim lacks its raw capture or verified mapping.');
  }
}
