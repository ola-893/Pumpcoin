import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCoinbase,coinbaseBookUrl,type CoinbaseCapture } from '../research/coinbase.js';
import { normalizeCapture } from '../research/normalization.js';
import { validatePolicy } from '../research/policy.js';
import { verifyNormalization,validateTimeline } from '../research/evidence.js';
import { marketEligibility } from '../research/eligibility.js';
import { signal } from '../research/signals.js';
import { advancePortfolio,initialPortfolio } from '../practice/ledger.js';
import { researchSources } from '../research/providers.js';
import { policy,evidence,interpretation,registrationId,commitment } from './research-fixtures.js';
const t=(n:number)=>new Date(Date.parse('2026-10-23T00:00:00Z')+n*1000).toISOString();
// Controlled book, never presented as a live provider observation.
const body=()=>({bids:[['100','2.123456789123456789',20]],asks:[['100.02','3',8]],sequence:123,auction_mode:false,time:t(1)});
const capture=():CoinbaseCapture=>({kind:'coinbase-exchange',symbol:'ETH',url:coinbaseBookUrl('ETH'),body:JSON.stringify(body()),status:200,startedAt:t(0),receivedAt:t(2)});
function authorized(){const p=policy();p.strategies=['market-news'];p.voices=[];p.marketRules.source='coinbase-exchange';p.marketRules.instruments=[{id:'coinbase:ETH-USD',symbol:'ETH',network:'coinbase-exchange'}];return p;}
function observed(n=2){const c=capture();c.startedAt=t(n-2);c.receivedAt=t(n);c.body=JSON.stringify({...body(),time:t(n-1)});const e=evidence(t(n));e.markets=normalizeCapture(c).markets;e.raw=[c];e.posts=[];e.sources=[{source:'coinbase-exchange',available:true,retrievedAt:t(n)},{source:'ryo',available:false,retrievedAt:t(n)}];return e;}
test('exact raw book replay uses provider time, midpoint and smaller 10 bps depth; order count never inflates depth',()=>{
  const m=normalizeCoinbase(capture());assert.equal(m.price,'100010000');assert.equal(m.liquidity,'212345678');assert.equal(m.observedAt,t(1));assert.equal(m.id,'coinbase:ETH-USD');assert.deepEqual(m.risk,{status:'unavailable'});
  verifyNormalization(observed(),authorized());validateTimeline(observed(),t(3));
  const tampered=observed();tampered.markets[0].price='999';assert.throws(()=>verifyNormalization(tampered,authorized()),/Normalized/);
  assert.throws(()=>verifyNormalization(observed(),policy()),/signed market source/);
});
test('failed HTTP, auctions, empty/crossed books, bad precision and missing/future provider time retain no usable market',()=>{
  const cases=[{...body(),auction_mode:true},{...body(),bids:[]},{...body(),asks:[['99','3',1]]},{...body(),time:undefined},{...body(),time:t(3)},{...body(),bids:[['100','-1',1]]},{...body(),sequence:1.2}];
  for(const value of cases){const c={...capture(),body:JSON.stringify(value)};assert.throws(()=>normalizeCoinbase(c));assert.equal(normalizeCapture(c).markets.length,0);}
  const failed={...capture(),status:429,body:'{"message":"rate limited"}'};assert.throws(()=>normalizeCoinbase(failed),/successful/);
  const e=observed();e.raw=[failed];e.markets=[];assert.throws(()=>verifyNormalization(e,authorized()),/coverage claim/);
  assert.throws(()=>normalizeCoinbase({...capture(),url:coinbaseBookUrl('BTC')}),/binding/);
  assert.throws(()=>coinbaseBookUrl('ETH/../BTC'),/symbol/);
});
test('new source requires exact signed instrument, fresh depth, acceptable spread and source coverage; RYO outage is independent',()=>{
  const p=authorized();validatePolicy(p,registrationId,commitment);
  const e=observed();e.posts=evidence(t(2)).posts.filter(p=>p.source==='news');e.sources.push({source:'news',available:true,retrievedAt:t(2)});
  assert.equal(signal(p,'market-news',e,interpretation(),Date.parse(t(2))).pass,true);
  assert.equal(marketEligibility(p,e.markets[0],Date.parse(t(4000))).length>0,true);
  const mismatch=authorized();mismatch.marketRules.instruments[0].network='Ethereum';assert.throws(()=>validatePolicy(mismatch,registrationId,commitment),/exact Coinbase/);
  const old=policy();assert.equal(signal(old,'market-news',e,interpretation(),Date.parse(t(2))).pass,false);
  const wide=structuredClone(e.markets[0]);wide.quote!.ask='110000000';assert(marketEligibility(p,wide,Date.parse(t(2))).some(x=>x.includes('spread')));
  e.sources.find(s=>s.source==='coinbase-exchange')!.available=false;assert.equal(signal(p,'market-news',e,interpretation(),Date.parse(t(2))).pass,false);
});
test('later provider observation is required for fill; sizing, adverse slippage, fees and replay remain deterministic',()=>{
  const p=authorized(),v=initialPortfolio(p);v.pending.push({id:'controlled',side:'BUY',symbol:'ETH',marketId:'coinbase:ETH-USD',createdAt:t(2),eligibleAt:t(7),expiresAt:t(100),notional:'1000000',reason:'Controlled test only'});
  assert.equal(advancePortfolio(v,p,observed(2),t(8)).portfolio.positions.length,0,'Cached receipt cannot masquerade as later quote');
  const e=observed(9),a=advancePortfolio(v,p,e,t(10)),b=advancePortfolio(v,p,e,t(10));assert.deepEqual(a,b);assert.equal(a.portfolio.positions.length,1);
  const fill=a.events.find(x=>x.side==='BUY')!,expectedPrice=(100010000n*10020n+9999n)/10000n;
  assert.equal(fill.price,String(expectedPrice));assert.equal(fill.fee,'1000');assert.equal(fill.quantity,String(1000000n*1000000000000n/expectedPrice));
  assert.equal(BigInt(a.portfolio.cash)+BigInt(a.portfolio.positions[0].cost),BigInt(p.initialCash));
  const tooBig=structuredClone(v);tooBig.pending[0].notional='3000000';assert.equal(advancePortfolio(tooBig,p,e,t(10)).portfolio.positions.length,0,'1% of measured depth enforced at fill');
});
test('public adapter sends no exchange credential, coalesces reads without retimestamping, and preserves HTTP failure evidence',async()=>{
  let calls=0,status=200;const source=researchSources({newsFeeds:[]},(async(input,init)=>{calls++;assert.equal(String(input),coinbaseBookUrl('ETH'));assert.equal((init?.headers as any).Authorization,undefined);return new Response(status===200?JSON.stringify({...body(),time:new Date(Date.now()-1000).toISOString()}):'{"message":"unavailable"}',{status});}) as typeof fetch);
  const p=authorized();p.newsFeeds=[];const [a,b]=await Promise.all([source.collect(p),source.collect(p)]);assert.deepEqual(a,b);assert.equal(calls,1);verifyNormalization(a,p);
  assert.equal(a.sources.find(s=>s.source==='ryo')!.available,false);assert.equal(a.sources.find(s=>s.source==='coinbase-exchange')!.available,true);
  status=503;const failed=await source.check('ETH','coinbase-exchange');assert.equal(failed.markets.length,0);assert.equal((failed.raw[0] as CoinbaseCapture).status,503);verifyNormalization(failed,p);
});
test('level-two depth excludes far orders, checks ordering and never borrows depth from the stronger side',()=>{
  const c=capture();c.body=JSON.stringify({...body(),bids:[...body().bids,['99','999999',50]],asks:[...body().asks,['101','999999',50]]});
  assert.equal(normalizeCoinbase(c).liquidity,'212345678');
  c.body=JSON.stringify({...body(),bids:[...body().bids,['100','1',1]]});assert.throws(()=>normalizeCoinbase(c),/Unordered/);
  const p=authorized();p.slippageBps=9;assert(marketEligibility(p,normalizeCoinbase(capture()),Date.parse(t(2))).some(x=>x.includes('10 bps')));
});
test('malformed RYO tool result cannot erase a valid separately authorized Coinbase capture',async()=>{
  const endpoint='https://93.184.216.34/api/mcp';
  const source=researchSources({url:endpoint,key:'controlled-test-key',newsFeeds:[]},(async(input,init)=>{
    if(String(input)===coinbaseBookUrl('ETH')){assert.equal((init?.headers as any).Authorization,undefined);return Response.json({...body(),time:new Date(Date.now()-1000).toISOString()});}
    assert.equal(String(input),endpoint);const request=JSON.parse(init!.body as string);
    if(request.method==='initialize')return Response.json({jsonrpc:'2.0',id:request.id,result:{protocolVersion:'2024-11-05'}});
    if(request.method==='notifications/initialized')return new Response(null,{status:202});
    if(request.method==='tools/list')return Response.json({jsonrpc:'2.0',id:request.id,result:{tools:[{name:'analyze_token',inputSchema:{type:'object',properties:{symbol:{type:'string'}}}}]}});
    return new Response('upstream returned malformed JSON',{headers:{'Content-Type':'application/json'}});
  }) as typeof fetch);
  const p=authorized();p.newsFeeds=[];const e=await source.collect(p);verifyNormalization(e,p);
  assert.equal(e.markets.length,1);assert.equal(e.sources.find(s=>s.source==='ryo')!.available,false);assert.equal(e.sources.find(s=>s.source==='coinbase-exchange')!.available,true);
  assert.equal((e.raw[1] as any).exchanges[0].body,'upstream returned malformed JSON');
});
test('a controlled signed Coinbase-policy checkpoint replays a queued entry and delayed fill; changing the source invalidates authorization',async()=>{
  const {signedPolicy,session,controller,execution}=await import('./research-fixtures.js');
  const {researchEngineDigest}=await import('../research/engine.js');
  const {policyMessage,receiptMessage,checkpointMessage,verifyPolicy}=await import('../research/policy.js');
  const {researchRequest}=await import('../research/request.js');const {decide}=await import('../research/decision.js');
  const {verifyCheckpoint}=await import('../research/checkpoint.js');const {digest}=await import('../research/encoding.js');
  const p=authorized();p.engineDigest=await researchEngineDigest();const signed=await signedPolicy(p);signed.createdAt=t(0);signed.expiresAt=Date.parse(t(600));
  signed.controllerSignature=await controller.signMessage({message:policyMessage(signed,'controller')});signed.executionSignature=await execution.signMessage({message:policyMessage(signed,'execution')});
  const s=session(p);s.id=digest([signed.id,s.strategy]);s.createdAt=signed.createdAt;const receipts:any[]=[],captures:any[]=[],events:any[]=[];
  for(const [n,action] of [[2,'BUY'],[9,'HOLD']] as const){
    const e=observed(n),news={kind:'news' as const,feed:p.newsFeeds[0],receivedAt:t(n),contentType:'application/json',body:JSON.stringify({items:[{id:'controlled-news',url:'https://example.com/story',title:'Controlled ETH catalyst',date_published:t(1)}]})};
    e.raw.push(news);e.posts=normalizeCapture(news).posts;e.sources.push({source:'news',available:true,retrievedAt:t(n)});verifyNormalization(e,p);
    const x={action,symbol:'ETH',factors:[{evidenceId:e.posts[0].id,stance:'support' as const,explanation:'Controlled test interpretation only'}],classifications:[{postId:e.posts[0].id,symbol:'ETH',sentiment:'bullish' as const,conviction:'medium' as const,urgency:'low' as const}]};
    const rawContent=JSON.stringify(x),trace={request:researchRequest('test-model',p,s.strategy,e),response:{model:'test-model',choices:[{finish_reason:'stop',message:{content:rawContent}}]},rawContent,interpretation:x,model:'test-model',startedAt:t(n),finishedAt:t(n+1)};
    const advanced=advancePortfolio(s.portfolio,p,e,t(n+1));s.portfolio=advanced.portfolio;events.push(...advanced.events);
    const body=decide(s,signed,e,trace,t(n+1)),hash=digest(body);receipts.push({body,hash,signature:await execution.signMessage({message:receiptMessage(hash)})});captures.push({hash:digest(e),value:e});
    if(body.order)s.portfolio.pending.push(body.order);s.sequence++;s.cycles++;s.head=hash;s.observedAt=body.at;
  }
  assert.equal(receipts[0].body.outcome,'accepted');assert.equal(s.portfolio.positions.length,1);
  const value={version:'PUMPCOIN-PRACTICE-CHECKPOINT-v1' as const,session:s,policy:signed,receipts,evidence:captures,events};
  await verifyCheckpoint({...value,hash:digest(value),signature:await execution.signMessage({message:checkpointMessage(digest(value))})},{id:registrationId,commitment,manifest:{controller:controller.address,executionKey:execution.address,model:{id:'test-model'}}} as any);
  signed.policy.marketRules.source='ryo';await assert.rejects(verifyPolicy(signed));
});
