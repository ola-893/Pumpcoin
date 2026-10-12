import { readClient } from './rpc.js';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { getAddress, encodeDeployData, encodeFunctionData, toHex, type Address, type Hex } from 'viem';
import { nativeGatewayAbi, nativeShareAbi, type NativeAction, type NativePlan, type NativeState } from './native-investment-types.js';
import type { VaultNetwork } from './vault-setup.js';
import type { TradingNetwork, tradingService } from './trading.js';
import type { RegistrationRecord } from './types.js';

// Exact prepared transactions are retained server-side. Receipt recovery never trusts a browser-supplied destination or calldata.
export function nativeInvestmentService(network: VaultNetwork, n: TradingNetwork, directory: string, records: () => Promise<RegistrationRecord[]>, trading: Pick<ReturnType<typeof tradingService>, 'inspect'>, client: any = readClient(network.rpcUrl)) {
 const confirming = new Set<string>();
 const artifact = (name='NativeVaultInvestorGateway') => JSON.parse(readFileSync(new URL(`../contracts/out/${name}.sol/${name}.json`,import.meta.url),'utf8'));
 const key = (id:string) => {if(!/^0x[a-f0-9]{64}$/.test(id))throw new Error('Invalid native investment identifier.');return id.slice(2);};
 const file = (id:string) => join(directory,key(id)+'.json');
 const planFile = (id:string) => join(directory,'plans',key(id)+'.json');
 async function load<T>(path:string):Promise<T|undefined>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}}
 async function save(path:string,value:unknown){const temporary=path+'.'+randomBytes(8).toString('hex');await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(temporary,path);}
 async function record(id:string){key(id);const r=(await records()).find(r=>r.id===id);if(!r?.binding)throw new Error('Finish the public vault registration before enabling MON investment.');return r;}
 async function canonical(blockNumber:bigint,hash:Hex){if((await client.getBlock({blockNumber})).hash!==hash)throw new Error('Chain snapshot changed. Refresh and review again.');}
 function normalize(code:Hex,a:any){const bytes=Buffer.from(code.slice(2),'hex');for(const ranges of Object.values(a.deployedBytecode.immutableReferences??{}) as any[])for(const {start,length} of ranges)bytes.fill(0,start,start+length);return bytes.toString('hex');}
 async function snapshot(id:string,account?:Address){
  const r=await record(id),view=await trading.inspect(id,account),b=BigInt(view.blockNumber);
  if(![10143,31337].includes(network.chainId)||await client.getChainId()!==network.chainId)throw new Error('Wrong native investment RPC chain.');
  const vaultArtifact=artifact('PumpCoinRegisteredVault'),vaultCode=await client.getCode({address:getAddress(r.binding!.vault),blockNumber:b});
  if(!vaultCode||vaultCode.length!==vaultArtifact.deployedBytecode.object.length||normalize(vaultCode,vaultArtifact)!==normalize(vaultArtifact.deployedBytecode.object,vaultArtifact))throw new Error('A compatible reviewed public vault is required for MON investment.');
  const deployment=await load<{address:Address;transactionHash:Hex;source:Address}>(file(id));
  const blockers=[...view.blockers];
  if(!deployment)blockers.push('The controller must deploy this vault’s MON conversion gateway.');
  if(deployment){
   if(!view.bundle||deployment.source.toLowerCase()!==view.bundle.source.toLowerCase())throw new Error('Native gateway source no longer matches this vault’s reviewed trading bundle.');
   const a=artifact(),code=await client.getCode({address:deployment.address,blockNumber:b});
   if(!code||code.length!==a.deployedBytecode.object.length||normalize(code,a)!==normalize(a.deployedBytecode.object,a))throw new Error('Native gateway code differs from the reviewed artifact.');
   const expected:Record<string,unknown>={vault:getAddress(r.binding!.vault),quote:network.quote,wrappedMON:network.position,poolManager:n.poolManager,source:view.bundle.source,fee:n.fee,tickSpacing:n.tickSpacing,slippageBps:r.manifest.proposedMandate.slippageBps,poolId:view.poolId};
   for(const [functionName,value] of Object.entries(expected)){const actual=await client.readContract({address:deployment.address,abi:nativeGatewayAbi,functionName,blockNumber:b});if(String(actual).toLowerCase()!==String(value).toLowerCase())throw new Error('Native gateway immutable bindings changed.');}
  }
  const state:NativeState={ready:view.ready&&!!deployment,blockers,vault:getAddress(r.binding!.vault),gateway:deployment?.address,controller:getAddress(view.controller),blockNumber:view.blockNumber,checkedAt:view.checkedAt,nav:view.nav};
  if(account){state.nativeBalance=(await client.getBalance({address:account,blockNumber:b})).toString();state.shares=view.balances?.shares;state.maxRedeem=view.balances?.maxRedeem;if(deployment)state.allowance=(await client.readContract({address:state.vault,abi:nativeShareAbi,functionName:'allowance',args:[account,deployment.address],blockNumber:b})).toString();}
  await canonical(b,view.blockHash as Hex);
  return {r,view,state,b,hash:view.blockHash as Hex};
 }
 async function inspect(id:string,account?:string){return (await snapshot(id,account?getAddress(account):undefined)).state;}
 const floor=(x:bigint)=>{const v=x*9990n/10000n;return v>0n?v:1n;};
 async function plan(id:string,action:NativeAction,account:string,amount:string):Promise<NativePlan>{
  if(!['deploy-native','deposit-mon','approve-native-exit','redeem-mon'].includes(action))throw new Error('Unknown native investment action.');
  const from=getAddress(account),s=await snapshot(id,from),{r,view,state,b}=s;
  const block=await client.getBlock({blockNumber:b});
  const deadline=Number(block.timestamp)+120; // Enough wallet time; live quote expiry remains thirty seconds.
  const expiresAt=Date.now()+30000;
  let data:Hex,to:Address|undefined,value:Hex='0x0',native:NativePlan['native'],output:string|undefined,quoteAssets:string|undefined;
  if(action==='deploy-native'){
   if(from!==state.controller)throw new Error('Connect this vault’s controller to deploy its MON gateway.');
   if(state.gateway)throw new Error('This vault already has a verified MON gateway.');
   if(!view.bundle)throw new Error('Deploy the compatible public vault and reviewed trading bundle first.');
   const a=artifact();data=encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args:[state.vault,n.poolManager,view.bundle.source,n.fee,n.tickSpacing,r.manifest.proposedMandate.slippageBps]});
  }else{
   if(!state.ready||!state.gateway)throw new Error(state.blockers.join(' ').slice(0,260)||'MON investment is not ready.');
   if(!/^[1-9][0-9]{0,38}$/.test(amount))throw new Error('Enter a positive amount in base units.');
   const units=BigInt(amount),gateway=state.gateway;
   if(action!=='deposit-mon'&&units>BigInt(state.maxRedeem??'0'))throw new Error('Pump amount exceeds your liquid redemption limit.');
   native={action,gateway,vault:state.vault,amount,minQuote:'0',minOutput:'0',deadline};
   if(action==='approve-native-exit'){to=state.vault;data=encodeFunctionData({abi:nativeShareAbi,functionName:'approve',args:[gateway,units]});}
   else{
    to=gateway;
    if(action==='redeem-mon'&&BigInt(state.allowance??'0')<units)throw new Error('Approve this exact Pump amount for the MON gateway before reviewing redemption.');
    const call=async(minQuote:bigint,minOutput:bigint)=>client.simulateContract({address:gateway,abi:nativeGatewayAbi,functionName:action==='deposit-mon'?'depositMON':'redeemMON',args:action==='deposit-mon'?[minQuote,minOutput,BigInt(deadline)]:[units,minQuote,minOutput,BigInt(deadline)],account:from,value:action==='deposit-mon'?units:0n,blockNumber:b});
    const expectedQuote=action==='deposit-mon'?await client.readContract({address:gateway,abi:nativeGatewayAbi,functionName:'minimumOutput',args:[network.position,units],blockNumber:b}):floor(await client.readContract({address:state.vault,abi:nativeShareAbi,functionName:'previewRedeem',args:[units],blockNumber:b}));
    const first=await call(expectedQuote,1n),[assets,result]=first.result as readonly [bigint,bigint];
    const minQuote=floor(assets)>expectedQuote?floor(assets):expectedQuote,minOutput=floor(result);
    const exact=await call(minQuote,minOutput),[secondAssets,secondResult]=exact.result as readonly [bigint,bigint];
    if(secondAssets!==assets||secondResult!==result)throw new Error('Native conversion output changed during simulation. Review again.');
    native.minQuote=minQuote.toString();native.minOutput=minOutput.toString();quoteAssets=assets.toString();output=result.toString();
    data=encodeFunctionData({abi:nativeGatewayAbi,functionName:action==='deposit-mon'?'depositMON':'redeemMON',args:action==='deposit-mon'?[minQuote,minOutput,BigInt(deadline)]:[units,minQuote,minOutput,BigInt(deadline)]});
    if(action==='deposit-mon')value=toHex(units);
   }
  }
  const gas=await client.estimateGas({account:from,to,data,value:BigInt(value),blockNumber:b});
  const gasBudget=gas*120n/100n,price=await client.getGasPrice();
  if(BigInt(state.nativeBalance??'0')<BigInt(value)+gasBudget*price)throw new Error('Insufficient MON for this amount and the gas budget.');
  await canonical(b,s.hash);
  if(Date.now()>=expiresAt)throw new Error('Simulation took too long. Review again for a fresh quote.');
  const result:NativePlan={id:('0x'+randomBytes(32).toString('hex')) as Hex,action,chainId:network.chainId,from,to,data,value,gas:toHex(gasBudget),estimatedFee:(gasBudget*price).toString(),native,quote:{expiresAt},output,quoteAssets,scope:action==='deposit-mon'?'Convert MON through the fixed pool and mint Pump shares at current vault value.':action==='redeem-mon'?'Burn your Pump shares at current vault value and return converted MON to this wallet.':action==='approve-native-exit'?'Approve only this Pump amount for this vault’s MON gateway.':'Deploy a dedicated MON conversion gateway. It cannot move investor shares without approval.'};
  await mkdir(join(directory,'plans'),{recursive:true,mode:0o700});await save(planFile(result.id),{recordId:id,plan:result,source:view.bundle?.source});
  return result;
 }
 async function receipt(id:string,planId:string,transactionHash:string){
  const r=await record(id);
  if(!/^0x[0-9a-f]{64}$/i.test(transactionHash))throw new Error('Invalid native investment transaction hash.');
  const saved=await load<{recordId:string;plan:NativePlan;source:Address}>(planFile(planId));
  if(!saved||saved.recordId!==id)throw new Error('This saved review does not belong to the selected agent.');
  if(confirming.has(id))throw new Error('A receipt check is already running.');confirming.add(id);
  try{
   if(await client.getChainId()!==network.chainId)throw new Error('Wrong RPC chain.');
   const hash=transactionHash as Hex,tx=await client.getTransaction({hash}),mined=await client.getTransactionReceipt({hash}),p=saved.plan;
   if(tx.from.toLowerCase()!==p.from.toLowerCase()||(tx.to??'').toLowerCase()!==(p.to??'').toLowerCase()||tx.input.toLowerCase()!==p.data.toLowerCase()||tx.value!==BigInt(p.value))throw new Error('Receipt does not match the exact reviewed native transaction.');
   await canonical(mined.blockNumber,mined.blockHash);
   if(mined.status==='reverted')return {status:'reverted' as const,transactionHash:hash};
   if(p.action==='deploy-native'){
    if(!mined.contractAddress||p.from.toLowerCase()!==r.manifest.controller.toLowerCase())throw new Error('Gateway deployment did not match the controller.');
    const existing=await load<{address:Address}>(file(id));if(existing&&existing.address.toLowerCase()!==mined.contractAddress.toLowerCase())throw new Error('A different native gateway is already recorded.');
    // Validate runtime and every immutable before publishing the new address.
    const a=artifact(),code=await client.getCode({address:mined.contractAddress,blockNumber:mined.blockNumber});
    if(!code||code.length!==a.deployedBytecode.object.length||normalize(code,a)!==normalize(a.deployedBytecode.object,a))throw new Error('Unexpected deployed native gateway code.');
    await mkdir(directory,{recursive:true,mode:0o700});await save(file(id),{address:getAddress(mined.contractAddress),transactionHash:hash,source:saved.source});
   }
   return {status:'success' as const,transactionHash:hash,blockNumber:mined.blockNumber.toString()};
  }finally{confirming.delete(id);}
 }
 return {inspect,plan,receipt};
}
