import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { getAddress, keccak256, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { initialDraft, prepareManifest } from '../app/src/lib/registration.js';
import { authorizationMessage, checkedPrepared, checkAuthorizations, runtimeConfigHash, strategyBindingHash, riskBindingHash, type Challenge } from '../agent-registration/core.js';
import { checkLocalWorker, guardedProposal, inferenceRequest, inferPaper, matchingDetection } from '../agent-registration/worker.js';
import { registrationService } from '../agent-registration/service.js';
import { registrationPlugin, REGISTRATION_API } from '../agent-registration/vite.js';
import { deployment, identityPlan, identityURI, verifyBinding, type Deployment } from '../agent-registration/binding.js';
import type { Detection } from '../local-inference/types.js';
const controller = privateKeyToAccount(('0x'+'11'.repeat(32)) as Hex), execution = privateKeyToAccount(('0x'+'22'.repeat(32)) as Hex);
const prepared = prepareManifest({ ...initialDraft, name: 'Disposable registration test', controller: controller.address, executionKey: execution.address, model: 'test-local', modelSource: 'https://example.com/weights.gguf', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), strategy: 'Paper-only strategy for an isolated registration test.', strategyCodeHash: 'c'.repeat(64), pair: 'WMON / USDC', tradeCap: '10', exposureCap: '50', selfHosted: true });
const detected: Detection = { model: 'test-local', endpoint: prepared.privateRuntimeConfig.inferenceBaseURL, quantization: 'test', context: 16384, build: 'test', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), weightsFilename: 'test.gguf', weightsBytes: 10, runtimeManifest: { version: 'test', scope: 'test', build: 'test', artifacts: [] }, checkedAt: new Date().toISOString(), evidence: 'locally-detected-not-attested', sourceStatus: 'unavailable' };
const mockWorker = () => checkLocalWorker(prepared, { detect: async () => detected, infer: async () => ({ action: 'BUY', quoteUnits: '10000000' }) });
const c: Challenge = { id: 'abc', origin: 'http://localhost:5189', chainId: 10143, commitment: prepared.commitment, runtimeConfigHash: runtimeConfigHash(prepared), controller: controller.address, executionKey: execution.address, expiresAt: Date.now()+600000 };
async function signs(challenge = c) { return { controllerSignature: await controller.signMessage({ message: authorizationMessage(challenge, 'controller') }), executionSignature: await execution.signMessage({ message: authorizationMessage(challenge, 'execution') }) }; }
test('Signed declaration rejects edited manifest, hosted endpoints, unbounded sizes and zero roles', () => {
  assert.deepEqual(checkedPrepared(prepared),prepared);
  const altered=structuredClone(prepared); altered.manifest.name='changed'; assert.throws(()=>checkedPrepared(altered),/commitment/);
  for (const endpoint of ['https://localhost:8080/v1','http://127.0.0.1/admin','http://remote.example/v1','http://localhost:8080/v1?x=y']) assert.throws(()=>checkedPrepared({...prepared,privateRuntimeConfig:{inferenceBaseURL:endpoint}}));
  assert.throws(()=>checkedPrepared({...prepared,extra:'unexpected'}));
});
test('Both roles must sign the exact nonce, origin, chain, private config, manifest and expiry', async () => {
  const sig=await signs(); await checkAuthorizations(c,sig.controllerSignature,sig.executionSignature);
  for (const change of [{id:'another'},{origin:'http://127.0.0.1:5189'},{chainId:1},{commitment:('0x'+'d'.repeat(64)) as Hex},{runtimeConfigHash:('0x'+'d'.repeat(64)) as Hex},{expiresAt:c.expiresAt+1}]) await assert.rejects(checkAuthorizations({...c,...change},sig.controllerSignature,sig.executionSignature));
  await assert.rejects(checkAuthorizations(c,sig.executionSignature,sig.controllerSignature));
  await assert.rejects(checkAuthorizations(c,sig.controllerSignature,sig.controllerSignature));
  await assert.rejects(checkAuthorizations(c,sig.controllerSignature,sig.executionSignature,c.expiresAt),/expired/);
});
test('Deterministic guard overrides stale, unvalued, oversized, overexposed, overdrawn and invalid proposals', () => {
  const input={fresh:true,valued:true,positionQuoteUnits:'0',cashQuoteUnits:'20000000'};
  assert.equal(guardedProposal({action:'BUY',quoteUnits:'10000000'},input,prepared).action,'BUY');
  for (const x of [{fresh:false},{valued:false},{positionQuoteUnits:'45000000'},{cashQuoteUnits:'1'}]) assert.equal(guardedProposal({action:'BUY',quoteUnits:'10000000'},{...input,...x},prepared).action,'HOLD');
  assert.equal(guardedProposal({action:'BUY',quoteUnits:'10000001'},input,prepared).action,'HOLD');
  assert.equal(guardedProposal({action:'SELL',quoteUnits:'10000000'},input,prepared).action,'HOLD');
  for(const proposal of [{action:'WITHDRAW',quoteUnits:'1'},{action:'BUY',quoteUnits:'-1'},{action:'BUY',quoteUnits:'1e9'},{action:'BUY',quoteUnits:'1',tool:'transfer'}]) assert.throws(()=>guardedProposal(proposal,input,prepared));
});
test('Worker check performs local inference, guards it, rechecks artifacts and refuses changed weights', async () => {
  let calls=0; const result=await checkLocalWorker(prepared,{detect:async()=>{calls++;return detected;},infer:async()=>({action:'BUY',quoteUnits:'10000000'})});
  assert.equal(calls,2); assert.equal(result.guardedProposal.action,'HOLD'); assert.equal(result.mode,'synthetic-paper-only');
  assert.equal(result.version,'PUMPCOIN-LOCAL-WORKER-CHECK-v2'); assert.equal(result.scenarios.length,2); assert.equal(result.scenarios[0].guardedProposal.action,'BUY'); assert.equal(result.guardChallenges.length,8); assert.deepEqual(result.guardChallenges.map(x=>x.result),result.guardChallenges.map(x=>x.expected));
  assert.throws(()=>matchingDetection(prepared,{...detected,weightsHash:'d'.repeat(64)}));
  calls=0; await assert.rejects(checkLocalWorker(prepared,{detect:async()=>++calls===1?detected:{...detected,runtimeHash:'d'.repeat(64)},infer:async()=>({action:'HOLD',quoteUnits:'0'})}),/artifacts/);
});
test('Inference uses only the fixed local chat route, no redirects, no tools or secrets, and rejects truncation', async () => {
  const fetcher:typeof fetch=async (url,options)=>{assert.equal(String(url),'http://127.0.0.1:8080/v1/chat/completions');assert.equal(options?.redirect,'error'); const body=JSON.parse(options?.body as string);assert.equal(body.max_tokens,96); assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.tools,undefined);assert.ok(!JSON.stringify(body).includes(controller.address));return Response.json({model:'test-local',choices:[{finish_reason:'stop',message:{content:'{"action":"HOLD","quoteUnits":"0"}'}}]});};
  const input={fresh:false,valued:false,positionQuoteUnits:'0',cashQuoteUnits:'0'}; assert.deepEqual(await inferPaper(prepared,input,fetcher),{action:'HOLD',quoteUnits:'0'});
  await assert.rejects(inferPaper(prepared,input,async()=>Response.json({model:'test-local',choices:[{finish_reason:'length',message:{content:'{}'}}]})),/incomplete/);
  await assert.rejects(inferPaper(prepared,input,async()=>Response.json({model:'other',choices:[]})),/inconsistent/);
});
test('Registration requires fresh worker evidence, persists authorizations privately, survives restart and consumes the nonce once', async () => {
  const directory=await mkdtemp(join(tmpdir(),'pumpcoin-registration-')); try {
    const service=registrationService({directory,worker:mockWorker,detect:async()=>detected}); const challenge=service.challenge(prepared,c.origin), sig=await signs(challenge);
    await assert.rejects(service.commit(challenge.id,c.origin,sig.controllerSignature,sig.executionSignature),/worker/);
    service.check(challenge.id,c.origin); while(service.job(challenge.id,c.origin).status==='running') await new Promise(r=>setTimeout(r,0));
    const record=await service.commit(challenge.id,c.origin,sig.controllerSignature,sig.executionSignature);assert.equal(record.investmentEligible,false);assert.equal(record.binding,undefined);
    await assert.rejects(service.commit(challenge.id,c.origin,sig.controllerSignature,sig.executionSignature),/consumed/);
    const path=join(directory,(await readdir(directory))[0]); assert.equal((await stat(path)).mode & 0o777,0o600);assert.ok((await readFile(path,'utf8')).includes('inferenceBaseURL'));
    const restarted=registrationService({directory});assert.equal((await restarted.records())[0].id,record.id);assert.ok(!JSON.stringify(await restarted.records()).includes('127.0.0.1:8080'));
    await assert.rejects(restarted.commit(challenge.id,c.origin,sig.controllerSignature,sig.executionSignature));await assert.rejects(restarted.plan(record.id),/No reviewed/);await assert.rejects(restarted.bind(record.id,'1'),/No reviewed/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('Changed artifacts, reused sessions and stale worker checks cannot produce registrations', async () => {
  const directory=await mkdtemp(join(tmpdir(),'pumpcoin-reject-')); try {
    let clock=Date.now();const service=registrationService({directory,now:()=>clock,worker:mockWorker,detect:async()=>({...detected,weightsHash:'d'.repeat(64)})}); const challenge=service.challenge(prepared,c.origin), sig=await signs(challenge);
    assert.throws(()=>service.job(challenge.id,'http://localhost:5190'),/origin/);
    service.check(challenge.id,c.origin); while(service.job(challenge.id,c.origin).status==='running') await new Promise(r=>setTimeout(r,0));
    clock+=120001; await assert.rejects(service.commit(challenge.id,c.origin,sig.controllerSignature,sig.executionSignature),/fresh/);
    clock-=120001; await assert.rejects(service.commit(challenge.id,c.origin,sig.controllerSignature,sig.executionSignature),/artifacts/); await assert.rejects(service.commit(challenge.id,c.origin,sig.controllerSignature,sig.executionSignature),/consumed/);
    assert.equal((await readdir(directory)).length,0);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('Fresh enrollment preserves only an identical declaration’s historical binding', async () => {
  const directory=await mkdtemp(join(tmpdir(),'pumpcoin-reenroll-'));
  try {
    const binding=await verifyBinding(prepared,'1',config,rpc());
    const service=registrationService({directory,config,worker:mockWorker,detect:async()=>detected,binding:async()=>binding});
    const enroll=async(p=prepared)=>{const challenge=service.challenge(p,c.origin),sig=await signs(challenge);service.check(challenge.id,c.origin);while(service.job(challenge.id,c.origin).status==='running')await new Promise(r=>setTimeout(r,0));return service.commit(challenge.id,c.origin,sig.controllerSignature,sig.executionSignature);};
    const original=await enroll();await service.bind(original.id,'1');
    const fresh=await enroll();assert.notEqual(fresh.id,original.id);assert.deepEqual(fresh.binding,binding);assert.equal(fresh.investmentEligible,false);
    // Prepare the changed declaration through the same canonical form validator.
    const other=prepareManifest({...initialDraft,name:prepared.manifest.name,controller:controller.address,executionKey:execution.address,model:'test-local',modelSource:'https://example.org/model',weightsHash:'a'.repeat(64),runtimeHash:'b'.repeat(64),strategy:'Changed strategy declaration',strategyCodeHash:'c'.repeat(64),pair:'WMON / USDC',tradeCap:'10',exposureCap:'50',slippageBps:'50',endpoint:'http://127.0.0.1:8080/v1',selfHosted:true});
    assert.equal((await enroll(other)).binding,undefined);assert.equal((await service.records()).length,3);
  } finally {await rm(directory,{recursive:true,force:true});}
});
const addr=(n:number)=>getAddress('0x'+n.toString(16).padStart(40,'0'));
const hash=keccak256('0x1234');
const config:Deployment={chainId:10143,mode:'monad-testnet',rpcUrl:'https://configured.example',identityRegistry:addr(1),identityCodeHash:hash,vault:addr(2),vaultCodeHash:hash,adapter:addr(3),adapterCodeHash:hash,venue:addr(4),venueCodeHash:hash,quote:addr(5),position:addr(6),pair:'WMON / USDC'};
function rpc(changes:Record<string,unknown>={}) {
  const values:Record<string,unknown>={admin:controller.address,manager:execution.address,identityRegistry:config.identityRegistry,agentId:1n,strategyHash:strategyBindingHash(prepared),riskHash:riskBindingHash(prepared),perTradeCap:10000000n,maxPositionValue:50000000n,currentConfigHash:hash,asset:config.quote,positionAsset:config.position,adapter:config.adapter,paused:false,ownerOf:controller.address,tokenURI:identityURI(prepared),decimals:6,...changes};
  return {getChainId:async()=>10143,getCode:async()=> '0x1234',getStorageAt:async()=>('0x'+'0'.repeat(64)),getBlock:async()=>({number:10n,hash}),simulateContract:async()=>{},readContract:async({address,functionName,blockNumber}:any)=>{assert.equal(blockNumber,10n);if(address===config.adapter)return ({vault:config.vault,quote:config.quote,asset:config.position,allowedVenue:config.venue,revoked:false,...changes} as Record<string,unknown>)[functionName];return values[functionName];}};
}
test('Reviewed deployed identity and vault binding is anchored and remains separate from investment eligibility',async()=>{
  assert.equal(deployment(config),config);const result=await verifyBinding(prepared,'1',config,rpc());assert.equal(result.blockNumber,'10');assert.equal(result.investmentEligible,false);assert.equal(result.status,'binding-checked-at-block');
  const plan=await identityPlan(prepared,config,rpc());assert.equal(plan.status,'prepared-not-submitted');assert.equal(plan.from,controller.address);assert.equal(plan.value,'0');assert.ok(!identityURI(prepared).includes('127.0.0.1'));
});
test('Binding rejects transferred identity, wrong owner/manager, metadata, limits, tokens, pause and indirect adapter changes',async()=>{
  for(const change of [{ownerOf:execution.address},{tokenURI:'other'},{admin:execution.address},{manager:controller.address},{identityRegistry:addr(9)},{agentId:2n},{strategyHash:('0x'+'d'.repeat(64))},{riskHash:('0x'+'d'.repeat(64))},{perTradeCap:1n},{maxPositionValue:1n},{asset:addr(9)},{decimals:18},{paused:true},{revoked:true},{allowedVenue:addr(9)}]) await assert.rejects(verifyBinding(prepared,'1',config,rpc(change)));
  await assert.rejects(verifyBinding(prepared,'1',{...config,vaultCodeHash:('0x'+'d'.repeat(64)) as Hex},rpc()),/bytecode/);
  await assert.rejects(verifyBinding(prepared,'1',config,{...rpc(),getChainId:async()=>1}),/another chain/);
  await assert.rejects(verifyBinding(prepared,'1',config,{...rpc(),getBlock:async(x:any)=>({number:10n,hash:x.blockNumber?('0x'+'d'.repeat(64)):hash})}),/Chain changed/);
});
test('Local registration API rejects missing token, cross-origin access, arbitrary paths, huge bodies and tampering',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pumpcoin-api-'));const service=registrationService({directory,worker:mockWorker,detect:async()=>detected});const plugin=registrationPlugin(service);let handler:any;plugin.configureServer({middlewares:{use(h){handler=h;}}});const server=createServer((req,res)=>handler(req,res,()=>{res.statusCode=404;res.end();})); await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try {const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;const {token}=await(await fetch(base+REGISTRATION_API+'/status')).json() as any;const post=(route:string,body:unknown,t=token,origin=base)=>fetch(base+REGISTRATION_API+route,{method:'POST',headers:{'Content-Type':'application/json','X-PumpCoin-Registration-Token':t,Origin:origin},body:JSON.stringify(body)});
    assert.equal((await post('/challenge',{prepared},'bad')).status,403);assert.equal((await post('/challenge',{prepared},token,'https://evil.example')).status,403);assert.equal((await post('/challenge',{prepared,path:'/etc/passwd'})).status,400);assert.equal((await post('/challenge',{prepared,padding:'x'.repeat(70000)})).status,413);
    const response=await post('/challenge',{prepared});assert.equal(response.status,200);const {challenge}=await response.json() as any;assert.equal(challenge.origin,base);assert.equal(challenge.chainId,10143);assert.equal((await post('/commit',{id:challenge.id,controllerSignature:'0x00',executionSignature:'0x00'})).status,400);
  }finally{await new Promise<void>(r=>server.close(()=>r()));await rm(directory,{recursive:true,force:true});}
});

test('ERC-1967 identities require a matching implementation address and runtime pin',async()=>{
  await assert.rejects(identityPlan(prepared,config,{...rpc(),getStorageAt:async()=>('0x'+'0'.repeat(24)+addr(7).slice(2))}),/Beacon/);
  const implementation=addr(7), client={...rpc(),getStorageAt:async({slot}:any)=>slot.startsWith('0x3608')?('0x'+'0'.repeat(24)+implementation.slice(2)):('0x'+'0'.repeat(64))};
  await assert.rejects(identityPlan(prepared,config,client),/implementation/);
  assert.equal((await identityPlan(prepared,{...config,identityImplementation:implementation,identityImplementationCodeHash:hash},client)).status,'prepared-not-submitted');
  await assert.rejects(identityPlan(prepared,{...config,identityImplementation:addr(8),identityImplementationCodeHash:hash},client),/implementation/);
});

test('Configuration updates prepare a URI change on the same owned identity instead of resetting its history',async()=>{
  const plan=await identityPlan(prepared,config,rpc(),'1');assert.equal(plan.existingAgentId,'1');assert.equal(plan.status,'prepared-not-submitted');
  await assert.rejects(identityPlan(prepared,config,rpc({ownerOf:execution.address}),'1'),/not owned/);
});


test('Muse has a bounded reasoning allowance without changing earlier local model requests', () => {
  const input = { fresh: false, valued: false, positionQuoteUnits: '0', cashQuoteUnits: '0' };
  const muse = { ...prepared, manifest: { ...prepared.manifest, model: { ...prepared.manifest.model, id: 'muse-glimmer-30b' } } };
  const request = inferenceRequest(muse, input);
  assert.equal(request.max_tokens, 512);
  assert.deepEqual(request.chat_template_kwargs, { enable_thinking: false, reasoning_strength: 'low' });
  assert.equal(inferenceRequest(prepared, input).max_tokens, 96);
  assert.deepEqual(inferenceRequest(prepared, input).chat_template_kwargs, { enable_thinking: false });
});
