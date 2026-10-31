import { recoverMessageAddress } from 'viem';
import type { RegistrationRecord } from '../agent-registration/types.js';
import { digest,time } from './encoding.js';
import { checkpointMessage } from './policy.js';
import { replay } from './decision.js';
import type { Checkpoint } from './types.js';
import { researchEngineDigest } from './engine.js';
import { validateTimeline,verifyNormalization } from './evidence.js';

export async function verifyCheckpoint(c:Checkpoint,r:RegistrationRecord){
  if(!c||c.version!=='PUMPCOIN-PRACTICE-CHECKPOINT-v1'||!Array.isArray(c.receipts)||c.receipts.length>1000||!Array.isArray(c.evidence)||c.evidence.length!==c.receipts.length||!Array.isArray(c.events)||c.events.length>10000)throw new Error('Invalid or oversized practice checkpoint.');
  const {hash,signature,...value}=c;
  if(digest(value)!==hash||(await recoverMessageAddress({message:checkpointMessage(hash),signature})).toLowerCase()!==r.manifest.executionKey.toLowerCase())throw new Error('Practice checkpoint signature or digest mismatch.');
  const p=c.policy,s=c.session;
  if(p.policy.engineDigest!==await researchEngineDigest())throw new Error('The checkpoint requires a different version of the practice engine.');
  if(p.policy.registrationId!==r.id||p.policy.manifestCommitment!==r.commitment||p.controller!==r.manifest.controller||p.executionKey!==r.manifest.executionKey||s.registrationId!==r.id||s.policyHash!==p.hash||!p.policy.strategies.includes(s.strategy)||s.id!==digest([p.id,s.strategy])||s.createdAt!==p.createdAt||s.mode!=='live-observed'||s.cycles!==c.receipts.length||s.errors!==c.receipts.filter(x=>x.body.outcome==='error').length)throw new Error('Published practice checkpoint does not match this agent/session.');
  const rows=c.receipts.map((receipt,index)=>{const e=c.evidence[index];if(e.hash!==digest(e.value)||e.hash!==receipt.body.evidenceHash)throw new Error('Published evidence hash mismatch.');
    if(!['live-observed','historical-replay','synthetic-test'].includes(e.value.mode)||e.value.mode!==s.mode||!Array.isArray(e.value.posts)||e.value.posts.length>1100||!Array.isArray(e.value.markets)||e.value.markets.length>20||!Array.isArray(e.value.sources)||!Array.isArray(e.value.raw)||time(receipt.body.at)<time(p.createdAt))throw new Error('Published evidence coverage is invalid.');
    validateTimeline(e.value,receipt.body.at,receipt.body.trace);verifyNormalization(e.value,p.policy);
    for(const post of e.value.posts){const u=new URL(post.url);if(u.protocol!=='https:'||u.username||u.password||typeof post.text!=='string'||post.text.length>4000)throw new Error('Invalid published source reference.');time(post.publishedAt);}
    if(receipt.body.trace?.model!==undefined&&receipt.body.trace.model!==r.manifest.model.id)throw new Error('Published model differs from registration.');
    const trace=receipt.body.trace;
    if(trace){const response=trace.response as any,choice=response?.choices?.[0];if(response?.model!==trace.model||response?.choices?.length!==1||choice?.finish_reason!=='stop'||choice?.message?.tool_calls?.length||choice?.message?.content!==trace.rawContent)throw new Error('Full local inference response is missing or inconsistent.');}
    return {receipt,evidence:e.value};});
  const result=await replay(p,s,rows);
  if(result.head!==s.head||result.sequence!==s.sequence||digest(result.portfolio)!==digest(s.portfolio)||digest(result.events)!==digest(c.events))throw new Error('Published portfolio/events differ from deterministic replay.');
  return c;
}
export function selectCheckpoint(values:Checkpoint[]):Checkpoint|undefined{
  if(!values.length)return;const sorted=[...values].sort((a,b)=>b.session.sequence-a.session.sequence),latest=sorted[0];
  for(const c of sorted){if(c.session.id!==latest.session.id)throw new Error('Checkpoint namespace contains another session.');for(let i=0;i<c.receipts.length;i++)if(c.receipts[i].hash!==latest.receipts[i]?.hash)throw new Error('Conflicting published practice histories. No canonical result is displayed.');}
  return latest;
}
