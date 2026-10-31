import test from 'node:test';
import assert from 'node:assert/strict';
import { researchService } from '../research/service.js';
import { ResearchStore } from '../research/store.js';
import { researchSources } from '../research/providers.js';
import { researchEngineDigest } from '../research/engine.js';
import { policyMessage } from '../research/policy.js';
import { verifyCheckpoint,selectCheckpoint } from '../research/checkpoint.js';
import { policy,registrationId,commitment,controller,execution } from './research-fixtures.js';
import type { RegistrationRecord } from '../agent-registration/types.js';
import type { Prepared } from '../agent-registration/core.js';
import { hasInterpretationInput,researchRequest } from '../research/request.js';
import { validateInterpretation,signal } from '../research/signals.js';
import { normalizeCapture,type Capture } from '../research/normalization.js';
import type { Evidence,Policy } from '../research/types.js';
test('news-only signed configuration creates one session; unavailable sources produce replayable blocked records without calling a model',async()=>{
  const db=new ResearchStore(':memory:');let modelCalls=0;
  const record={id:registrationId,commitment,manifest:{name:'Test-only',controller:controller.address,executionKey:execution.address,model:{id:'test-model'}}} as unknown as RegistrationRecord;
  const service=researchService({store:db,resolve:async id=>{if(id!==registrationId)throw new Error('Unknown agent');return {record,prepared:{} as Prepared};},signerConfigured:true,sign:async(_r,message)=>execution.signMessage({message}),sources:async()=>researchSources({newsFeeds:[]}),infer:async()=>{modelCalls++;throw new Error('Must not run');}});
  try{
    await assert.rejects(service.challenge(registrationId,{...policy(),engineDigest:await researchEngineDigest()},'http://localhost:5173'),/X and Multi-KOL collection have been removed/);
    const p:Policy={...policy(),strategies:['market-news'],voices:[],engineDigest:await researchEngineDigest()},origin='http://localhost:5173',c=await service.challenge(registrationId,p,origin),sig=await controller.signMessage({message:policyMessage(c,'controller')});
    await assert.rejects(service.authorize(registrationId,c.id,sig,'http://evil.example'),/origin/);
    await service.authorize(registrationId,c.id,sig,origin);await assert.rejects(service.authorize(registrationId,c.id,sig,origin),/consumed/);
    const sessions=(await service.view(registrationId)).sessions;assert.equal(sessions.length,1);assert.equal(sessions[0].strategy,'market-news');
    await service.run(registrationId,sessions[0].id);const view=await service.view(registrationId),active=view.sessions.find(s=>s.id===sessions[0].id)!;
    assert.equal(modelCalls,0);assert.equal(active.sequence,1);assert.equal(active.state,'blocked');assert.equal(active.portfolio.positions.length,0);assert.equal(view.comparison,undefined);
    const checkpoint=await service.bundle(registrationId,active.id);await verifyCheckpoint(checkpoint,record);assert.equal(checkpoint.receipts[0].body.outcome,'blocked');
    const changed=structuredClone(checkpoint);changed.session.portfolio.cash='1';await assert.rejects(verifyCheckpoint(changed,record),/digest/);
    await service.run(registrationId,active.id);const later=await service.bundle(registrationId,active.id);assert.equal(selectCheckpoint([checkpoint,later])!.session.sequence,2);
    const fork=structuredClone(later);fork.receipts[0].hash=commitment;assert.throws(()=>selectCheckpoint([later,fork]),/Conflicting/);
    const originalPolicy=db.policy(active.policyHash),wrongIdentity=structuredClone(originalPolicy);wrongIdentity.executionKey=controller.address;
    db.db.prepare('UPDATE policies SET data=? WHERE hash=?').run(JSON.stringify(wrongIdentity),active.policyHash);
    await assert.rejects(service.view(registrationId),/registered identity/);
    db.db.prepare('UPDATE policies SET data=? WHERE hash=?').run(JSON.stringify(originalPolicy),active.policyHash);
    const stored=db.session(active.id),changedLedger=structuredClone(stored);changedLedger.portfolio.cash='1';
    db.db.prepare('UPDATE sessions SET data=? WHERE id=?').run(JSON.stringify(changedLedger),active.id);
    await assert.rejects(service.view(registrationId),/portfolio\/events/);
    db.db.prepare('UPDATE sessions SET data=? WHERE id=?').run(JSON.stringify(stored),active.id);
    assert.equal((await service.view(registrationId)).sessions.find(s=>s.id===active.id)!.sequence,2);
    db.db.prepare('DELETE FROM events WHERE session=?').run(active.id);
    await assert.rejects(service.bundle(registrationId,active.id),/portfolio\/events/);
  }finally{await service.close();db.close();}
});
test('fresh source publications can produce a replayable HOLD without prices; classification does not make an instrument tradable',async()=>{
  // Controlled failure fixture; no live provider or local-model execution is claimed.
  const db=new ResearchStore(':memory:');let modelCalls=0;
  const record={id:registrationId,commitment,manifest:{name:'Test-only',controller:controller.address,executionKey:execution.address,model:{id:'test-model'}}} as unknown as RegistrationRecord;
  const at=new Date(Date.now()-1000).toISOString(),p:Policy={...policy(),strategies:['market-news'],voices:[],engineDigest:await researchEngineDigest()};
  const raw:Capture={kind:'news',feed:p.newsFeeds[0],receivedAt:at,contentType:'application/feed+json',body:JSON.stringify({items:[{id:'controlled-news',url:'https://example.com/story',title:'ETH test headline',date_published:at}]})};
  const e:Evidence={version:'PUMPCOIN-RESEARCH-EVIDENCE-v1',mode:'live-observed',capturedAt:at,markets:[],posts:normalizeCapture(raw).posts,raw:[raw],sources:[{source:'news',available:true,retrievedAt:at},{source:'ryo',available:false,reason:'Controlled provider failure',retrievedAt:at}]};
  const source=researchSources({newsFeeds:[]});source.collect=async()=>structuredClone(e);
  const service=researchService({store:db,resolve:async()=>({record,prepared:{} as Prepared}),signerConfigured:true,sign:async(_r,message)=>execution.signMessage({message}),sources:async()=>source,infer:async(_prepared,policy,strategy,evidence)=>{
    modelCalls++;const interpretation={action:'HOLD' as const,symbol:'ETH',factors:[{evidenceId:evidence.posts[0].id,stance:'support' as const,explanation:'Observed headline; priced market evidence is unavailable.'}],classifications:[{postId:evidence.posts[0].id,symbol:'ETH',sentiment:'neutral' as const,conviction:'low' as const,urgency:'low' as const}]};
    const rawContent=JSON.stringify(interpretation),startedAt=new Date().toISOString();
    return {request:researchRequest('test-model',policy,strategy,evidence),response:{model:'test-model',choices:[{finish_reason:'stop',message:{content:rawContent}}]},rawContent,interpretation,model:'test-model',startedAt,finishedAt:startedAt};
  }});
  try{
    assert.equal(hasInterpretationInput(e,p,'market-news'),true);assert.equal(hasInterpretationInput(e,p,'multi-kol'),false);
    const stale=structuredClone(e);stale.posts[0].publishedAt=new Date(Date.parse(at)-p.maxAgeSeconds*1000-1).toISOString();assert.equal(hasInterpretationInput(stale,p,'market-news'),false);
    const origin='http://localhost:5173',c=await service.challenge(registrationId,p,origin);
    await service.authorize(registrationId,c.id,await controller.signMessage({message:policyMessage(c,'controller')}),origin);
    const session=(await service.view(registrationId)).sessions.find(s=>s.strategy==='market-news')!;
    await service.run(registrationId,session.id);
    const checkpoint=await service.bundle(registrationId,session.id);await verifyCheckpoint(checkpoint,record);
    assert.equal(modelCalls,1);assert.equal(checkpoint.receipts[0].body.outcome,'hold');assert.equal(checkpoint.receipts[0].body.order,null);
    assert.equal(checkpoint.session.portfolio.cash,p.initialCash);assert.equal(checkpoint.session.portfolio.positions.length,0);assert.equal(checkpoint.session.portfolio.pending.length,0);
    const x=checkpoint.receipts[0].body.trace!.interpretation;
    assert.equal(validateInterpretation(x,e,p.symbols).classifications[0].symbol,'ETH');
    assert.equal(signal(p,'market-news',e,{...x,action:'BUY'},Date.parse(at)).pass,false);
    const unsupported=structuredClone(x);unsupported.classifications[0].symbol='INVENTED';assert.throws(()=>validateInterpretation(unsupported,e,p.symbols),/classification/);
    const changed=structuredClone(checkpoint);changed.receipts[0].body.trace!.interpretation.factors[0].evidenceId='invented';await assert.rejects(verifyCheckpoint(changed,record));
  }finally{await service.close();db.close();}
});
