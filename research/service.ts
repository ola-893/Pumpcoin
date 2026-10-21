import { randomBytes } from 'node:crypto';
import { recoverMessageAddress, type Hex } from 'viem';
import type { Prepared } from '../agent-registration/core.js';
import type { RegistrationRecord } from '../agent-registration/types.js';
import { initialPortfolio, advancePortfolio } from '../practice/ledger.js';
import { digest } from './encoding.js';
import { decide, replay } from './decision.js';
import { policyMessage, validatePolicy, verifyPolicy, receiptMessage, checkpointMessage } from './policy.js';
import { researchSources, sourceConfig } from './providers.js';
import { researchInference } from './inference.js';
import { ResearchStore } from './store.js';
import { researchEngineDigest } from './engine.js';
import { evaluate } from './evaluation.js';
import { validateTimeline,verifyNormalization } from './evidence.js';
import type { Checkpoint, Evidence, PolicyChallenge, Receipt, ResearchView, SignedPolicy, Trace } from './types.js';

export type ResearchOptions={store:ResearchStore;resolve:(id:string)=>Promise<{record:RegistrationRecord;prepared:Prepared}>;
  sign:(record:RegistrationRecord,message:string)=>Promise<Hex>;signerConfigured:boolean;
  sources?:()=>Promise<ReturnType<typeof researchSources>>;infer?:typeof researchInference};
