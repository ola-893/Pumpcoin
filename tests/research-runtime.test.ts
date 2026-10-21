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
test('signed configuration creates both isolated sessions; unavailable sources produce replayable blocked records without calling a model',async()=>{
  const db=new ResearchStore(':memory:');let modelCalls=0;
  const record={id:registrationId,commitment,manifest:{name:'Test-only',controller:controller.address,executionKey:execution.address,model:{id:'test-model'}}} as unknown as RegistrationRecord;
  const service=researchService({store:db,resolve:async id=>{if(id!==registrationId)throw new Error('Unknown agent');return {record,prepared:{} as Prepared};},signerConfigured:true,sign:async(_r,message)=>execution.signMessage({message}),sources:async()=>researchSources({newsFeeds:[]}),infer:async()=>{modelCalls++;throw new Error('Must not run');}});
  try{
    const p={...policy(),engineDigest:await researchEngineDigest()},origin='http://localhost:5173',c=await service.challenge(registrationId,p,origin),sig=await controller.signMessage({message:policyMessage(c,'controller')});
    await assert.rejects(service.authorize(registrationId,c.id,sig,'http://evil.example'),/origin/);
    await service.authorize(registrationId,c.id,sig,origin);await assert.rejects(service.authorize(registrationId,c.id,sig,origin),/consumed/);
    const sessions=(await service.view(registrationId)).sessions;assert.equal(sessions.length,2);assert.notEqual(sessions[0].id,sessions[1].id);
    await service.run(registrationId,sessions[0].id);const view=await service.view(registrationId),active=view.sessions.find(s=>s.id===sessions[0].id)!;
    assert.equal(modelCalls,0);assert.equal(active.sequence,1);assert.equal(active.state,'blocked');assert.equal(active.portfolio.positions.length,0);assert.equal(view.sessions.find(s=>s.id===sessions[1].id)!.sequence,0);assert.equal(view.comparison?.commonWindow,null);
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
