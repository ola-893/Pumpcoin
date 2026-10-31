import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeCapture,decodeMcpResponse} from '../research/normalization.js';
import {normalizeRyoResearch,priceMicro,researchJson,type RyoResearchCapture} from '../research/ryo-research.js';
import {verifyNormalization,validateTimeline} from '../research/evidence.js';
import {hasInterpretationInput,researchRequest} from '../research/request.js';
import {signal,validateInterpretation} from '../research/signals.js';
import {advancePortfolio,initialPortfolio} from '../practice/ledger.js';
import {validatePolicy} from '../research/policy.js';
import {digest} from '../research/encoding.js';
import {policy,evidence,interpretation,registrationId,commitment} from './research-fixtures.js';
const at='2026-10-30T18:34:22.000Z';
const authentic=JSON.parse(readFileSync(new URL('../docs/testing/ryo-recovery-check-2026-10-30T18-33-56-989Z/responses.json',import.meta.url),'utf8'));
const record=authentic.records.find((r:any)=>r.request?.method==='tools/list'),catalog=decodeMcpResponse(record.body,record.contentType,record.request.id).tools;
function captured(tool:'analyze_token'|'monitor_market_sentiment_shift'):RyoResearchCapture{const c=authentic.checks.find((v:any)=>v.tool===tool);return {kind:'ryo-research',tool,arguments:c.arguments,catalog,exchanges:c.exchanges,receivedAt:c.exchanges.at(-1).receivedAt};}
function p(){const p=policy();p.strategies=['market-news'];p.voices=[];p.ryoResearch={version:1,required:true,maxPriceDeviationBps:500,blockAvoidVerdict:true};return p;}
function e(){const e=evidence(at);e.posts=[];e.markets=[];e.raw=[captured('analyze_token'),captured('monitor_market_sentiment_shift')];e.research=e.raw.flatMap(c=>normalizeCapture(c as RyoResearchCapture).research??[]);e.sources=[{source:'ryo-research',available:true,retrievedAt:at}];return e;}
// Replay of saved authentic provider responses, not a new live observation or model run.
test('authentic recovered RYO responses normalize with exact decimals, null coverage and separate research identity',()=>{
 const rows=e().research!;assert.equal(rows.length,2);const a=rows[0];assert.equal(a.data.market.price_usd,'2225.893527293818');assert.equal(a.data.technical_analysis.rsi_14,null);assert.equal(a.data.asset.chain,null);assert.equal(a.data.asset.contract,null);assert.equal(a.data.liquidity,undefined);assert.equal(a.status,'partial');assert.equal(rows[1].data.evidence.fear_greed.value,'35');assert.equal(normalizeCapture(captured('analyze_token')).markets.length,0);
 verifyNormalization(e(),p());validateTimeline(e(),at);const changed=e();changed.research![0].data.market.price_usd='999';assert.throws(()=>verifyNormalization(changed,p()),/Normalized/);
 assert.throws(()=>verifyNormalization(e(),policy()),/outside the signed policy/);
 assert.equal(priceMicro('2225.893527293818'),2225893527n);assert.equal(priceMicro('2.225893527e3'),2225893527n);assert.throws(()=>priceMicro(null));assert.throws(()=>priceMicro('-1'));
 assert.equal(researchJson('{"n":0.12345678901234567890123456789}').n,'0.12345678901234567890123456789');
});
test('provider errors, mismatched requests, unsupported modes and future dates cannot claim research coverage',()=>{
 for(const update of [(v:any)=>v.data_mode='simulated',(v:any)=>v.as_of='2026-10-31T00:00:00Z',(v:any)=>v.data.asset.symbol='BTC',(v:any)=>v.availability.market_data='unavailable']){
  const c=captured('analyze_token');c.exchanges=structuredClone(c.exchanges);const envelope=JSON.parse(c.exchanges[0].body),value=JSON.parse(envelope.result.content[0].text);update(value);envelope.result.content[0].text=JSON.stringify(value);c.exchanges[0].body=JSON.stringify(envelope);assert.throws(()=>normalizeRyoResearch(c));assert.equal(normalizeCapture(c).research!.length,0);
 }
 const fail=captured('analyze_token');fail.exchanges=structuredClone(fail.exchanges);const envelope=JSON.parse(fail.exchanges[0].body);envelope.result.isError=true;fail.exchanges[0].body=JSON.stringify(envelope);assert.equal(normalizeCapture(fail).research!.length,0);
 const changed=e();changed.raw=[fail,captured('monitor_market_sentiment_shift')];changed.research=changed.raw.flatMap(c=>normalizeCapture(c as RyoResearchCapture).research??[]);assert.throws(()=>verifyNormalization(changed,p()),/coverage claim/);
 const c=captured('monitor_market_sentiment_shift');c.exchanges=structuredClone(c.exchanges);const env=JSON.parse(c.exchanges[0].body),value=JSON.parse(env.result.content[0].text);value.data.evidence.fear_greed.data_date='2026-11-01';env.result.content[0].text=JSON.stringify(value);c.exchanges[0].body=JSON.stringify(env);assert.throws(()=>normalizeRyoResearch(c),/component date/);
});
test('fresh RYO research can reach the model for HOLD when news is unavailable, with bounded explicit projection and real citations',()=>{
 const v=e(),rules=p();assert.equal(hasInterpretationInput(v,rules,'market-news'),true);const req=researchRequest('test-model',rules,'market-news',v),input=JSON.parse(req.messages[1].content);assert.equal(input.research.length,2);assert.equal(input.research[0].data.market.price_usd,'2225.893527293818');assert.equal(input.posts.length,0);assert.match(input.coverage.researchProjection,/Full original/);
 const x={action:'HOLD' as const,symbol:'ETH',factors:[{evidenceId:v.research![0].id,stance:'oppose' as const,explanation:'RYO provider reports avoid, news coverage is missing.'}],classifications:[]};assert.deepEqual(validateInterpretation(x,v,rules.symbols),x);
 x.factors[0].evidenceId='fabricated';assert.throws(()=>validateInterpretation(x,v,rules.symbols),/unsupported citation/);
 assert.equal(hasInterpretationInput({...v,capturedAt:'2026-10-30T21:00:00Z'},rules,'market-news'),false);
 const muse=researchRequest('muse-glimmer-30b',rules,'market-news',v);assert.equal(muse.max_tokens,1024);assert.equal(muse.chat_template_kwargs.reasoning_strength,'low');assert.equal(muse.reasoning_effort,'none');assert.match(muse.messages[0].content,/integer micro-USD/);
});
test('required RYO coverage, provider avoid verdict, citations and cross-source prices constrain entry without inventing liquidity',()=>{
 const v=evidence(at),rules=p();v.research=e().research;v.sources.push({source:'ryo-research',available:true,retrievedAt:at});v.markets[0].price='2225893527';const x=interpretation();x.factors.push(...v.research!.map(r=>({evidenceId:r.id,stance:'support' as const,explanation:'Controlled test proposal cites provider context.'})));
 assert(signal(rules,'market-news',v,x,Date.parse(at)).reasons.some(r=>r.includes('avoid verdict')));
 // Deliberately modified controlled data here tests gates, not authentic provider truth.
 v.research![0].data.verdict='watch';assert.equal(signal(rules,'market-news',v,x,Date.parse(at)).pass,true);
 const changed=structuredClone(v);changed.research![0].data.market.price_usd='100';assert(signal(rules,'market-news',changed,x,Date.parse(at)).reasons.some(r=>r.includes('tolerance')));
 const noCitation=structuredClone(x);noCitation.factors=noCitation.factors.filter(f=>f.evidenceId!==v.research![1].id);assert.equal(signal(rules,'market-news',v,noCitation,Date.parse(at)).pass,false);
 assert.equal(signal(rules,'market-news',v,x,Date.parse(at),v.research![0].id).pass,false);
 v.sources.find(s=>s.source==='ryo-research')!.available=false;assert.equal(signal(rules,'market-news',v,x,Date.parse(at)).pass,false);
});
test('pending BUY rechecks required RYO coverage at fill, and signed rules reject unsupported configuration',()=>{
 const rules=p();validatePolicy(rules,registrationId,commitment);const bad=p();bad.ryoResearch!.maxPriceDeviationBps=1001;assert.throws(()=>validatePolicy(bad,registrationId,commitment),/RYO research rules/);
 const nullRules={...rules,ryoResearch:null};assert.throws(()=>validatePolicy(nullRules,registrationId,commitment),/RYO research rules/);
 const v=initialPortfolio(rules);v.pending.push({id:'controlled',side:'BUY',symbol:'ETH',marketId:rules.marketRules.instruments[0].id,createdAt:'2026-10-30T18:34:00Z',eligibleAt:'2026-10-30T18:34:05Z',expiresAt:'2026-10-30T19:00:00Z',notional:'1000000',reason:'Controlled order only'});
 const result=advancePortfolio(v,rules,evidence(at),at);assert.equal(result.portfolio.positions.length,0);assert(result.events.some(e=>e.kind==='rejected'));
 const withResearch=evidence(at);withResearch.research=e().research;withResearch.research![0].data.verdict='watch';withResearch.markets[0].price='2225893527';withResearch.sources.push({source:'ryo-research',available:true,retrievedAt:at});
 assert.equal(advancePortfolio(v,rules,withResearch,at).portfolio.positions.length,1);
 const legacy=p();delete legacy.ryoResearch;assert.notEqual(digest(rules),digest(legacy));
});
test('required research is collected once per tool, retained with independent books, and replayed from raw responses',async()=>{
 const {researchSources}=await import('../research/providers.js');
 const counts=new Map<string,number>(),endpoint='https://93.184.216.34/api/mcp';
 const source=researchSources({url:endpoint,key:'controlled-test-key',newsFeeds:[]},(async(input,init)=>{
  if(String(input).includes('api.exchange.coinbase.com')){assert.equal((init?.headers as any).Authorization,undefined);return Response.json({bids:[['2225','10',1]],asks:[['2226','10',1]],sequence:1,auction_mode:false,time:new Date(Date.now()-1000).toISOString()});}
  assert.equal(String(input),endpoint);const request=JSON.parse(init!.body as string);counts.set(request.method,(counts.get(request.method)??0)+1);
  if(request.method==='initialize')return Response.json({jsonrpc:'2.0',id:request.id,result:{protocolVersion:'2024-11-05'}});
  if(request.method==='notifications/initialized')return new Response(null,{status:202});
  if(request.method==='tools/list')return Response.json({jsonrpc:'2.0',id:request.id,result:{tools:catalog}});
  const tool=request.params.name;counts.set(tool,(counts.get(tool)??0)+1);const envelope=JSON.parse(captured(tool).exchanges[0].body);envelope.id=request.id;return Response.json(envelope);
 }) as typeof fetch);
 const rules=p();rules.newsFeeds=[];rules.marketRules.source='coinbase-exchange';rules.marketRules.instruments=[{id:'coinbase:ETH-USD',symbol:'ETH',network:'coinbase-exchange'}];
 const [a,b]=await Promise.all([source.collect(rules),source.collect(rules)]);assert.deepEqual(a,b);assert.equal(counts.get('analyze_token'),1);assert.equal(counts.get('monitor_market_sentiment_shift'),1);assert.equal(counts.get('tools/call'),2);assert.equal(a.markets.length,1);assert.equal(a.research!.length,2);assert.equal(a.sources.find(s=>s.source==='ryo-research')!.available,true);assert.equal(a.sources.find(s=>s.source==='ryo')!.available,false);verifyNormalization(a,rules);validateTimeline(a,a.capturedAt);
});
test('a controlled signed HOLD checkpoint replays authentic captured RYO research and rejects altered normalized data',async()=>{
 const {signedPolicy,session,controller,execution}=await import('./research-fixtures.js');
 const {researchEngineDigest}=await import('../research/engine.js');
 const {policyMessage,receiptMessage,checkpointMessage}=await import('../research/policy.js');
 const {decide}=await import('../research/decision.js'),{verifyCheckpoint}=await import('../research/checkpoint.js');
 const rules=p();rules.engineDigest=await researchEngineDigest();const signed=await signedPolicy(rules);signed.createdAt='2026-10-30T18:34:00.000Z';signed.expiresAt=Date.parse('2026-10-30T18:44:00Z');signed.controllerSignature=await controller.signMessage({message:policyMessage(signed,'controller')});signed.executionSignature=await execution.signMessage({message:policyMessage(signed,'execution')});
 const s=session(rules);s.id=digest([signed.id,s.strategy]);s.createdAt=signed.createdAt;const observed=e();
 // Only signatures/model output in this test are controlled fixtures; provider bytes are a saved authentic response.
 const x={action:'HOLD' as const,symbol:'ETH',factors:observed.research!.map(r=>({evidenceId:r.id,stance:'oppose' as const,explanation:'Controlled HOLD cites authentic provider risk and sentiment.'})),classifications:[]},rawContent=JSON.stringify(x),trace={request:researchRequest('test-model',rules,s.strategy,observed),response:{model:'test-model',choices:[{finish_reason:'stop',message:{content:rawContent}}]},rawContent,interpretation:x,model:'test-model',startedAt:at,finishedAt:'2026-10-30T18:34:23.000Z'};
 const recordedTrace={...trace,response:{...trace.response,timings:{prompt_ms:43.17051,predicted_per_second:7.2332}},rawResponse:''};recordedTrace.rawResponse=JSON.stringify(recordedTrace.response);
 const advanced=advancePortfolio(s.portfolio,rules,observed,trace.finishedAt);s.portfolio=advanced.portfolio;const body=decide(s,signed,observed,recordedTrace,trace.finishedAt),hash=digest(body),receipt={body,hash,signature:await execution.signMessage({message:receiptMessage(hash)})};s.sequence++;s.cycles++;s.head=hash;s.observedAt=body.at;
 const value={version:'PUMPCOIN-PRACTICE-CHECKPOINT-v1' as const,session:s,policy:signed,receipts:[receipt],evidence:[{hash:digest(observed),value:observed}],events:advanced.events};
 const checkpoint={...value,hash:digest(value),signature:await execution.signMessage({message:checkpointMessage(digest(value))})},record={id:registrationId,commitment,manifest:{controller:controller.address,executionKey:execution.address,model:{id:'test-model'}}} as any;
 await verifyCheckpoint(checkpoint,record);
 const {replay}=await import('../research/decision.js');recordedTrace.rawResponse=JSON.stringify({...recordedTrace.response,timings:{prompt_ms:999}});receipt.hash=digest(receipt.body);receipt.signature=await execution.signMessage({message:receiptMessage(receipt.hash)});await assert.rejects(replay(signed,s,[{receipt,evidence:observed}]),/Raw inference response/);
 checkpoint.evidence[0].value.research![0].data.market.price_usd='999';await assert.rejects(verifyCheckpoint(checkpoint,record));
 assert.throws(()=>digest(NaN));assert.throws(()=>digest(Infinity));assert.throws(()=>digest(Number.MAX_SAFE_INTEGER+1));
});
test('coverage reports count separately required RYO research without claiming an executable RYO market',async()=>{
 const {evaluate}=await import('../research/evaluation.js'),{signedPolicy,session}=await import('./research-fixtures.js');
 const rules=p();rules.marketRules.source='coinbase-exchange';const signed=await signedPolicy(rules),s=session(rules),observed=e();
 const row={receipt:{body:{at,outcome:'hold',trace:null}} as any,evidence:observed};const report=evaluate(signed,[s],()=>[row]);assert.equal(report.lanes[0].ryoAvailable,1);assert.equal(report.commonWindow,null);assert.match(report.conclusion,/inconclusive/);
 observed.sources[0].available=false;assert.equal(evaluate(signed,[s],()=>[row]).lanes[0].ryoAvailable,0);
});
