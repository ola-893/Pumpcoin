import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getContractAddress, keccak256, parseTransaction, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployReviewed, requireCreation, type CreationPlan } from '../agent-registration/operator-deployment.js';

// Public Anvil fixture only; never the operator's .env.
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const id = `0x${'a'.repeat(64)}` as Hex, blockHash = `0x${'b'.repeat(64)}` as Hex;
const plan:CreationPlan = {chainId:31337,from:account.address,data:'0x60006000f3',value:'0x0',gas:'0x186a0',scope:'Fixture creation'};
const notFound = () => { const error = new Error('not mined'); error.name='TransactionReceiptNotFoundError'; throw error; };

function fixture(directory:string) {
  let prepared=0, confirmed=0, signed=0, received:Hex|undefined, timeout=true, consumed=false;
  const signer = {...account,signTransaction:async(tx:any)=>{signed++;return account.signTransaction(tx);}};
  const receipt = () => ({status:'success',transactionHash:keccak256(received!),contractAddress:getContractAddress({from:account.address,nonce:4n}),blockNumber:8n,blockHash,gasUsed:55000n,effectiveGasPrice:2n});
  const client = {
    getChainId:async()=>31337, estimateFeesPerGas:async()=>({maxFeePerGas:3n,maxPriorityFeePerGas:1n}),getBalance:async()=>1000000n,
    getTransactionCount:async()=>consumed?5:4,
    getTransactionReceipt:async()=>received&&!timeout?receipt():notFound(),
    waitForTransactionReceipt:async()=>{if(timeout)throw new Error('receipt timeout');return receipt();},
    getTransaction:async()=>({from:account.address,to:null,input:plan.data,value:0n}),getBlock:async()=>({hash:blockHash}),
  };
  const options={directory,id,kind:'guard' as const,chainId:31337 as const,account:signer,client,broadcastClient:{sendRawTransaction:async({serializedTransaction}:{serializedTransaction:Hex})=>{
    // The signed journal must already be durable at the first send.
    const saved=JSON.parse(await readFile(join(directory,`${id.slice(2)}-guard.json`),'utf8'));assert.equal(saved.raw,serializedTransaction);
    if(received)assert.equal(received,serializedTransaction);received=serializedTransaction;throw new Error('accepted then network timeout');
  }},broadcast:true,maxCostWei:300000n,prepare:async()=>{prepared++;return plan;},confirm:async()=>{confirmed++;}};
  return {options,counts:()=>({prepared,confirmed,signed}),mined:()=>{timeout=false;},consume:()=>{consumed=true;},raw:()=>received};
}

test('creation plan rejects destination calls, value, wrong controller/chain and expired review',()=>{
  requireCreation(plan,account.address,31337);
  for(const changed of [{to:account.address},{value:'0x1'},{chainId:10143},{from:'0x1111111111111111111111111111111111111111'},{quote:{expiresAt:Date.now()-1}},{gas:'0x0'},{canSubmit:false}])assert.throws(()=>requireCreation({...plan,...changed} as CreationPlan,account.address,31337));
});
test('deployment dry run never signs or broadcasts; gas cap and pending nonce fail before signing',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'operator-deployment-'));
  try{
    const f=fixture(directory);assert.equal((await deployReviewed({...f.options,broadcast:false})).state,'planned');assert.equal(f.counts().signed,0);
    await assert.rejects(deployReviewed({...f.options,maxCostWei:299999n}),/maximum gas/);assert.equal(f.counts().signed,0);
    await assert.rejects(deployReviewed({...f.options,client:{...f.options.client,getTransactionCount:async({blockTag}:any)=>blockTag==='pending'?5:4}}),/pending transaction/);assert.equal(f.counts().signed,0);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('ambiguous send is journaled, recovers the same signed deployment and verifies only once mined',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'operator-deployment-'));
  try{
    const f=fixture(directory);await assert.rejects(deployReviewed(f.options),/receipt timeout/);
    assert.deepEqual(f.counts(),{prepared:1,confirmed:0,signed:1});assert.equal(parseTransaction(f.raw()!).nonce,4);
    await assert.rejects(deployReviewed(f.options),/receipt timeout/);assert.deepEqual(f.counts(),{prepared:1,confirmed:0,signed:1});
    f.mined();const result=await deployReviewed(f.options);assert.equal(result.state,'verified');assert.equal(result.gasPaidWei,'110000');assert.deepEqual(f.counts(),{prepared:1,confirmed:1,signed:1});
    await deployReviewed(f.options);assert.equal(f.counts().prepared,1);assert.equal(f.counts().signed,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('tampered journal and an independently consumed nonce cannot become a new deployment',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'operator-deployment-'));
  try{
    const f=fixture(directory);await assert.rejects(deployReviewed(f.options));f.consume();await assert.rejects(deployReviewed(f.options),/nonce was consumed/);assert.equal(f.counts().signed,1);
    const file=join(directory,`${id.slice(2)}-guard.json`),saved=JSON.parse(await readFile(file,'utf8'));saved.plan.data='0x00';await writeFile(file,JSON.stringify(saved));
    await assert.rejects(deployReviewed(f.options),/reviewed scope/);assert.equal(f.counts().signed,1);
  }finally{await rm(directory,{recursive:true,force:true});}
});