export function researchService(options:ResearchOptions){
  const store=options.store,running=new Map<string,Promise<void>>(),loops=new Map<string,AbortController>(),loopTasks=new Map<string,Promise<void>>();
  let sourceClient:Promise<ReturnType<typeof researchSources>>|undefined;
  const verified = new Set<string>();
  async function checked(s:import('./types.js').Session,record?:RegistrationRecord){
    const p=store.policy(s.policyHash),rows=store.rows(s.id),events=store.events(s.id);
    const binding=record??(await context(s.registrationId)).record;
    if(p.policy.registrationId!==binding.id||p.policy.manifestCommitment!==binding.commitment||p.controller.toLowerCase()!==binding.manifest.controller.toLowerCase()||p.executionKey.toLowerCase()!==binding.manifest.executionKey.toLowerCase())throw new Error('Stored research authorization differs from the registered identity.');
    if(p.policy.engineDigest!==await researchEngineDigest())throw new Error('Stored practice history requires its matching research engine.');
    if(s.registrationId!==p.policy.registrationId||s.policyHash!==p.hash||s.id!==digest([p.id,s.strategy])||s.createdAt!==p.createdAt||!p.policy.strategies.includes(s.strategy)||s.mode!=='live-observed')throw new Error('Stored practice session differs from its signed authorization.');
    const fingerprint=digest({p,rows,events,portfolio:s.portfolio,head:s.head,sequence:s.sequence,cycles:s.cycles,errors:s.errors,observedAt:s.observedAt});
    if(!verified.has(fingerprint)){
      if(store.verifyCounts(s.id)!==rows.length||s.sequence!==rows.length||s.cycles!==rows.length||s.errors!==rows.filter(x=>x.receipt.body.outcome==='error').length||s.observedAt!==(rows.at(-1)?.receipt.body.at??null))throw new Error('Stored practice coverage differs from its history.');
      for(const row of rows)verifyNormalization(row.evidence,p.policy);
      const result=await replay(p,s,rows);
      if(result.head!==s.head||digest(result.portfolio)!==digest(s.portfolio)||digest(result.events)!==digest(events))throw new Error('Stored practice portfolio/events differ from replay.');
      if(verified.size>=64)verified.clear();verified.add(fingerprint);
    }
    return rows;
  }
  const sources=options.sources??(()=>sourceClient??=sourceConfig().then(config=>researchSources(config)));
  async function context(id:string){if(!/^0x[0-9a-f]{64}$/.test(id))throw new Error('Invalid registered agent identifier.');return options.resolve(id);}
  async function challenge(id:string,value:unknown,origin:string){
    const {record}=await context(id),policy=validatePolicy(value,record.id,record.commitment);
    if(policy.engineDigest!==await researchEngineDigest())throw new Error('Research engine changed; refresh and review the policy again.');
    if(store.policies(id).some(p=>p.hash===digest(policy)))throw new Error('This exact policy already has practice sessions. Select its retained sessions instead of resetting capital.');
    if(store.sessions(id).some(s=>s.portfolio.positions.length||s.portfolio.pending.length))throw new Error('Close existing practice positions/orders before changing the research policy.');
    const c:PolicyChallenge={id:`0x${randomBytes(32).toString('hex')}`,policy,hash:digest(policy),origin,expiresAt:Date.now()+600000,controller:record.manifest.controller,executionKey:record.manifest.executionKey};store.challenge(c);return c;
  }
  async function authorize(id:string,challengeId:string,controllerSignature:Hex,origin:string){
    const {record}=await context(id),c=store.getChallenge(challengeId);
    if(!c||c.policy.registrationId!==id||c.origin!==origin||Date.now()>=c.expiresAt)throw new Error('Research authorization expired, consumed or belongs to another agent/origin.');
    if((await recoverMessageAddress({message:policyMessage(c,'controller'),signature:controllerSignature})).toLowerCase()!==c.controller.toLowerCase())throw new Error('Controller must authorize this exact research policy.');
    const executionSignature=await options.sign(record,policyMessage(c,'execution'));
    const signed:SignedPolicy={...c,controllerSignature,executionSignature,createdAt:new Date().toISOString()};await verifyPolicy(signed);
    if(store.sessions(id).some(s=>s.portfolio.positions.length||s.portfolio.pending.length))throw new Error('Existing practice positions/orders must close before policy activation.');
    const sessions=c.policy.strategies.map(strategy=>({id:digest([c.id,strategy]),registrationId:record.id,policyHash:c.hash,strategy,mode:'live-observed' as const,createdAt:signed.createdAt,portfolio:initialPortfolio(c.policy),sequence:0,head:null,cycles:0,errors:0,state:'stopped' as const,message:'Practice session created. Source and local-model checks run before decisions.',observedAt:null}));
    store.savePolicy(signed,sessions);return signed;
  }
  async function view(id:string):Promise<ResearchView>{
    const {record}=await context(id);let capabilities={ryo:false,ryoMapping:false,x:false,news:false};const errors:string[]=[];
    try{capabilities=(await sources()).capabilities;}catch{errors.push('Research source configuration could not be read.');}
    const sessions=store.sessions(id).map(s=>s.state==='running'&&!store.leased(s.id)&&!store.runtimeOwner(s.id)?{...s,state:'error' as const,message:'No active local worker lease remains. Stored decisions and positions are retained.'}:s),histories=new Map<string,Awaited<ReturnType<typeof checked>>>();
    for(const s of sessions)histories.set(s.id,await checked(s,record));
    const latest=sessions.slice(0,20).flatMap(s=>{const row=histories.get(s.id)!.at(-1);return row?[{sessionId:s.id,...row}]:[];});
    const policies=store.policies(id),paired=policies.find(p=>p.policy.strategies.length===2);
    return {registrationId:id as Hex,hosted:false,engineDigest:await researchEngineDigest(),capabilities:{...capabilities,signer:options.signerConfigured},policies,sessions,latest,errors,...(paired?{comparison:evaluate(paired,sessions,s=>histories.get(s)!)}:{})};
  }
  function belongs(id:string,sessionId:string){const s=store.session(sessionId);if(s.registrationId!==id)throw new Error('Practice session belongs to another agent.');return s;}
  async function cycle(id:string,sessionId:string){
    const {record,prepared}=await context(id);let s=belongs(id,sessionId);await checked(s,record);const signed=store.policy(s.policyHash);await verifyPolicy(signed);
    if(signed.policy.engineDigest!==await researchEngineDigest())throw new Error('Research engine differs from the signed policy.');
    if(signed.policy.registrationId!==record.id||signed.policy.manifestCommitment!==record.commitment||signed.executionKey!==record.manifest.executionKey||signed.controller!==record.manifest.controller)throw new Error('Research policy no longer matches its registration.');
    if(s.mode!=='live-observed')throw new Error('Live worker cannot execute a replay or synthetic session.');
    const owner=randomBytes(16).toString('hex');store.acquire(s.id,owner,Date.now());const heartbeat=setInterval(()=>{try{store.heartbeat(s.id,owner);}catch{}},60000);
    try{
      store.status(s.id,'running','Collecting RYO market evidence and configured sources.');
      let evidence:Evidence,trace:Trace|null=null,error:string|undefined;
      try{evidence=await (await sources()).collect(signed.policy);}catch{evidence={version:'PUMPCOIN-RESEARCH-EVIDENCE-v1',mode:'live-observed',capturedAt:new Date().toISOString(),markets:[],posts:[],sources:[{source:'ryo',available:false,reason:'Source configuration or collection failed.',retrievedAt:new Date().toISOString()}],raw:[]};}
      validateTimeline(evidence,new Date().toISOString());verifyNormalization(evidence,signed.policy);
      if(evidence.sources.some(x=>x.source==='ryo'&&x.available)&&evidence.sources.some(x=>x.source===(s.strategy==='multi-kol'?'x':'news')&&x.available)){
        store.status(s.id,'running','Checking the registered local model and interpreting sourced evidence.');
        try{trace=await (options.infer??researchInference)(prepared,signed.policy,s.strategy,evidence);}catch{error='Local inference or model-artifact verification failed; no proposal was accepted.';}
      }
      const at=new Date().toISOString();validateTimeline(evidence,at,trace);
      const advanced=advancePortfolio(s.portfolio,signed.policy,evidence,at);s={...s,portfolio:advanced.portfolio};
      const body=decide(s,signed,evidence,trace,at,error),hash=digest(body),signature=await options.sign(record,receiptMessage(hash));
      const receipt:Receipt={body,hash,signature};
      if(body.order)s.portfolio.pending.push(body.order);
      s={...s,sequence:body.sequence,head:hash,cycles:s.cycles+1,errors:s.errors+(error?1:0),state:body.outcome==='error'?'error':body.outcome==='blocked'?'blocked':loops.has(s.id)?'running':'stopped',message:body.order?'Practice order queued; a later eligible observed quote is required for a fill.':body.reasons.join(' '),observedAt:at};
      store.commit(s,receipt,evidence,advanced.events,owner);
    }finally{clearInterval(heartbeat);store.release(s.id,owner);}
  }
  async function run(id:string,sessionId:string,runtimeOwner?:string){
    await context(id);belongs(id,sessionId);if(running.has(sessionId))return;
    const activeOwner=store.runtimeOwner(sessionId);if(activeOwner&&activeOwner!==runtimeOwner)throw new Error('Stop the supervised practice runtime before running an extra observation.');
    const task=cycle(id,sessionId).catch(()=>{store.status(sessionId,'error','Practice cycle stopped after a source, signer, storage or concurrency failure. No funded transaction was sent.');}).finally(()=>{running.delete(sessionId);});running.set(sessionId,task);return task;
  }
  async function start(id:string,sessionId:string){await context(id);belongs(id,sessionId);if(loops.has(sessionId))return;const owner=randomBytes(16).toString('hex');store.acquireRuntime(sessionId,owner);const controller=new AbortController();loops.set(sessionId,controller);let schedulerFailed=false;
    store.requestStop(sessionId,false);
    const heartbeat=setInterval(()=>{try{store.heartbeatRuntime(sessionId,owner);}catch{controller.abort();}},60000);
    const task=(async()=>{while(!controller.signal.aborted&&!store.stopped(sessionId)){await run(id,sessionId,owner);if(controller.signal.aborted||store.stopped(sessionId))break;const delay=store.policy(store.session(sessionId).policyHash).policy.intervalSeconds*1000;await new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);clearInterval(poll);controller.signal.removeEventListener('abort',finish);resolve();};const timer=setTimeout(finish,delay),poll=setInterval(()=>{if(store.stopped(sessionId))finish();},1000);controller.signal.addEventListener('abort',finish,{once:true});});}})().catch(()=>{schedulerFailed=true;store.status(sessionId,'error','Practice scheduler stopped after a storage or ownership failure.');}).finally(()=>{clearInterval(heartbeat);loops.delete(sessionId);loopTasks.delete(sessionId);store.releaseRuntime(sessionId,owner);if(!schedulerFailed)store.status(sessionId,'stopped','Practice runtime stopped. Stored decisions and positions are retained.');});loopTasks.set(sessionId,task);
  }
  async function stop(id:string,sessionId:string){await context(id);belongs(id,sessionId);store.requestStop(sessionId,true);loops.get(sessionId)?.abort();await running.get(sessionId);store.status(sessionId,store.leased(sessionId)?'stopping':'stopped',store.leased(sessionId)?'Stop requested. Another local worker may finish its current observation.':'Practice runtime stopped; retained positions will be reviewed when resumed.');}
  async function bundle(id:string,sessionId:string):Promise<Checkpoint>{
    const {record}=await context(id),s=belongs(id,sessionId),policy=store.policy(s.policyHash),rows=await checked(s,record);
    const value={version:'PUMPCOIN-PRACTICE-CHECKPOINT-v1' as const,session:s,policy,receipts:rows.map(x=>x.receipt),evidence:rows.map(x=>({hash:digest(x.evidence),value:x.evidence})),events:store.events(s.id)};
    const hash=digest(value),signature=await options.sign(record,checkpointMessage(hash));return {...value,hash,signature};
  }
  const sourceChecks=new Map<string,{at:number;value:Promise<Evidence>}>();
  return {challenge,authorize,view,start,stop,run,async sourceCheck(id:string,symbol:string){await context(id);if(typeof symbol!=='string'||!/^[A-Z0-9]{2,15}$/.test(symbol))throw new Error('Provide a market symbol.');const old=sourceChecks.get(symbol);if(old&&Date.now()-old.at<30000)return old.value;if(sourceChecks.size>=10)sourceChecks.clear();const value=(await sources()).check(symbol);sourceChecks.set(symbol,{at:Date.now(),value});try{return await value;}catch(error){sourceChecks.delete(symbol);throw error;}},async kickoff(id:string,sessionId:string){await context(id);belongs(id,sessionId);if(store.runtimeOwner(sessionId))throw new Error('Stop the supervised practice runtime before an extra observation.');store.requestStop(sessionId,false);void run(id,sessionId).catch(()=>{store.status(sessionId,'error','Practice observation could not start.');});},bundle,
    async history(id:string,sessionId:string){await context(id);const s=belongs(id,sessionId);return {rows:await checked(s),events:store.events(sessionId)};},
    async close(){for(const c of loops.values())c.abort();await Promise.all([...loopTasks.values(),...running.values()]);},store};
}
