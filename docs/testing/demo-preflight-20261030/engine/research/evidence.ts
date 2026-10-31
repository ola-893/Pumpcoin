import { digest,integer,time } from './encoding.js';
import {researchSourceKey} from './ryo-research.js';
import { normalizeCapture,type Capture } from './normalization.js';
import type { Evidence,Policy,Trace } from './types.js';
/** Internal consistency only: an operator can still fabricate an entire signed capture. */
export function validateTimeline(e:Evidence,at:string,trace:Trace|null=null) {
  const decision=time(at),captured=time(e.capturedAt);
  if(captured>decision)throw new Error('Evidence capture is later than the decision.');
  const unique=(values:string[])=>values.length===new Set(values).size;
  if(!unique(e.posts.map(p=>p.id))||!unique(e.markets.map(m=>m.evidenceId)))throw new Error('Duplicate evidence references.');
  for(const m of e.markets){integer(m.price);integer(m.liquidity);if(time(m.observedAt)>captured)throw new Error('Market observation is later than capture.');if(!m.risk||!['unavailable','observed'].includes(m.risk.status)||m.risk.status==='observed'&&(!Array.isArray(m.risk.flags)||m.risk.flags.some(x=>typeof x!=='string'||!x.trim())||time(m.risk.observedAt)>captured))throw new Error('Market risk coverage is invalid or later than capture.');}
  if(!unique((e.research??[]).map(r=>r.id)))throw new Error('Duplicate research references.');
  for(const r of e.research??[])if(time(r.asOf)>captured||time(r.receivedAt)>captured||time(r.asOf)>time(r.receivedAt))throw new Error('Research timestamps are later than capture or receipt.');
  for(const p of e.posts)if(time(p.publishedAt)>captured)throw new Error('Post publication is later than capture.');
  for(const s of e.sources)if(time(s.retrievedAt)>captured)throw new Error('Source retrieval is later than capture.');
  if(trace&&(time(trace.startedAt)<captured||time(trace.finishedAt)<time(trace.startedAt)||time(trace.finishedAt)>decision))throw new Error('Invalid source-to-inference-to-decision timeline.');
}
export function verifyNormalization(e:Evidence,p:Policy) {
  const markets:Evidence['markets']=[],posts:Evidence['posts']=[],research:NonNullable<Evidence['research']>=[],seen=new Set<string>(),claimed=new Set<string>();
  for(const value of e.raw){
    const c=value as Capture;if(!c||!['ryo','ryo-observation','ryo-research','coinbase-exchange','news','x'].includes(c.kind))throw new Error('Missing reproducible source capture.');
    const key=c.kind==='ryo-research'?researchSourceKey(c.tool,c.arguments):c.kind==='coinbase-exchange'?`coinbase-exchange:${c.symbol}`:c.kind==='ryo'||c.kind==='ryo-observation'?`ryo:${c.symbol}`:c.kind==='news'?`news:${c.feed}`:`x:${c.account}`;
    if(seen.has(key))throw new Error('Duplicate source capture.');seen.add(key);
    if((c.kind==='ryo'||c.kind==='ryo-observation')&&!p.symbols.includes(c.symbol)||c.kind==='news'&&!p.newsFeeds.includes(c.feed)||c.kind==='x'&&!p.voices.includes(c.account))throw new Error('Capture is outside the signed source policy.');
    if(c.kind==='ryo-research'&&(!p.ryoResearch||c.tool==='analyze_token'&&!p.symbols.includes(c.arguments.symbol as string)))throw new Error('RYO research capture is outside the signed policy.');
    if(c.kind==='coinbase-exchange'&&(p.marketRules.source!=='coinbase-exchange'||!p.symbols.includes(c.symbol)))throw new Error('Coinbase capture is outside the signed market source policy.');
    if(time(c.receivedAt)>time(e.capturedAt))throw new Error('Raw response receipt is later than capture.');
    if(c.kind==='ryo'||c.kind==='ryo-observation'||c.kind==='ryo-research')for(const x of c.exchanges)if(time(x.receivedAt)>time(c.receivedAt))throw new Error('Tool receipt is later than the market capture.');
    const normalized=normalizeCapture(c);markets.push(...normalized.markets);posts.push(...normalized.posts);research.push(...normalized.research??[]);
    if(c.kind!=='ryo-observation'&&(c.kind!=='ryo-research'||normalized.research?.length)&&(c.kind!=='coinbase-exchange'||normalized.markets.length))claimed.add(key);
  }
  if(digest(markets)!==digest(e.markets)||digest(posts)!==digest(e.posts)||digest(research)!==digest(e.research??[]))throw new Error('Normalized observations differ from raw source captures.');
  for(const source of e.sources.filter(s=>s.available)) {
    const selected=source.source==='ryo-research'?[...p.symbols.map(s=>`ryo-research:${s}`),'ryo-sentiment']:source.source==='coinbase-exchange'?p.symbols.map(s=>`coinbase-exchange:${s}`):source.source==='ryo'?p.symbols.map(s=>`ryo:${s}`):source.source==='news'?p.newsFeeds.map(s=>`news:${s}`):source.source==='x'?p.voices.map(s=>`x:${s}`):[source.source];
    if(!selected.length||selected.some(key=>!claimed.has(key)))throw new Error('Source coverage claim lacks its raw capture or verified mapping.');
  }
}
