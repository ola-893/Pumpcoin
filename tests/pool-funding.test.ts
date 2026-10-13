import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {getAddress,type Address,type Hex} from 'viem';
import {poolFundingService} from '../agent-registration/pool-funding.js';
import {validatePoolFundingTransaction} from '../app/src/lib/pool-funding-wallet.js';
const network=JSON.parse(readFileSync(new URL('../deployments/pumpcoin-vault-network.json',import.meta.url),'utf8'));
const n=JSON.parse(readFileSync(new URL('../deployments/pumpcoin-trading-network.json',import.meta.url),'utf8'));
const artifact=JSON.parse(readFileSync(new URL('../contracts/out/TestnetPoolFunder.sol/TestnetPoolFunder.json',import.meta.url),'utf8'));
const owner=getAddress('0x1111111111111111111111111111111111111111'),source=getAddress('0x2222222222222222222222222222222222222222'),funder=getAddress('0x3333333333333333333333333333333333333333');
const id=('0x'+'aa'.repeat(32))as Hex,hash=('0x'+'bb'.repeat(32))as Hex,blockHash=('0x'+'cc'.repeat(32))as Hex,poolId=('0x'+'dd'.repeat(32))as Hex;
test('controller pool plans are bounded, recoverable and verified against exact receipts and bindings',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'unora-pool-test-'));let price=25000n,allowance=0n,changed=false,wrongValue=false;let submitted:any;let priceAge=0,receiptStatus='success',lastEstimate:any;const now=BigInt(Math.floor(Date.now()/1000));
 const view={vaultRuntimeCompatible:true,chainId:10143,blockNumber:'1',blockHash,controller:owner,bundle:{source},poolId,balances:{quote:'20000000'}};
 const client={getBlock:async()=>({hash:blockHash,timestamp:now}),getBalance:async()=>7n*10n**18n,getCode:async()=>artifact.deployedBytecode.object,estimateGas:async(args:any)=>{lastEstimate=args;return 10000n;},getGasPrice:async()=>100n,getTransaction:async()=>({from:owner,to:submitted.to??null,input:submitted.data,value:BigInt(submitted.value)+(wrongValue?1n:0n)}),getTransactionReceipt:async()=>({status:receiptStatus,contractAddress:funder,blockNumber:1n,blockHash}),readContract:async({functionName}:any)=>{const values:Record<string,unknown>={controller:owner,quote:network.quote,position:network.position,poolManager:n.poolManager,stateView:n.stateView,source:changed?owner:source,fee:n.fee,tickSpacing:n.tickSpacing,poolId,liquidity:0n,tickLower:0,tickUpper:0,allowance,updatedAt:now-BigInt(priceAge),getSlot0:[0n,0,0,500]};if(functionName==='referencePrice'){if(!price)throw new Error('stale');return price;}return values[functionName];}};
 const trading={inspect:async(_id:string,_account?:Address)=>view};
 try{
  let service=poolFundingService(network,n,dir,trading,client);
  await assert.rejects(service.plan(id,'deploy-pool-funder',source),/controller/);
  submitted=await service.plan(id,'deploy-pool-funder',owner);assert.equal(submitted.value,'0x0');wrongValue=true;await assert.rejects(service.receipt(id,submitted.id,hash),/exact reviewed/);wrongValue=false;await service.receipt(id,submitted.id,hash);
  service=poolFundingService(network,n,dir,trading,client);assert.equal((await service.inspect(id,owner)).funder,funder);
  await assert.rejects(service.plan(id,'deploy-pool-funder',owner),/already/);
  await assert.rejects(service.plan(id,'seed-pool',owner),/Approve exactly/);
  const approval=await service.plan(id,'approve-pool-funding',owner);assert.equal(approval.to,network.quote);assert.equal(approval.value,'0x0');
  allowance=200000n;price=0n;await assert.rejects(service.plan(id,'seed-pool',owner),/fresh Supra/);price=25000n;
  priceAge=220;await assert.rejects(service.plan(id,'seed-pool',owner),/expire too soon/);priceAge=0;const plan=await service.plan(id,'seed-pool',owner);assert.equal(lastEstimate.blockNumber,undefined,'pool funding is estimated against live state, not the historical snapshot');assert.equal(BigInt(plan.value),3n*10n**18n);assert.equal(plan.funding!.maxQuote,'200000');assert.equal(plan.funding!.upper-plan.funding!.lower,20);assert.ok(plan.range!.minimumMonPrice<0.025&&plan.range!.maximumMonPrice>=0.025);
  validatePoolFundingTransaction(plan,owner);assert.throws(()=>validatePoolFundingTransaction({...plan,value:'0x1'},owner),/Invalid bounded/);assert.throws(()=>validatePoolFundingTransaction({...plan,data:approval.data},owner),/calldata/);assert.throws(()=>validatePoolFundingTransaction({...plan,funding:{...plan.funding!,maxQuote:'200001'}},owner),/amount/);assert.throws(()=>validatePoolFundingTransaction({...plan,to:source},owner),/Invalid bounded/);assert.throws(()=>validatePoolFundingTransaction({...plan,quote:{expiresAt:Date.now()-1}},owner),/Invalid bounded/);
  submitted=plan;receiptStatus='reverted';const failed=await service.receipt(id,plan.id,hash);assert.equal(failed.status,'reverted');const saved=JSON.parse(await readFile(join(dir,'plans',plan.id.slice(2)+'.json'),'utf8'));assert.equal(saved.receipt.status,'reverted');assert.equal(saved.receipt.transactionHash,hash);
  changed=true;await assert.rejects(service.inspect(id,owner),/bindings changed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
