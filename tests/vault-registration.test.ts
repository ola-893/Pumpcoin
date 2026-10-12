import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registrationService } from '../agent-registration/service.js';
import { authorizationMessage } from '../agent-registration/core.js';
import { checkLocalWorker } from '../agent-registration/worker.js';
import type { Detection } from '../local-inference/types.js';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createPublicClient, createWalletClient, http, keccak256, getAddress, parseAbi, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { initialDraft, prepareManifest } from '../app/src/lib/registration.js';
import { prepareVault, confirmVault, vaultArtifact, type VaultNetwork } from '../agent-registration/vault-setup.js';
const account=privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'); // public Anvil fixture only
const manager=privateKeyToAccount(`0x${'2'.repeat(64)}`);
const artifact=(name:string)=>JSON.parse(readFileSync(`contracts/out/PumpCoinRegisteredVault.t.sol/${name}.json`,'utf8'));
test('Real EVM deployment binds each agent atomically and refuses substituted receipts, roles, config and runtime', {timeout:90000}, async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pumpcoin-vault-registration-'));
 const port=18761, process=spawn('/Users/deonorla/.foundry/bin/anvil',['--port',String(port),'--silent'],{stdio:'ignore'});
 try {
  const transport=http(`http://127.0.0.1:${port}`,{retryCount:0,timeout:3000});
  const client=createPublicClient({chain:foundry,transport}), wallet=createWalletClient({chain:foundry,transport,account});
  let ready=false;for(let i=0;i<100;i++){try{await client.getChainId();ready=true;break;}catch{await new Promise(r=>setTimeout(r,50));}}assert.ok(ready,'Anvil started');
  const deploy=async(name:string,args:unknown[]=[])=>{const a=artifact(name),hash=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object,args});const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return getAddress(r.contractAddress!);};
  const registry=await deploy('RegistrationRegistryFixture'),quote=await deploy('RegistrationTokenFixture',[6]),position=await deploy('RegistrationTokenFixture',[18]);
  const codeHash=async(address:Address)=>keccak256((await client.getCode({address}))!);
  const config:VaultNetwork={chainId:31337,rpcUrl:`http://127.0.0.1:${port}`,identityRegistry:registry,identityCodeHash:await codeHash(registry),quote,quoteCodeHash:await codeHash(quote),position,positionCodeHash:await codeHash(position),positionDecimals:18};
  const prepared=prepareManifest({...initialDraft,name:'EVM vault test',controller:account.address,executionKey:manager.address,model:'fixture-local',modelSource:'https://example.com/model',weightsHash:'a'.repeat(64),runtimeHash:'b'.repeat(64),strategy:'Paper-only isolated test; no performance claims.',strategyCodeHash:'c'.repeat(64),pair:'WMON / USDC',tradeCap:'10',exposureCap:'50',selfHosted:true});
  const a=vaultArtifact(),plan=await prepareVault(prepared,config,client,a);assert.equal(plan.canSubmit,true);assert.equal(plan.from,account.address);assert.equal(plan.value,'0x0');
  const hash=await wallet.sendTransaction({data:plan.data,gas:BigInt(plan.gas),value:0n});await client.waitForTransactionReceipt({hash});
  const receipt=await confirmVault(prepared,hash,config,client,a);assert.equal(receipt.investmentEligible,false);assert.equal(receipt.tradingReady,false);assert.equal(receipt.deploymentTransaction,hash);
  const totalSupply=await client.readContract({address:getAddress(receipt.vault),abi:parseAbi(['function totalSupply() view returns(uint256)']),functionName:'totalSupply'});assert.equal(totalSupply,0n);
  // Exercise persisted, signed registration through the same service used by the UI.
  const detected: Detection = { model: 'fixture-local', endpoint: prepared.privateRuntimeConfig.inferenceBaseURL, quantization: 'test', context: 16384, build: 'test', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), weightsFilename: 'fixture.gguf', weightsBytes: 10, runtimeManifest: { version: 'test', scope: 'test', build: 'test', artifacts: [] }, checkedAt: new Date().toISOString(), evidence: 'locally-detected-not-attested', sourceStatus: 'unavailable' };
  const service=registrationService({directory,vaultNetwork:config,detect:async()=>detected,worker:async p=>checkLocalWorker(p,{detect:async()=>detected,infer:async()=>({action:'HOLD',quoteUnits:'0'})})});
  const origin='http://127.0.0.1:5173';
  async function register(p:typeof prepared) {
    const challenge=service.challenge(p,origin);
    const controllerSignature=await account.signMessage({message:authorizationMessage(challenge,'controller')});
    const executionSignature=await manager.signMessage({message:authorizationMessage(challenge,'execution')});
    service.check(challenge.id,origin);
    for(let i=0;i<100 && service.job(challenge.id,origin).status==='running';i++) await new Promise(r=>setTimeout(r,1));
    return service.commit(challenge.id,origin,controllerSignature,executionSignature);
  }
  const record=await register(prepared), servicePlan=await service.vaultPlan(record.id);
  assert.equal(servicePlan.data,plan.data);
  const bound=await service.confirmVault(record.id,hash);
  assert.equal(bound.binding?.vault,receipt.vault);assert.equal(bound.investmentEligible,false);
  assert.deepEqual(await service.confirmVault(record.id,hash),bound,'same receipt retry is idempotent');
  const restarted=registrationService({directory,vaultNetwork:config});
  assert.deepEqual((await restarted.records())[0],bound,'confirmed binding survives helper restart');
  assert.deepEqual(await restarted.confirmVault(record.id,hash),bound);
  await assert.rejects(service.vaultPlan(record.id),/already/);
  await assert.rejects(service.confirmVault(record.id,`0x${'f'.repeat(64)}`),/another vault/);
  const nextVersion=prepareManifest({...initialDraft,name:'EVM vault test',controller:account.address,executionKey:manager.address,model:'fixture-local',modelSource:'https://example.com/model',weightsHash:'a'.repeat(64),runtimeHash:'b'.repeat(64),strategy:'New paper-only declaration; keep the existing vault history.',strategyCodeHash:'d'.repeat(64),pair:'WMON / USDC',tradeCap:'10',exposureCap:'50',selfHosted:true});
  const updated=await register(nextVersion);
  assert.equal(updated.localAgentId,record.localAgentId);
  await assert.rejects(service.vaultPlan(updated.id),/history/);
  await assert.rejects(service.confirmVault(updated.id,hash),/history/);
  const wrong=prepareManifest({...initialDraft,name:'Other EVM vault test',controller:account.address,executionKey:manager.address,model:'fixture-local',modelSource:'https://example.com/model',weightsHash:'a'.repeat(64),runtimeHash:'b'.repeat(64),strategy:'Paper-only isolated test; no performance claims.',strategyCodeHash:'c'.repeat(64),pair:'WMON / USDC',tradeCap:'10',exposureCap:'50',selfHosted:true});
  await assert.rejects(confirmVault(wrong,hash,config,client,a),/exact/);
  await assert.rejects(confirmVault(prepared,hash,{...config,chainId:10143},client,a),/another chain/);
  await assert.rejects(confirmVault(prepared,hash,{...config,quoteCodeHash:`0x${'d'.repeat(64)}`},client,a),/bytecode/);
  const bogus=await wallet.sendTransaction({to:manager.address,value:0n});await client.waitForTransactionReceipt({hash:bogus});await assert.rejects(confirmVault(prepared,bogus,config,client,a),/exact/);
  const poor=privateKeyToAccount(`0x${'3'.repeat(64)}`);const poorPrepared=structuredClone(prepared);
  // Controller must remain part of the committed constructor; use a prepared declaration for the unfunded EOA.
  const poorPlan=await prepareVault({...poorPrepared,manifest:{...poorPrepared.manifest,controller:poor.address}},config,client,a);assert.equal(poorPlan.canSubmit,false);assert.ok(poorPlan.blockers.length);
  await client.request({method:'anvil_setCode' as any,params:[receipt.vault,'0x60006000fd'] as any});
  const latestBlock=await client.getBlockNumber();
  // Original receipt remains historical; corruption at the anchor itself must fail the runtime check.
  const tampered=new Proxy(client,{get(target,key){if(key==='getCode')return async(arg:any)=>arg.address.toLowerCase()===receipt.vault.toLowerCase()?'0x60006000fd':target.getCode(arg);return Reflect.get(target,key);}});
  await assert.rejects(confirmVault(prepared,hash,config,tampered,a),/runtime/);assert.ok(latestBlock>0n);
 } finally {process.kill('SIGTERM');await rm(directory,{recursive:true,force:true});}
});
