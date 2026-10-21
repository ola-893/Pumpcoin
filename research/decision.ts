import { recoverMessageAddress, type Hex } from 'viem';
import { digest, time } from './encoding.js';
import { receiptMessage, verifyPolicy } from './policy.js';
import { signal, sensitivity, validateInterpretation } from './signals.js';
import { advancePortfolio, initialPortfolio, sizeEntry } from '../practice/ledger.js';
import { interpretationEvidence,researchRequest } from './request.js';
import { validateTimeline } from './evidence.js';
import type { DecisionBody, Evidence, Order, Receipt, Session, SignedPolicy, Trace } from './types.js';

export function decide(session: Session, signed: SignedPolicy,e: Evidence,trace: Trace|null,at:string,error?:string): DecisionBody {
  validateTimeline(e,at,trace);
  const p=signed.policy, reasons:string[]=[], x=trace?.interpretation; let order:Order|null=null;
  let outcome:DecisionBody['outcome']='hold';
  const b={version:'PUMPCOIN-PRACTICE-DECISION-v1' as const,sessionId:session.id,registrationId:session.registrationId,policyHash:session.policyHash,strategy:session.strategy,sequence:session.sequence+1,previousHash:session.head,evidenceHash:digest(e),at};
  if(error) {outcome='error';reasons.push(error);}
  else if(!x) {outcome='blocked';reasons.push('Required source evidence is unavailable; model inference was not requested.');}
  else {
    validateInterpretation(x,interpretationEvidence(e,p,session.strategy));
    if(x.action==='HOLD') reasons.push('The local model proposed HOLD.');
    else {
      const result=signal(p,session.strategy,e,x,time(at));
      if(x.action==='SELL') {
        const pos=session.portfolio.positions.find(v=>v.symbol===x.symbol);
        if(!pos) reasons.push('No matching practice position to close.');
        else if(session.portfolio.pending.some(o=>o.marketId===pos.marketId)) reasons.push('An order is already pending.');
        else if(e.mode==='synthetic-test') reasons.push('Synthetic evidence cannot create orders.');
        else order={id:digest([b,'SELL',pos.marketId]),side:'SELL',symbol:pos.symbol,marketId:pos.marketId,notional:'0',createdAt:at,eligibleAt:new Date(time(at)+p.executionDelaySeconds*1000).toISOString(),expiresAt:new Date(time(at)+p.maxAgeSeconds*1000).toISOString(),reason:'Cited local-model exit proposal'};
      } else if(!result.pass) reasons.push(...result.reasons);
      else {const sizing=sizeEntry(session.portfolio,p,result.market!,at);reasons.push(...sizing.reasons);if(!reasons.length) order={id:digest([b,'BUY',result.market!.id]),side:'BUY',symbol:x.symbol,marketId:result.market!.id,notional:sizing.notional,createdAt:at,eligibleAt:new Date(time(at)+p.executionDelaySeconds*1000).toISOString(),expiresAt:new Date(time(at)+p.maxAgeSeconds*1000).toISOString(),reason:'Cited signal passed signed practice risk rules'};}
      outcome=order?'accepted':'blocked';
    }
  }
  return {...b,trace,outcome,reasons,order,sensitivity:x?sensitivity(p,session.strategy,e,x,time(at)):[]};
}
export async function verifyReceipt(r:Receipt,key:string) {if(digest(r.body)!==r.hash||(await recoverMessageAddress({message:receiptMessage(r.hash),signature:r.signature})).toLowerCase()!==key.toLowerCase()) throw new Error('Practice receipt integrity or signer mismatch.');}
export async function replay(signed:SignedPolicy,initial:Session,rows:{receipt:Receipt;evidence:Evidence}[]) {
  await verifyPolicy(signed);let s={...initial,portfolio:initialPortfolio(signed.policy),sequence:0,head:null as Hex|null};const events:import('./types.js').PracticeEvent[]=[];
  for(const {receipt:r,evidence:e} of rows) {
    await verifyReceipt(r,signed.executionKey);
    if(r.body.sequence!==s.sequence+1||r.body.previousHash!==s.head||r.body.sessionId!==s.id||r.body.registrationId!==signed.policy.registrationId||r.body.policyHash!==signed.hash||r.body.strategy!==s.strategy||digest(e)!==r.body.evidenceHash||e.mode!==s.mode) throw new Error('Practice history gap or binding mismatch.');
    const advanced=advancePortfolio(s.portfolio,signed.policy,e,r.body.at);events.push(...advanced.events);s={...s,portfolio:advanced.portfolio};
    if(r.body.trace) {validateInterpretation(r.body.trace.interpretation,interpretationEvidence(e,signed.policy,s.strategy));if(digest(JSON.parse(r.body.trace.rawContent))!==digest(r.body.trace.interpretation)||digest(r.body.trace.request)!==digest(researchRequest(r.body.trace.model,signed.policy,s.strategy,e)))throw new Error('Raw local response or exact inference request differs from the recorded interpretation/evidence.');}
    if(r.body.trace?.response){const t=r.body.trace,response=t.response as any,choice=response?.choices?.[0];if(response.model!==t.model||response.choices?.length!==1||choice?.finish_reason!=='stop'||choice?.message?.tool_calls?.length||choice?.message?.content!==t.rawContent)throw new Error('Recorded inference response envelope is inconsistent.');}
    const expected=decide(s,signed,e,r.body.trace,r.body.at,r.body.outcome==='error'?r.body.reasons[0]:undefined);
    if(digest(expected)!==digest(r.body)) throw new Error('Practice signal, guard or order replay mismatch.');
    if(r.body.order)s.portfolio.pending.push(r.body.order);
    s={...s,sequence:r.body.sequence,head:r.hash};
  }
  return {portfolio:s.portfolio,head:s.head,sequence:s.sequence,events};
}
