import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResearchStore } from '../research/store.js';
import { signedPolicy,session,registrationId } from './research-fixtures.js';
test('SQLite policies/sessions survive restart; nonce consumption and writer leases prevent competing updates',async()=>{const dir=await mkdtemp(join(tmpdir(),'pump-research-'));const path=join(dir,'practice.sqlite');let db=new ResearchStore(path);try{const p=await signedPolicy(),s=session(p.policy);db.challenge(p);db.savePolicy(p,[s]);assert.throws(()=>db.savePolicy(p,[s]),/consumed/);db.acquire(s.id,'writer-A',Date.now());assert.throws(()=>db.acquire(s.id,'writer-B',Date.now()),/already running/);db.close();db=new ResearchStore(path);assert.equal(db.sessions(registrationId).length,1);assert.equal(db.policy(p.hash).executionSignature,p.executionSignature);assert.throws(()=>db.acquire(s.id,'writer-B',Date.now()),/already running/);db.release(s.id,'writer-A');db.acquire(s.id,'writer-B',Date.now());}finally{db.close();await rm(dir,{recursive:true,force:true});}});
test('supervised runtime ownership and durable stop requests remain separate from cycle writer leases',async()=>{const db=new ResearchStore(':memory:');try{const p=await signedPolicy(),s=session(p.policy);db.challenge(p);db.savePolicy(p,[s]);db.acquireRuntime(s.id,'cli');assert.throws(()=>db.acquireRuntime(s.id,'browser'),/already owns/);db.acquire(s.id,'cycle',Date.now());db.release(s.id,'cycle');assert.equal(db.runtimeOwner(s.id),'cli');db.requestStop(s.id,true);assert.equal(db.stopped(s.id),true);db.releaseRuntime(s.id,'cli');db.acquireRuntime(s.id,'browser');assert.equal(db.runtimeOwner(s.id),'browser');}finally{db.close();}});

test('a failed event insert rolls back the receipt, evidence, events and portfolio together; restart cannot double-fill',async()=>{
  const {advancePortfolio}=await import('../practice/ledger.js'),{decide}=await import('../research/decision.js'),{digest}=await import('../research/encoding.js'),{receiptMessage}=await import('../research/policy.js'),{execution,evidence}=await import('./research-fixtures.js');
  const db=new ResearchStore(':memory:');
  try{const p=await signedPolicy(),s=session(p.policy),e=evidence('2026-10-16T00:00:00.000Z');db.challenge(p);db.savePolicy(p,[s]);db.acquire(s.id,'writer',Date.now());
    const advanced=advancePortfolio(s.portfolio,p.policy,e,e.capturedAt);s.portfolio=advanced.portfolio;const body=decide(s,p,e,null,e.capturedAt),hash=digest(body),receipt={body,hash,signature:await execution.signMessage({message:receiptMessage(hash)})};
    s.head=hash;s.sequence=1;s.cycles=1;s.observedAt=body.at;
    assert.throws(()=>db.commit(s,receipt,e,[advanced.events[0],advanced.events[0]],'writer'),/UNIQUE/);
    assert.equal(db.rows(s.id).length,0);assert.equal(db.events(s.id).length,0);assert.equal(db.session(s.id).sequence,0);
    assert.equal((db.db.prepare('SELECT COUNT(*) AS n FROM evidence').get() as any).n,0);
    db.commit(s,receipt,e,advanced.events,'writer');assert.equal(db.rows(s.id).length,1);
    assert.throws(()=>db.commit(s,receipt,e,advanced.events,'writer'),/inconsistent/);assert.equal(db.events(s.id).length,1);
  }finally{db.close();}
});
