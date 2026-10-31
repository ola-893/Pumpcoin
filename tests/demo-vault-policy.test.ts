import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,stringToHex} from 'viem';
import {initialDraft,prepareManifest} from '../app/src/lib/registration.js';
import {checkedPrepared,authorizationMessage} from '../agent-registration/core.js';
import {registeredVaultName,prepareVault,vaultNetwork,type VaultNetwork} from '../agent-registration/vault-setup.js';
import {identityURI} from '../agent-registration/binding.js';
const draft={...initialDraft,name:'Azula fixture',controller:'0x1111111111111111111111111111111111111111',executionKey:'0x2222222222222222222222222222222222222222',model:'fixture',modelSource:'https://example.com/model',weightsHash:'a'.repeat(64),runtimeHash:'b'.repeat(64),strategy:'Isolated test fixture with bounded spot trades.',strategyCodeHash:'c'.repeat(64),tradeCap:'0.01',exposureCap:'0.1',selfHosted:true};
test('Instant demo policy is explicit and changes the signed manifest and artifact',()=>{
 const normal=prepareManifest(draft),demo=prepareManifest({...draft,demoMode:true});assert.equal(normal.manifest.vaultPolicy,undefined);assert.notEqual(normal.commitment,demo.commitment);assert.deepEqual(demo.manifest.vaultPolicy,{mode:'instant-testnet-demo',chainId:11155111,configurationNoticeSeconds:0});assert.equal(registeredVaultName(normal.manifest),'PumpCoinRegisteredVault');assert.equal(registeredVaultName(demo.manifest),'PumpCoinSepoliaDemoRegisteredVault');assert.deepEqual(checkedPrepared(demo),demo);
 const c={id:'fixture',origin:'http://127.0.0.1:5173',chainId:11155111,commitment:demo.commitment,runtimeConfigHash:demo.commitment,controller:draft.controller,executionKey:draft.executionKey,expiresAt:Date.now()+60000,demoMode:true as const};assert.match(authorizationMessage(c,'controller'),/configuration notice: 0 seconds/);
});
test('Edited, ambiguous or cross-chain demo policies are rejected',()=>{
 const demo=prepareManifest({...draft,demoMode:true});const unsigned=structuredClone(demo);unsigned.manifest.vaultPolicy!.chainId=1 as any;assert.throws(()=>checkedPrepared(unsigned),/commitment/);
 for(const policy of [{mode:'instant-testnet-demo',chainId:1,configurationNoticeSeconds:0},{mode:'instant-testnet-demo',chainId:10143,configurationNoticeSeconds:86400},{mode:'production',chainId:10143,configurationNoticeSeconds:0},{mode:'instant-testnet-demo',chainId:10143,configurationNoticeSeconds:0,extra:true}]){const x=structuredClone(demo);x.manifest.vaultPolicy=policy as any;x.commitment=keccak256(stringToHex(JSON.stringify(x.manifest)));assert.throws(()=>checkedPrepared(x),/demo vault policy/);}
});
test('Server refuses demo deployment on a chain different from its signed declaration before any RPC call',async()=>{
 const demo=prepareManifest({...draft,demoMode:true});await assert.rejects(prepareVault(demo,{chainId:31337} as VaultNetwork,{getBlock:()=>{throw new Error('must not call RPC');}}),/explicitly signed testnet/);
});

test('Historical Monad declarations keep their chain, authorization text and artifact',()=>{
 const legacy=prepareManifest({...draft,pair:'WMON / USDC',demoMode:true,executionChainId:10143});assert.deepEqual(legacy.manifest.vaultPolicy,{mode:'instant-testnet-demo',chainId:10143,configurationNoticeSeconds:0});assert.equal(registeredVaultName(legacy.manifest),'PumpCoinDemoRegisteredVault');assert.deepEqual(checkedPrepared(legacy),legacy);
});

test('Commitment-only publication preserves the full signed manifest and explicitly states availability limits',()=>{
 const prepared=prepareManifest({...draft,demoMode:true}),before=JSON.stringify(prepared);
 const decode=(uri:string)=>JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());
 const full=decode(identityURI(prepared)),compact=decode(identityURI(prepared,'commitment-only-v1'));
 assert.deepEqual(full.x_pumpcoin.manifest,prepared.manifest);
 assert.equal(compact.x_pumpcoin.manifest,undefined);
 assert.equal(compact.x_pumpcoin.manifestCommitment,prepared.commitment);
 assert.match(compact.x_pumpcoin.manifestAvailability,/retained and exportable.*commitment only/);
 assert.equal(compact.active,false);assert.equal(compact.x_pumpcoin.investmentEligible,false);
 assert.equal(JSON.stringify(prepared),before);
 assert.notEqual(identityURI(prepared,'commitment-only-v1'),identityURI({...prepared,commitment:`0x${'f'.repeat(64)}`},'commitment-only-v1'));
 assert.throws(()=>vaultNetwork({identityPublication:'unknown'} as any),/Unsupported identity publication/);
});
