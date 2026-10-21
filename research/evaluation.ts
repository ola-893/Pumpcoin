import type { Evidence,Receipt,Session,SignedPolicy,Strategy,Portfolio } from './types.js';
import { advancePortfolio,initialPortfolio } from '../practice/ledger.js';
export type Evaluation={policyHash:string;commonWindow:{from:string;to:string}|null;matchedEvidenceCycles:number;lanes:{sessionId:string;strategy:Strategy;window:{from:string;to:string}|null;cycles:number;commonWindowCycles:number;accepted:number;holds:number;blocked:number;errors:number;ryoAvailable:number;strategySourceAvailable:number;meanInferenceMs:number|null;providerCost:null;originality:string;period:{from:string;to:string;openingEquity:string;closingEquity:string;returnBps:number;drawdownBps:number;closedPositions:number}|null}[];conclusion:string};
type Row={receipt:Receipt;evidence:Evidence};
export function evaluate(policy:SignedPolicy,sessions:Session[],rows:(id:string)=>Row[]):Evaluation{
  const paired=sessions.filter(s=>s.policyHash===policy.hash),data=paired.map(s=>({s,rows:rows(s.id)}));
  const windows=data.map(x=>x.rows.length?{from:x.rows[0].receipt.body.at,to:x.rows.at(-1)!.receipt.body.at}:null);
  const hasPair=paired.length===2&&new Set(paired.map(s=>s.strategy)).size===2&&policy.policy.strategies.length===2;
  const from=hasPair&&windows.every(Boolean)?windows.map(w=>w!.from).sort().at(-1)!:null,to=hasPair&&windows.every(Boolean)?windows.map(w=>w!.to).sort()[0]:null;
  const commonWindow=from&&to&&from<to?{from,to}:null;
  const within=(r:Row)=>!!commonWindow&&r.receipt.body.at>=commonWindow.from&&r.receipt.body.at<=commonWindow.to;
  const qualified=(r:Row,s:Strategy)=>!!r.receipt.body.trace&&r.evidence.sources.some(v=>v.source==='ryo'&&v.available)&&r.evidence.sources.some(v=>v.source===(s==='multi-kol'?'x':'news')&&v.available);
  const sets=data.map(({s,rows})=>new Set(rows.filter(r=>within(r)&&qualified(r,s.strategy)).map(r=>r.receipt.body.evidenceHash)));
  const matchedEvidenceCycles=hasPair?[...sets[0]].filter(hash=>sets[1].has(hash)).length:0;
  const lanes=data.map(({s,rows:r},i)=>{
    const durations=r.flatMap(x=>x.receipt.body.trace?[Date.parse(x.receipt.body.trace.finishedAt)-Date.parse(x.receipt.body.trace.startedAt)]:[]);
    let portfolio=initialPortfolio(policy.policy);const points:{at:string;v:Portfolio}[]=[];
    for(const row of r){portfolio=advancePortfolio(portfolio,policy.policy,row.evidence,row.receipt.body.at).portfolio;if(row.receipt.body.order)portfolio.pending.push(row.receipt.body.order);if(within(row))points.push({at:row.receipt.body.at,v:structuredClone(portfolio)});}
    const first=points[0],last=points.at(-1);let period:Evaluation['lanes'][number]['period']=null;
    if(points.length>=2&&points.every(x=>x.v.equity!==null)&&BigInt(first.v.equity!)>0n){let peak=BigInt(first.v.equity!),dd=0;for(const point of points){const eq=BigInt(point.v.equity!);if(eq>peak)peak=eq;dd=Math.max(dd,Number((peak-eq)*10000n/peak));}period={from:first.at,to:last!.at,openingEquity:first.v.equity!,closingEquity:last!.v.equity!,returnBps:Number((BigInt(last!.v.equity!)-BigInt(first.v.equity!))*10000n/BigInt(first.v.equity!)),drawdownBps:dd,closedPositions:last!.v.closed-first.v.closed};}
    return {sessionId:s.id,strategy:s.strategy,window:windows[i],cycles:r.length,commonWindowCycles:r.filter(within).length,period,
      accepted:r.filter(x=>x.receipt.body.outcome==='accepted').length,holds:r.filter(x=>x.receipt.body.outcome==='hold').length,blocked:r.filter(x=>x.receipt.body.outcome==='blocked').length,errors:r.filter(x=>x.receipt.body.outcome==='error').length,
      ryoAvailable:r.filter(x=>x.evidence.sources.some(v=>v.source==='ryo'&&v.available)).length,strategySourceAvailable:r.filter(x=>x.evidence.sources.some(v=>v.source===(s.strategy==='multi-kol'?'x':'news')&&v.available)).length,
      meanInferenceMs:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null,providerCost:null,originality:'Requires human review; no automatic innovation score.'};});
  return {policyHash:policy.hash,commonWindow,matchedEvidenceCycles,lanes,
    conclusion:!commonWindow?'Comparison is inconclusive: both strategies need observations over a common window.':!matchedEvidenceCycles||lanes.some(l=>!l.period||!l.period.closedPositions)?'Comparison is inconclusive: shared qualified evidence and closed-position samples are insufficient. No winner is assigned.':'Overlapping period metrics and shared evidence are available. Boundaries and coverage still differ; no winner or profitability claim is assigned.'};
}
