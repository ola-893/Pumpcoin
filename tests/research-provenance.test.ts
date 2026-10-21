import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCapture,decodeMcpResponse,type Capture,type RyoProfile } from '../research/normalization.js';
import { validateTimeline,verifyNormalization } from '../research/evidence.js';
import { interpretationEvidence } from '../research/request.js';
import { validateInterpretation,signal } from '../research/signals.js';
import { advancePortfolio,initialPortfolio } from '../practice/ledger.js';
import { evidence,policy,interpretation } from './research-fixtures.js';
const t=(n:number)=>new Date(Date.parse('2026-10-16T00:00:00Z')+n*1000).toISOString();
// This is a deliberately test-owned mapping. It is NOT an authentic RYO schema.
const fields=['id','symbol','network','price','liquidity','safe','observedAt','liquidityObservedAt','safetyObservedAt','mode'];
function capture():Capture {const profile:RyoProfile={version:1,tools:{analyze_token:{arguments:{symbol:'{{symbol}}'}}},fields:Object.fromEntries(fields.map(f=>[f,{tool:'analyze_token',pointer:`/${f}`}])) as RyoProfile['fields']};
  const result={id:'test:ETH',symbol:'ETH',network:'test',price:'100',liquidity:'100000',safe:true,mode:'live',observedAt:t(5),liquidityObservedAt:t(4),safetyObservedAt:t(1)};
  return {kind:'ryo',symbol:'ETH',profile,catalog:[{name:'analyze_token',inputSchema:{type:'object',properties:{symbol:{type:'string'}}}}],exchanges:[{method:'tools/call',params:{name:'analyze_token',arguments:{symbol:'ETH'}},id:7,body:JSON.stringify({jsonrpc:'2.0',id:7,result:{structuredContent:result}}),contentType:'application/json',receivedAt:t(6)}],receivedAt:t(6)};
}
test('raw market normalization replays exactly and uses the oldest price/liquidity/safety timestamp',()=>{
  const c=capture(),normalized=normalizeCapture(c);assert.equal(normalized.markets[0].observedAt,t(1));assert.equal(normalized.markets[0].price,'100000000');
  const e=evidence(t(7));e.posts=[];e.markets=normalized.markets;e.raw=[c];e.sources=[{source:'ryo',available:true,retrievedAt:t(6)}];
  verifyNormalization(e,policy());e.markets[0].safe=false;assert.throws(()=>verifyNormalization(e,policy()),/Normalized/);
  const bad=capture() as Extract<Capture,{kind:'ryo'}>;delete (bad.profile.fields as any).safetyObservedAt;assert.throws(()=>normalizeCapture(bad),/mapping/);
});
test('raw news/X transformation preserves originals while reproducing stripping, truncation and repost attribution',()=>{
  const c:Capture={kind:'news',feed:policy().newsFeeds[0],receivedAt:t(6),contentType:'application/feed+json',body:JSON.stringify({items:[{id:'test',url:'https://example.com/story',title:'<b>Headline</b>',content_text:'a'.repeat(4500),date_published:t(1)}]})};
  const post=normalizeCapture(c).posts[0];assert.equal(post.text.length,4000);assert(!post.text.includes('<b>'));assert(c.body.includes('<b>'));
  const x:Capture={kind:'x',account:'123',receivedAt:t(6),body:JSON.stringify({data:[{id:'12',author_id:'123',text:'RT test',created_at:t(1),referenced_tweets:[{type:'retweeted',id:'9'}]}]})};
  assert.equal(normalizeCapture(x).posts[0].originId,'9');
  assert.deepEqual(normalizeCapture({...x,body:JSON.stringify({meta:{result_count:0}})}).posts,[]);
});
test('future sources, reversed inference timing, mismatched MCP responses and duplicate references fail',()=>{
  const e=evidence(t(2));e.markets[0].observedAt=t(3);assert.throws(()=>validateTimeline(e,t(4)),/Market/);
  const good=evidence(t(2)),trace={request:{},rawContent:'{}',interpretation:interpretation(),model:'test',startedAt:t(1),finishedAt:t(3)};
  assert.throws(()=>validateTimeline(good,t(4),trace),/timeline/);trace.startedAt=t(2);trace.finishedAt=t(5);assert.throws(()=>validateTimeline(good,t(4),trace),/timeline/);
  good.posts.push(good.posts[0]);assert.throws(()=>validateTimeline(good,t(4)),/Duplicate/);
  assert.throws(()=>decodeMcpResponse('{"jsonrpc":"2.0","id":8,"result":{}}','application/json',7),/match/);
});
test('selection excludes stale/future posts, records bounded previews, and requires all selected entry classifications',()=>{
  const p=policy(),e=evidence(t(4000));e.posts[0].publishedAt=t(0);e.posts[1].publishedAt=t(4001);
  assert.equal(interpretationEvidence(e,p,'market-news').posts.length,0);assert.equal(interpretationEvidence(e,p,'multi-kol').posts.length,1);
  const selected=interpretationEvidence(evidence(t(0)),p,'multi-kol'),x=interpretation();x.classifications=x.classifications.filter(c=>c.postId==='x1');
  x.factors=[{evidenceId:'x1',stance:'support',explanation:'test'}];assert.throws(()=>validateInterpretation(x,selected),/omits/);
  const market=normalizeCapture(capture()).markets[0],stale=evidence(t(3602));stale.markets=[market];assert.equal(signal(p,'market-news',stale,interpretation(),Date.parse(t(3602))).pass,false);
});
test('24 independent Python accounting references match entry rounding, adverse gap exits, fees and conserved cash',()=>{
  const cases=JSON.parse(readFileSync(new URL('../docs/testing/ryo-audit-20261017/accounting-cases.json',import.meta.url),'utf8')).cases;
  for(const c of cases){const p={...policy(),feeBps:c.feeBps,slippageBps:c.slippageBps},v=initialPortfolio(p);v.pending.push({id:'test',side:'BUY',marketId:'eip155:1:ETH',symbol:'ETH',createdAt:t(0),eligibleAt:t(5),expiresAt:t(100),notional:c.notional,reason:'Synthetic independent-accounting test'});
    const opened=advancePortfolio(v,p,evidence(t(6),c.quote),t(6)),entry=opened.events.find(e=>e.side==='BUY')!;
    assert.equal(entry.price,c.expected.entry);assert.equal(entry.quantity,c.expected.quantity);assert.equal(entry.fee,c.expected.entryFee);assert.equal(opened.portfolio.cash,c.expected.cashAfterEntry);
    const closed=advancePortfolio(opened.portfolio,p,evidence(t(7),c.exitQuote),t(7)),exit=closed.events.find(e=>e.side==='SELL')!;
    assert.equal(exit.price,c.expected.exitPrice);assert.equal(exit.fee,c.expected.exitFee);assert.equal(closed.portfolio.fees,c.expected.totalFees);assert.equal(closed.portfolio.cash,c.expected.finalCash);assert.equal(closed.portfolio.realized,c.expected.realized);
    assert.equal(BigInt(closed.portfolio.cash),BigInt(p.initialCash)+BigInt(closed.portfolio.realized));
    assert.equal(advancePortfolio(closed.portfolio,p,evidence(t(8),c.exitQuote),t(8)).events.filter(e=>e.kind==='fill').length,0);
  }
});
test('a test-owned signed checkpoint verifies internal consistency, while a re-signed truncated model response is rejected',async()=>{
  const {signedPolicy,session,registrationId,commitment,controller,execution}=await import('./research-fixtures.js');
  const {researchEngineDigest}=await import('../research/engine.js'),{digest}=await import('../research/encoding.js');
  const {policyMessage,receiptMessage,checkpointMessage}=await import('../research/policy.js');
  const {decide}=await import('../research/decision.js'),{researchRequest}=await import('../research/request.js'),{verifyCheckpoint}=await import('../research/checkpoint.js');
  const signed=await signedPolicy({...policy(),engineDigest:await researchEngineDigest()});signed.createdAt=t(0);signed.expiresAt=Date.parse(t(600));
  signed.controllerSignature=await controller.signMessage({message:policyMessage(signed,'controller')});signed.executionSignature=await execution.signMessage({message:policyMessage(signed,'execution')});
  const raw:Capture[]=[capture(),{kind:'news',feed:policy().newsFeeds[0],body:'{"items":[]}',contentType:'application/json',receivedAt:t(6)},...policy().voices.map(account=>({kind:'x' as const,account,body:'{"meta":{"result_count":0}}',receivedAt:t(6)}))];
  const e=evidence(t(7));e.raw=raw;e.markets=raw.flatMap(c=>normalizeCapture(c).markets);e.posts=[];e.sources=['ryo','news','x'].map(source=>({source,available:true,retrievedAt:t(6)}));
  const x={action:'HOLD' as const,symbol:'ETH',factors:[],classifications:[]},rawContent=JSON.stringify(x),response={model:'test-model',choices:[{finish_reason:'stop',message:{content:rawContent}}]};
  const trace={request:researchRequest('test-model',signed.policy,'market-news',e),response,rawContent,interpretation:x,model:'test-model',startedAt:t(7),finishedAt:t(8)};
  const s=session(signed.policy);s.id=digest([signed.id,s.strategy]);s.createdAt=signed.createdAt;
  const advanced=advancePortfolio(s.portfolio,signed.policy,e,t(8));s.portfolio=advanced.portfolio;const body=decide(s,signed,e,trace,t(8)),hash=digest(body);
  const receipt={body,hash,signature:await execution.signMessage({message:receiptMessage(hash)})};s.sequence=1;s.cycles=1;s.head=hash;s.observedAt=t(8);
  const value={version:'PUMPCOIN-PRACTICE-CHECKPOINT-v1' as const,session:s,policy:signed,receipts:[receipt],evidence:[{hash:digest(e),value:e}],events:advanced.events};
  const checkpoint={...value,hash:digest(value),signature:await execution.signMessage({message:checkpointMessage(digest(value))})};
  const record={id:registrationId,commitment,manifest:{controller:controller.address,executionKey:execution.address,model:{id:'test-model'}}} as any;
  await verifyCheckpoint(checkpoint,record); // Deliberately fabricated fixture: this is not provider/model attestation.
  (checkpoint.receipts[0].body.trace!.response as typeof response).choices[0].finish_reason='length';
  checkpoint.receipts[0].hash=digest(checkpoint.receipts[0].body);checkpoint.receipts[0].signature=await execution.signMessage({message:receiptMessage(checkpoint.receipts[0].hash)});checkpoint.session.head=checkpoint.receipts[0].hash;
  const {hash:oldHash,signature:oldSignature,...tampered}=checkpoint;void oldHash;void oldSignature;
  checkpoint.hash=digest(tampered);checkpoint.signature=await execution.signMessage({message:checkpointMessage(checkpoint.hash)});
  await assert.rejects(verifyCheckpoint(checkpoint,record),/inference response/);
});
