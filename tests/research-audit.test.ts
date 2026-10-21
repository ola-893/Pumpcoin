import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePortfolio,initialPortfolio } from '../practice/ledger.js';
import { evaluate } from '../research/evaluation.js';
import { policy,evidence,session,signedPolicy,interpretation } from './research-fixtures.js';
import { signal } from '../research/signals.js';
const t=(n:number)=>new Date(Date.parse('2026-10-16T00:00:00Z')+n*1000).toISOString();
function queued(p=policy()) {const v=initialPortfolio(p);v.updatedAt=t(0);v.pending.push({id:'audit-order',side:'BUY',symbol:'ETH',marketId:'eip155:1:ETH',createdAt:t(0),eligibleAt:t(5),expiresAt:t(100),notional:'1000000000',reason:'Test-only audit order'});return v;}
test('audit: pending entries recheck cooldown at execution, including another fill in the same observation',()=>{
  const p=policy(),v=queued(p);v.lastEntryAt=t(4);
  const result=advancePortfolio(v,p,evidence(t(6)),t(6));
  assert.equal(result.portfolio.positions.length,0);
  assert.match(result.events[0].reason,/Fill-time/);
});
test('audit: execution enforces the signed risk budget even for an oversized queued order',()=>{
  const p={...policy(),riskBps:1};
  assert.equal(advancePortfolio(queued(p),p,evidence(t(6)),t(6)).portfolio.positions.length,0);
});
test('audit: an older quote cannot close a position after a newer entry observation',()=>{
  const p=policy(),opened=advancePortfolio(queued(p),p,evidence(t(6)),t(6)).portfolio;
  const old=evidence(t(5),'90000000');old.capturedAt=t(7);
  const next=advancePortfolio(opened,p,old,t(7));
  assert.equal(next.portfolio.positions.length,1);assert.equal(next.events.filter(x=>x.side==='SELL').length,0);
  assert.equal(next.portfolio.equity,null);
});
test('audit: synthetic evidence never fills existing live practice orders',()=>{
  const p=policy(),e=evidence(t(6));e.mode='synthetic-test';
  assert.throws(()=>advancePortfolio(queued(p),p,e,t(6)),/synthetic/i);
});
test('audit: copied post consensus is independent of provider order',()=>{
  const p=policy(),e=evidence(t(0)),x=interpretation();
  e.posts.push({...e.posts[1],id:'x3',author:'456',originId:'independent',text:'Another independent source'});
  e.posts[2].text=e.posts[1].text;x.classifications=[x.classifications[2],x.classifications[1],{...x.classifications[1],postId:'x3'}];
  assert.equal(signal(p,'multi-kol',e,x,Date.parse(t(0))).pass,true);
  x.classifications.reverse();assert.equal(signal(p,'multi-kol',e,x,Date.parse(t(0))).pass,true);
});
test('audit: a single strategy cannot establish a paired common window',async()=>{
  const p=await signedPolicy(),s=session(p.policy);
  const row={receipt:{body:{at:t(1),trace:null,outcome:'blocked'}},evidence:evidence(t(1))} as any;
  assert.equal(evaluate(p,[s],()=>[row]).commonWindow,null);
});
test('audit: comparison reports overlapping period boundaries and is inconclusive without qualified shared evidence',async()=>{
  const p=await signedPolicy(),a=session(p.policy),b={...session(p.policy),id:'test-second-session',strategy:'multi-kol' as const};
  const rows=(s:typeof a,ts:number[])=>ts.map(n=>({receipt:{body:{at:t(n),trace:null,outcome:'blocked',order:null,evidenceHash:`test:${n}`}},evidence:evidence(t(n))})) as any;
  const report=evaluate(p,[a,b],id=>id===a.id?rows(a,[0,6,12,18]):rows(b,[6,12,18,24]));
  assert.deepEqual(report.commonWindow,{from:t(6),to:t(18)});assert.equal(report.matchedEvidenceCycles,0);assert.match(report.conclusion,/inconclusive/);
  for(const lane of report.lanes){assert.equal(lane.period?.from,t(6));assert.equal(lane.period?.to,t(18));assert.equal(lane.period?.returnBps,0);assert.equal(lane.period?.closedPositions,0);}
});
