import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {keccak256,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {sepoliaStep} from '../agent-registration/sepolia-step.js';
// Public deterministic test key. Never reads operator credentials.
const account=privateKeyToAccount(`0x${'1'.repeat(64)}`),blockHash=`0x${'b'.repeat(64)}` as Hex;
test('Sepolia steps persist before ambiguous sends, reuse the exact hash, and reject tampered scope',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sepolia-step-'));let signed=0,built=0,mined=false,raw:Hex|undefined;
 const receipt=()=>({status:'success',transactionHash:keccak256(raw!),blockNumber:10n,blockHash,gasUsed:20000n,effectiveGasPrice:2n});
 const client={getChainId:async()=>11155111,estimateGas:async()=>21000n,estimateFeesPerGas:async()=>({maxFeePerGas:3n,maxPriorityFeePerGas:1n}),getBalance:async()=>100000000000000n,getTransactionCount:async()=>4,
  getTransactionReceipt:async()=>{if(mined)return receipt();const e=new Error('missing');e.name='TransactionReceiptNotFoundError';throw e;},
  sendRawTransaction:async({serializedTransaction}:{serializedTransaction:Hex})=>{assert.equal(JSON.parse(await readFile(join(directory,'validate.json'),'utf8')).raw,serializedTransaction);if(raw)assert.equal(raw,serializedTransaction);raw=serializedTransaction;throw new Error('accepted then timeout');},
  waitForTransactionReceipt:async()=>{throw new Error('timeout');},getTransaction:async()=>({from:account.address.toLowerCase(),to:account.address,input:'0x',value:0n}),getBlock:async()=>({hash:blockHash})};
 const o={directory,step:'validate',account:{...account,signTransaction:async(tx:any)=>{signed++;return account.signTransaction(tx);}},client,remainingGasWei:100000n,build:async()=>{built++;return {to:account.address,data:'0x' as Hex};}};
 try{
  await assert.rejects(sepoliaStep(o),/timeout/);await assert.rejects(sepoliaStep(o),/timeout/);assert.equal(signed,1);assert.equal(built,1);
  mined=true;assert.equal((await sepoliaStep(o)).gasPaidWei,'40000');assert.equal(signed,1);
  const file=join(directory,'validate.json'),saved=JSON.parse(await readFile(file,'utf8'));saved.request.value='1';await writeFile(file,JSON.stringify(saved));await assert.rejects(sepoliaStep(o),/signed scope/);assert.equal(signed,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('wrong chain, excessive native value, gas ceiling and pending nonce block before signing',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sepolia-limit-'));let signed=0;
 const o={directory,step:'validate',account:{...account,signTransaction:async(tx:any)=>{signed++;return account.signTransaction(tx);}},remainingGasWei:100000n,
 client:{getChainId:async()=>11155111,estimateGas:async()=>21000n,estimateFeesPerGas:async()=>({maxFeePerGas:3n,maxPriorityFeePerGas:1n}),getBalance:async()=>100000000000000000n,getTransactionCount:async({blockTag}:any)=>blockTag==='pending'?5:4},build:async()=>({to:account.address,data:'0x' as Hex})};
 try{
  await assert.rejects(sepoliaStep({...o,client:{...o.client,getChainId:async()=>1}}),/scope/);
  await assert.rejects(sepoliaStep({...o,build:async()=>({...await o.build(),value:100000000000001n})}),/native-value/);
  await assert.rejects(sepoliaStep({...o,remainingGasWei:1n}),/gas ceiling/);
  await assert.rejects(sepoliaStep(o),/pending transaction/);assert.equal(signed,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
