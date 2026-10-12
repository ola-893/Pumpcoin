import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createPublicClient, http, getAddress, keccak256, stringToHex, encodeAbiParameters, encodeDeployData, encodeFunctionData, parseAbi, type Address, type Hex, type Transport, type EIP1193RequestFn } from 'viem';
import type { RegistrationRecord } from './types.js';
import type { VaultNetwork } from './vault-setup.js';
const ZERO='0x0000000000000000000000000000000000000000' as Address;
const SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as Hex;
export type TradingNetwork={chainId:number;pyth:Address;pythCodeHash:Hex;pythImplementation:Address;pythImplementationCodeHash:Hex;poolManager:Address;poolManagerCodeHash:Hex;stateView:Address;stateViewCodeHash:Hex;monFeed:Hex;usdFeed:Hex;fee:number;tickSpacing:number;maxStaleness:number;maxConfidenceBps:number;maxDeviationBps:number;minimumQuoteLiquidity:string};
import type { TradeAction } from './types.js';
const configType='(address adapter,address venue,address stream,address valuationSource,uint256 perTradeCap,uint256 maxPositionValue,uint256 expenseBudget,bytes32 strategyHash,bytes32 riskHash,address identityRegistry,uint256 agentId)';
const abi=parseAbi(['function admin() view returns(address)','function manager() view returns(address)','function asset() view returns(address)','function positionAsset() view returns(address)','function strategyHash() view returns(bytes32)','function riskHash() view returns(bytes32)','function identityRegistry() view returns(address)','function agentId() view returns(uint256)','function registrationCommitment() view returns(bytes32)','function paused() view returns(bool)','function adapter() view returns(address)','function valuationSource() view returns(address)','function expenseStream() view returns(address)','function expenseBudget() view returns(uint256)','function perTradeCap() view returns(uint256)','function maxPositionValue() view returns(uint256)','function currentConfigHash() view returns(bytes32)','function totalAssets() view returns(uint256)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','function decimals() view returns(uint8)','function previewDeposit(uint256) view returns(uint256)','function previewRedeem(uint256) view returns(uint256)','function maxRedeem(address) view returns(uint256)',`function pending() view returns(${configType} args,uint64 effectiveAt,bool exists)`,`function proposeConfig(${configType} c)`,'function applyConfig()','function unpause()','function pause()','function managerTrade(address,address,uint256,uint256,uint256,address) returns(uint256)']);
const bundleAbi=parseAbi(['function vault() view returns(address)','function adapter() view returns(address)','function source() view returns(address)','function venue() view returns(address)','function gateway() view returns(address)']);
const sourceAbi=parseAbi(['function status() view returns(bool,bytes32)','function price() view returns(uint256)','function poolId() view returns(bytes32)','function pyth() view returns(address)','function stateView() view returns(address)']);
const artifact=(name:string)=>JSON.parse(readFileSync(new URL(`../contracts/out/${name==='DexCheckedPythVaultValuationSource'?'PythVaultValuationSource':name}.sol/${name}.json`,import.meta.url),'utf8'));
function normalized(code:Hex,a:any){const bytes=Buffer.from(code.slice(2),'hex');for(const list of Object.values(a.deployedBytecode.immutableReferences??{}) as any[])for(const {start,length} of list)bytes.fill(0,start,start+length);return bytes.toString('hex');}
export function poolId(n:TradingNetwork,q:Address,p:Address){if(q.toLowerCase()>=p.toLowerCase())throw new Error('Unsupported token order.');return keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint24'},{type:'int24'},{type:'address'}],[q,p,n.fee,n.tickSpacing,ZERO]));}
export function marketChecks(mon:{price:bigint;conf:bigint;expo:number;publishTime:bigint},usd:typeof mon,at:bigint,sqrt:bigint,liquidity:bigint,n:TradingNetwork){
 const blockers:string[]=[];
 for(const [name,p] of [['MON',mon],['USDC',usd]] as const)if(p.price<=0n||p.publishTime===0n||p.publishTime>at||at-p.publishTime>BigInt(n.maxStaleness)||p.expo < -18||p.expo>0||p.conf*10000n>p.price*BigInt(n.maxConfidenceBps))blockers.push(`${name} price is stale, missing or outside the confidence policy.`);
 let mark:bigint|undefined,spot:bigint|undefined;
 if(!blockers.length){mark=mon.price*10n**BigInt(18+mon.expo)*1000000n/(usd.price*10n**BigInt(18+usd.expo));if(mark===0n)blockers.push('Reference price rounds to zero.');}
 if(sqrt===0n||liquidity===0n)blockers.push('The configured DEX pool has no active liquidity.');
 const virtualQuote=sqrt>0n?liquidity*(1n<<96n)/sqrt:0n;
 if(virtualQuote<BigInt(n.minimumQuoteLiquidity))blockers.push('DEX active liquidity is below the 100 test-USDC reserve screen.');
 const ratio=sqrt*sqrt/(1n<<64n);if(ratio>0n)spot=(1n<<128n)*10n**18n/ratio;
 if(mark&&spot!==undefined && (spot>mark?spot-mark:mark-spot)*10000n>mark*BigInt(n.maxDeviationBps))blockers.push('DEX spot price differs from the independent reference by more than 5%.');
 return {blockers,referencePrice:mark?.toString(),spotPrice:spot?.toString(),virtualQuoteLiquidity:virtualQuote.toString()};
}
let rpcTail: Promise<unknown> = Promise.resolve();
let nextRpcAt = 0;
function pacedRpc(url: string): Transport {
 const base=http(url,{timeout:15000,retryCount:0});
 return options=>{const transport=base(options);const request: EIP1193RequestFn = ((args: any)=>{
  const operation=rpcTail.then(async()=>{const delay=Math.max(0,nextRpcAt-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));nextRpcAt=Date.now()+110;return transport.request(args);});
  rpcTail=operation.catch(()=>undefined);return operation;
 }) as EIP1193RequestFn;return {...transport,request};};
}
export function tradingService(network:VaultNetwork,n:TradingNetwork,directory:string,records:()=>Promise<RegistrationRecord[]>,client:any=createPublicClient({transport:pacedRpc(network.rpcUrl),cacheTime:0}),apiKey:()=>string|undefined=()=>process.env.PUMPCOIN_PYTH_API_KEY){
 if(n.chainId!==network.chainId || ![10143,31337].includes(n.chainId)||network.positionDecimals!==18||n.maxStaleness!==300||n.maxConfidenceBps!==100||n.maxDeviationBps!==500||n.minimumQuoteLiquidity!=='100000000')throw new Error('Invalid trading network policy.');
 const confirming=new Set<string>();
 const path=(id:string)=>{if(!/^0x[a-f0-9]{64}$/.test(id))throw new Error('Invalid registration.');return join(directory,id.slice(2)+'.json');};
 async function record(id:string){const r=(await records()).find(x=>x.id===id);if(!r?.binding||r.authorization.challenge.chainId!==n.chainId)throw new Error('Complete this agent’s vault binding first.');return r;}
 async function pin(address:Address,hash:Hex,blockNumber:bigint){const code=await client.getCode({address,blockNumber});if(!code||keccak256(code)!==hash)throw new Error('External contract code changed. Trading is blocked.');}
 async function runtime(address:Address,name:string,blockNumber:bigint){const a=artifact(name),code=await client.getCode({address,blockNumber});if(!code||normalized(code,a)!==normalized(a.deployedBytecode.object,a))throw new Error('Deployed vault infrastructure differs from the reviewed artifact.');}
 async function load(id:string){try{return JSON.parse(await readFile(path(id),'utf8')) as {address:Address;transactionHash:Hex};}catch(e){if((e as any).code==='ENOENT')return undefined;throw e;}}
 const bundleArgs=(r:RegistrationRecord)=>[r.binding!.vault,{pyth:n.pyth,monFeed:n.monFeed,usdFeed:n.usdFeed,poolManager:n.poolManager,stateView:n.stateView,fee:n.fee,tickSpacing:n.tickSpacing},r.manifest.proposedMandate.slippageBps];
 function deployData(r:RegistrationRecord){const a=artifact('VaultTradingBundle');return encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args:bundleArgs(r)});}
 async function snapshot(id:string,account?:Address){
  const r=await record(id),vault=getAddress(r.binding!.vault);const block=await client.getBlock();const b=block.number as bigint;
  if(await client.getChainId()!==n.chainId)throw new Error('Wrong RPC chain.');
  await Promise.all([[network.quote,network.quoteCodeHash],[network.position,network.positionCodeHash],[network.identityRegistry,network.identityCodeHash],[n.pyth,n.pythCodeHash],[n.pythImplementation,n.pythImplementationCodeHash],[n.poolManager,n.poolManagerCodeHash],[n.stateView,n.stateViewCodeHash]].map(([a,h])=>pin(a as Address,h as Hex,b)));
  const impl=await client.getStorageAt({address:n.pyth,slot:SLOT,blockNumber:b});if(!impl||getAddress('0x'+impl.slice(-40))!==n.pythImplementation)throw new Error('Pyth implementation changed.');
  if(network.identityImplementation){const registryImpl=await client.getStorageAt({address:network.identityRegistry,slot:SLOT,blockNumber:b});if(!registryImpl||getAddress('0x'+registryImpl.slice(-40))!==network.identityImplementation)throw new Error('Identity implementation changed.');await pin(network.identityImplementation,network.identityImplementationCodeHash!,b);}
  await runtime(vault,'PumpCoinRegisteredVault',b);
  const read=(address:Address,functionName:string,args:unknown[]=[],a:any=abi)=>client.readContract({address,abi:a,functionName,args,blockNumber:b});
  const names=['admin','manager','asset','positionAsset','strategyHash','riskHash','identityRegistry','agentId','registrationCommitment','paused','adapter','valuationSource','perTradeCap','maxPositionValue','expenseStream','expenseBudget','currentConfigHash','pending','totalSupply'];
  const vals=await Promise.all(names.map(x=>read(vault,x)));const v:any=Object.fromEntries(names.map((x,i)=>[x,vals[i]]));
  if(v.admin!==r.manifest.controller||v.manager!==r.manifest.executionKey||v.asset!==network.quote||v.positionAsset!==network.position||v.identityRegistry!==network.identityRegistry||String(v.agentId)!==r.binding!.agentId||v.registrationCommitment!==r.commitment||v.strategyHash!==keccak256(stringToHex(r.manifest.strategy.codeDigest))||v.riskHash!==keccak256(stringToHex(JSON.stringify(r.manifest.proposedMandate)))||v.perTradeCap!==BigInt(r.manifest.proposedMandate.perTradeQuoteUnits)||v.maxPositionValue!==BigInt(r.manifest.proposedMandate.maxPositionQuoteUnits)||v.expenseStream!==ZERO||v.expenseBudget!==0n)throw new Error('Current vault authority or mandate differs from the signed registration.');
  const pid=poolId(n,network.quote,network.position);
  const priceAbi=parseAbi(['function getPriceUnsafe(bytes32) view returns((int64 price,uint64 conf,int32 expo,uint256 publishTime))']);
  const poolAbi=parseAbi(['function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)','function getLiquidity(bytes32) view returns(uint128)']);
  const [mon,usd,slot,liquidity,cash,position]=await Promise.all([read(n.pyth,'getPriceUnsafe',[n.monFeed],priceAbi),read(n.pyth,'getPriceUnsafe',[n.usdFeed],priceAbi),read(n.stateView,'getSlot0',[pid],poolAbi),read(n.stateView,'getLiquidity',[pid],poolAbi),read(network.quote,'balanceOf',[vault]),read(network.position,'balanceOf',[vault])]);
  const market=marketChecks(mon,usd,block.timestamp,slot[0],liquidity,n),saved=await load(id);let bundle:any;
  if(saved){await runtime(saved.address,'VaultTradingBundle',b);const bs=await Promise.all(['vault','adapter','source','venue','gateway'].map(x=>read(saved.address,x,[],bundleAbi)));bundle={address:saved.address,vault:bs[0],adapter:bs[1],source:bs[2],venue:bs[3],gateway:bs[4]};if(bundle.vault!==vault)throw new Error('Infrastructure belongs to another vault.');for(const [key,name] of [['adapter','RestrictedSpotAdapter'],['source','DexCheckedPythVaultValuationSource'],['venue','UniswapV4VaultVenue'],['gateway','VaultInvestorGateway']])await runtime(bundle[key],name,b);}
  const blockers=[...market.blockers];if(!bundle)blockers.push('Trading infrastructure has not been deployed.');const configured=!!bundle&&v.adapter===bundle.adapter&&v.valuationSource===bundle.source;
  if(!configured)blockers.push('The complete trading configuration has not been applied through notice.');if(v.paused)blockers.push('Vault is paused.');
  let valuation=false,nav:string|undefined;if(configured){const adapterState=await Promise.all([read(bundle.adapter,'revoked',[],parseAbi(['function revoked() view returns(bool)'])),read(bundle.adapter,'allowedVenue',[],parseAbi(['function allowedVenue() view returns(address)']))]);if(adapterState[0]||adapterState[1]!==bundle.venue)blockers.push('Trading adapter is revoked or its venue differs from the reviewed route.');const status=await read(bundle.source,'status',[],sourceAbi);valuation=status[0];if(!valuation)blockers.push('On-chain valuation is unavailable.');else {nav=String(await read(vault,'totalAssets'));if(nav==='0'&&v.totalSupply>0n)blockers.push('Vault equity is unavailable for new deposits.');}}
  const owner=account?getAddress(account):undefined;const balances=owner?{quote:String(await read(network.quote,'balanceOf',[owner])),shares:String(await read(vault,'balanceOf',[owner])),maxRedeem:String(await read(vault,'maxRedeem',[owner]))}:undefined;
  if((await client.getBlock({blockNumber:b})).hash!==block.hash)throw new Error('Chain changed while checking readiness. Retry.');
  return {r,v,read,block,view:{chainId:n.chainId,vault,blockNumber:String(b),blockHash:block.hash,checkedAt:new Date().toISOString(),paused:v.paused,configured,valuation,ready:blockers.length===0,blockers,bundle,poolId:pid,poolManager:n.poolManager,monPublishedAt:String(mon.publishTime),usdPublishedAt:String(usd.publishTime),referencePrice:market.referencePrice,spotPrice:market.spotPrice,virtualQuoteLiquidity:market.virtualQuoteLiquidity,cash:String(cash),position:String(position),totalSupply:String(v.totalSupply),nav,balances,pendingAt:v.pending[2]?String(v.pending[1]):undefined,controller:v.admin,manager:v.manager,quote:network.quote,positionToken:network.position,configHash:v.currentConfigHash}};
 }
 async function plan(id:string,action:TradeAction,account:Address,amount='0'){
  const s=await snapshot(id,account),{r,v,view,block,read}=s;const from=getAddress(account);let to:Address|undefined,data:Hex,output:bigint|undefined,value=0n;
  if(['deploy','propose','apply','unpause','pause'].includes(action)&&from!==v.admin)throw new Error('Connect this vault’s controller.');
  const amountValue=/^[1-9][0-9]{0,30}$/.test(amount)?BigInt(amount):0n;const deadline=block.timestamp+300n;
  const encode=(a:any,name:string,args:unknown[]=[])=>encodeFunctionData({abi:a,functionName:name,args});
  if(action==='update-prices'){
   const key=apiKey();if(!key)throw new Error('Set PUMPCOIN_PYTH_API_KEY in app/.env.local and restart the local server. Keep the key out of the browser and chat.');
   const url=new URL('https://hermes.pyth.network/v2/updates/price/latest');url.searchParams.append('ids[]',n.monFeed);url.searchParams.append('ids[]',n.usdFeed);url.searchParams.set('encoding','hex');
   const response=await fetch(url,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!response.ok)throw new Error('Pyth did not authorize or return the requested price update. Check the server API key.');
   const text=await response.text();if(text.length>262144)throw new Error('Pyth response is too large.');const result=JSON.parse(text);
   const updates=result.binary?.data;if(result.binary?.encoding!=='hex'||!Array.isArray(updates)||updates.length===0||updates.length>8||updates.some((x:unknown)=>typeof x!=='string'||! /^(?:[a-f0-9]{2})+$/i.test(x)||x.length>131072))throw new Error('Invalid Pyth update response.');
   const dataItems=updates.map((x:string)=>`0x${x}`);const updateAbi=parseAbi(['function getUpdateFee(bytes[]) view returns(uint256)','function updatePriceFeeds(bytes[]) payable']);
   value=await read(n.pyth,'getUpdateFee',[dataItems],updateAbi);if(value>1000000000000000n)throw new Error('Oracle update fee exceeds the 0.001 MON ceiling.');to=n.pyth;data=encode(updateAbi,'updatePriceFeeds',[dataItems]);
  }
  else if(action==='deploy'){if(view.bundle)throw new Error('Infrastructure is already deployed.');data=deployData(r);}
  else {
   to=getAddress(view.vault);
   if(action==='pause')data=encode(abi,'pause');
   else {
    const b=view.bundle;if(!b)throw new Error('Deploy and verify the infrastructure first.');
    if(action==='propose'){const args={adapter:b.adapter,venue:b.venue,stream:ZERO,valuationSource:b.source,perTradeCap:v.perTradeCap,maxPositionValue:v.maxPositionValue,expenseBudget:0n,strategyHash:v.strategyHash,riskHash:v.riskHash,identityRegistry:v.identityRegistry,agentId:v.agentId};data=encode(abi,'proposeConfig',[args]);}
    else if(action==='apply'){if(!v.pending[2]||block.timestamp<v.pending[1])throw new Error('The one-day configuration notice has not elapsed.');const p=v.pending[0];if(p.adapter!==b.adapter||p.venue!==b.venue||p.valuationSource!==b.source||p.stream!==ZERO||p.expenseBudget!==0n||p.perTradeCap!==v.perTradeCap||p.maxPositionValue!==v.maxPositionValue||p.strategyHash!==v.strategyHash||p.riskHash!==v.riskHash||p.identityRegistry!==v.identityRegistry||p.agentId!==v.agentId)throw new Error('Pending configuration does not match reviewed infrastructure.');data=encode(abi,'applyConfig');}
    else if(action==='unpause'){if(!view.configured||!view.valuation||view.blockers.some((x:string)=>x!=='Vault is paused.'))throw new Error('Resolve the live pricing and DEX readiness blockers before unpausing.');data=encode(abi,'unpause');}
    else {
     if(!view.ready)throw new Error('Deposits and trading remain blocked. Refresh the readiness checks.');if(amountValue===0n)throw new Error('Enter a positive integer amount in base units.');
     const gatewayAbi=parseAbi(['function deposit(uint256,uint256,uint256) returns(uint256)','function redeem(uint256,uint256,uint256) returns(uint256)']);
     if(action==='approve-deposit'||action==='deposit'){if(amountValue>BigInt(view.balances!.quote))throw new Error('Insufficient test-USDC balance.');output=await read(to,'previewDeposit',[amountValue]);to=action==='approve-deposit'?network.quote:b.gateway;data=action==='approve-deposit'?encode(abi,'approve',[b.gateway,amountValue]):encode(gatewayAbi,'deposit',[amountValue,(output!*9990n/10000n)||1n,deadline]);}
     else if(action==='approve-redeem'||action==='redeem'){if(amountValue>BigInt(view.balances!.maxRedeem))throw new Error('Requested exit exceeds your liquid share claim.');output=await read(to,'previewRedeem',[amountValue]);to=action==='approve-redeem'?to:b.gateway;data=action==='approve-redeem'?encode(abi,'approve',[b.gateway,amountValue]):encode(gatewayAbi,'redeem',[amountValue,(output!*9990n/10000n)||1n,deadline]);}
     else if(action==='buy'||action==='sell'){if(from!==v.manager)throw new Error('Connect the declared trading manager.');const input=action==='buy'?network.quote:network.position;const out=action==='buy'?network.position:network.quote;output=await read(b.venue,'minimumOutput',[input,amountValue],parseAbi(['function minimumOutput(address,uint256) view returns(uint256)']));data=encode(abi,'managerTrade',[input,out,amountValue,output,deadline,b.venue]);}
     else throw new Error('Unsupported trading action.');
     if(output!==undefined&&output===0n)throw new Error('Amount is too small.');
    }
   }
  }
  const estimated=await client.estimateGas({account:from,to,data,value});const gas=estimated*12n/10n;const fee=gas*await client.getGasPrice()+value;const balance=await client.getBalance({address:from});
  return {chainId:n.chainId,from,to,data,value:`0x${value.toString(16)}`,gas:`0x${gas.toString(16)}`,balance:String(balance),estimatedFee:String(fee),canSubmit:balance>=fee,action,output:output?.toString(),deadline:String(deadline),scope:action==='deploy'?'Deploy valuation, fixed-pool venue, restricted adapter and investor gateway. Does not configure or unpause the vault.':action==='propose'?'Propose the full configuration. Starts a one-day notice; the vault remains paused.':`${action} on this testnet vault only. Review amount, recipient and gas in your wallet.`,blockers:balance<fee?['Fund this wallet with testnet MON for gas.']:[]};
 }
 return {inspect:async(id:string,account?:Address)=>(await snapshot(id,account)).view,plan,
  async receipt(id:string,hash:Hex){if(!/^0x[a-f0-9]{64}$/i.test(hash))throw new Error('Invalid transaction hash.');const s=await snapshot(id);const [tx,r]=await Promise.all([client.getTransaction({hash}),client.getTransactionReceipt({hash})]);const destinations=[s.view.vault,network.quote,n.pyth,s.view.bundle?.gateway].filter(Boolean).map(x=>x.toLowerCase());if(!tx.to||!destinations.includes(tx.to.toLowerCase())||(tx.value!==0n&&tx.to.toLowerCase()!==n.pyth.toLowerCase()))throw new Error('Transaction is outside this vault integration.');if((await client.getBlock({blockNumber:r.blockNumber})).hash!==r.blockHash)throw new Error('Transaction was reorganized.');return {status:r.status,blockNumber:String(r.blockNumber),transactionHash:hash};},
  async confirm(id:string,hash:Hex){if(confirming.has(id))throw new Error('Infrastructure confirmation is already running. Retry verification.');confirming.add(id);try{if(!/^0x[a-f0-9]{64}$/i.test(hash))throw new Error('Invalid transaction hash.');const r=await record(id),saved=await load(id);if(saved){if(saved.transactionHash!==hash)throw new Error('This agent already has infrastructure.');return (await snapshot(id)).view;}
   const [tx,receipt]=await Promise.all([client.getTransaction({hash}),client.getTransactionReceipt({hash})]);if(receipt.status!=='success'||!receipt.contractAddress||tx.to!==null||tx.from.toLowerCase()!==r.manifest.controller.toLowerCase()||tx.value!==0n||tx.input!==deployData(r))throw new Error('This is not the exact successful controller infrastructure deployment.');
   const block=await client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)throw new Error('Deployment was reorganized.');await runtime(receipt.contractAddress,'VaultTradingBundle',receipt.blockNumber);
   await mkdir(directory,{recursive:true,mode:0o700});const file=path(id),tmp=file+'.'+randomBytes(8).toString('hex')+'.tmp';await writeFile(tmp,JSON.stringify({address:getAddress(receipt.contractAddress),transactionHash:hash})+'\n',{mode:0o600,flag:'wx'});await rename(tmp,file);return (await snapshot(id)).view;
  }finally{confirming.delete(id);}}
 };
}
