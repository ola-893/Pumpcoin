import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPublicClient,createWalletClient,http,encodeAbiParameters,parseAbiParameters,decodeFunctionData,keccak256,getAddress,parseAbi,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {foundry} from 'viem/chains';
import {initialDraft,prepareManifest} from '../app/src/lib/registration.js';
import {strategyBindingHash,riskBindingHash} from '../agent-registration/core.js';
import {tradingService,type TradingNetwork} from '../agent-registration/trading.js';
import type {VaultNetwork} from '../agent-registration/vault-setup.js';
import type {RegistrationRecord} from '../agent-registration/types.js';
const artifact=(name:string)=>{const owner:Record<string,string>={RegistrationTokenFixture:'PumpCoinRegisteredVault.t',RegistrationRegistryFixture:'PumpCoinRegisteredVault.t',TradingPythFixture:'VaultTradingIntegration.t',TradingRouterFixture:'VaultTradingIntegration.t',PoolStateFixture:'PythPoolGuard.t',DexCheckedPythVaultValuationSource:'PythVaultValuationSource',ChainlinkProxyFixture:'ChainlinkVaultValuationSource.t',SupraProofFixture:'SupraPythVaultValuationSource.t'};return JSON.parse(readFileSync(new URL(`../contracts/out/${owner[name]??name}.sol/${name}.json`,import.meta.url),'utf8'));};
for(const oracle of ['supra-pyth'] as ('pyth'|'chainlink'|'supra-pyth')[]) test(`${oracle}: reviewed infrastructure, notice, deposit, manager trade and investor exit persist and fail closed`,{timeout:90000},async()=>{
 const port=19000+Math.floor(Math.random()*1000),directory=await mkdtemp(join(tmpdir(),'pumpcoin-trading-service-'));
 const child=spawn('/Users/deonorla/.foundry/bin/anvil',['--port',String(port),'--silent'],{stdio:'ignore'});
 try{
  const transport=http(`http://127.0.0.1:${port}`),client=createPublicClient({chain:foundry,transport,cacheTime:0});
  const account=privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const manager=privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const wallet=createWalletClient({chain:foundry,transport,account}),managerWallet=createWalletClient({chain:foundry,transport,account:manager});
  for(let i=0;i<100;i++){try{await client.getChainId();break;}catch{await new Promise(r=>setTimeout(r,50));}}
  const deploy=async(name:string,args:unknown[]=[])=>{const a=artifact(name);const h=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object,args});const r=await client.waitForTransactionReceipt({hash:h});assert.equal(r.status,'success');return getAddress(r.contractAddress!);};
  const write=async(address:Address,name:string,fn:string,args:unknown[]=[])=>{const hash=await wallet.writeContract({address,abi:artifact(name).abi,functionName:fn,args});const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return hash;};
  const quote=await deploy('RegistrationTokenFixture',[6]),position=await deploy('RegistrationTokenFixture',[18]),registry=await deploy('RegistrationRegistryFixture');assert.ok(quote.toLowerCase()<position.toLowerCase());
  const prepared=prepareManifest({...initialDraft,name:'Trading service fixture',controller:account.address,executionKey:manager.address,model:'fixture-local',modelSource:'https://example.com/model',weightsHash:'a'.repeat(64),runtimeHash:'b'.repeat(64),strategy:'Paper-only admission fixture; manager transactions below are scripted.',strategyCodeHash:'c'.repeat(64),pair:'WMON / USDC',tradeCap:'10',exposureCap:'50',selfHosted:true});
  const vault=await deploy('PumpCoinRegisteredVault',[{quote,position,controller:account.address,manager:manager.address,strategy:strategyBindingHash(prepared),risk:riskBindingHash(prepared),tradeCap:10_000000n,positionCap:50_000000n,registry,uri:'data:application/json;base64,e30=',commitment:prepared.commitment}]);
  const pyth=await deploy('TradingPythFixture'),stateView=await deploy('PoolStateFixture'),poolManager=await deploy('TradingRouterFixture');
  const monFeed=keccak256('0x01'),usdFeed=keccak256('0x02');
  await client.request({method:'anvil_setStorageAt' as any,params:[pyth,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc','0x'+'0'.repeat(24)+pyth.slice(2)] as any});
  const monOracle=oracle==='chainlink'?await deploy('ChainlinkProxyFixture',['MON / USD',8]):undefined;
  const usdOracle=oracle==='chainlink'?await deploy('ChainlinkProxyFixture',['USDC / USD',6]):undefined;
  const supra=await deploy('SupraProofFixture');let hybridSource:Address|undefined;
  const fresh=async()=>{if(oracle==='chainlink'){const block=await client.getBlock();await write(monOracle!,'ChainlinkProxyFixture','set',[200000000n,block.timestamp]);await write(usdOracle!,'ChainlinkProxyFixture','set',[1000000n,block.timestamp]);return;}const block=await client.getBlock();await write(pyth,'TradingPythFixture','set',[monFeed,200000000n,1000n,-8,block.timestamp]);await write(pyth,'TradingPythFixture','set',[usdFeed,100000000n,1000n,-8,block.timestamp]);
   if(hybridSource){const proof=encodeAbiParameters(parseAbiParameters('bool,(uint256[] pairs,uint256[] prices,uint256[] timestamp,uint256[] decimal,uint256[] round)'),[true,{pairs:[569n,48n],prices:[2n*10n**18n,100000000n],timestamp:[block.timestamp*1000n,block.timestamp*1000n],decimal:[18n,8n],round:[1n,1n]}]);await write(hybridSource,'SupraPythVaultValuationSource','updateMon',[proof]);}
};await fresh();
  await write(stateView,'PoolStateFixture','set',[56022770974786139918731938227458171n,1000000000000000n]);
  const codeHash=async(address:Address)=>keccak256((await client.getCode({address}))!);
  const network:VaultNetwork={chainId:31337,rpcUrl:`http://127.0.0.1:${port}`,identityRegistry:registry,identityCodeHash:await codeHash(registry),quote,quoteCodeHash:await codeHash(quote),position,positionCodeHash:await codeHash(position),positionDecimals:18};
  const legacy:TradingNetwork={chainId:31337,pyth,pythCodeHash:await codeHash(pyth),pythImplementation:pyth,pythImplementationCodeHash:await codeHash(pyth),poolManager,poolManagerCodeHash:await codeHash(poolManager),stateView,stateViewCodeHash:await codeHash(stateView),monFeed,usdFeed,fee:3000,tickSpacing:60,maxStaleness:300,maxConfidenceBps:100,maxDeviationBps:500,minimumQuoteLiquidity:'100000000'};
  const pinFeed=async(proxy:Address)=>{const aggregator=await client.readContract({address:proxy,abi:artifact('ChainlinkProxyFixture').abi,functionName:'aggregator'}) as Address;return {proxy,aggregator,proxyCodeHash:await codeHash(proxy),aggregatorCodeHash:await codeHash(aggregator),decimals:proxy===monOracle?8:6};};
  const n:TradingNetwork=oracle==='supra-pyth'?{...legacy,oracle:'supra-pyth',supra,supraCodeHash:await codeHash(supra)}:oracle==='pyth'?legacy:{chainId:legacy.chainId,oracle:'chainlink',monOracle:await pinFeed(monOracle!),usdOracle:await pinFeed(usdOracle!),poolManager,poolManagerCodeHash:legacy.poolManagerCodeHash,stateView,stateViewCodeHash:legacy.stateViewCodeHash,fee:3000,tickSpacing:60,maxStaleness:300,maxConfidenceBps:100,maxDeviationBps:500,minimumQuoteLiquidity:'100000000'};
  const id=('0x'+'a'.repeat(64)) as Hex;const record={id,manifest:prepared.manifest,commitment:prepared.commitment,authorization:{challenge:{chainId:31337}},binding:{vault,agentId:'1'}} as RegistrationRecord;
  const service=tradingService(network,n,directory,async()=>[record],client);
  assert.equal((await service.inspect(id)).vaultRuntimeCompatible,true);
  const incompatibleClient={...client,getCode:async(args:any)=>args.address.toLowerCase()===vault.toLowerCase()?'0x00':client.getCode(args)};
  const incompatible=tradingService(network,n,directory,async()=>[record],incompatibleClient);
  assert.equal((await incompatible.inspect(id)).vaultRuntimeCompatible,false);
  await assert.rejects(incompatible.plan(id,'deploy',account.address),/compatible vault is required/);
  assert.equal((await service.inspect(id)).ready,false);await assert.rejects(service.plan(id,'deploy',manager.address),/controller/);
  const send=async(action:any,amount='0',asManager=false)=>{const plan=await service.plan(id,action,asManager?manager.address:account.address,amount);const signer=asManager?managerWallet:wallet;const hash=await signer.sendTransaction({to:plan.to,data:plan.data,value:BigInt(plan.value),gas:BigInt(plan.gas)});const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,'success');return hash;};
  if(oracle==='chainlink'){
   await assert.rejects(service.plan(id,'update-prices',account.address),/automatically/);
   const missing=tradingService(network,{...n,oracle:'chainlink',monOracle:null},directory,async()=>[record],client);
   assert.ok((await missing.inspect(id)).blockers.some(x=>x.includes('verified Chainlink MON/USD')));
   await assert.rejects(missing.plan(id,'deploy',account.address),/addresses are required/);
  }
  const hash=await send('deploy');await service.confirm(id,hash);await service.confirm(id,hash);await assert.rejects(service.plan(id,'deploy',account.address),/already/);
  hybridSource=(await service.inspect(id)).bundle!.source;await fresh();
  const restarted=tradingService(network,n,directory,async()=>[record],client);assert.ok((await restarted.inspect(id)).bundle);
  await send('propose');await assert.rejects(service.plan(id,'apply',account.address),/configuration.*ready/);
  await client.request({method:'evm_increaseTime' as any,params:[86401] as any});await client.request({method:'evm_mine' as any,params:[] as any});await fresh();
  await send('apply');assert.equal((await service.inspect(id)).paused,true);await send('unpause');assert.equal((await service.inspect(id)).ready,true);
  await write(quote,'RegistrationTokenFixture','mint',[account.address,20_000000n]);await send('approve-deposit','20000000');const deposited=await send('deposit','20000000');assert.equal((await service.receipt(id,deposited)).status,'success');
  assert.equal((await service.inspect(id,account.address)).balances!.shares,'20000000000000');
  await assert.rejects(service.plan(id,'buy',manager.address,'1000000'),'new vault refuses manager trades before controller permission');
  const permissionConfig=await client.readContract({address:vault,abi:artifact('PumpCoinRegisteredVault').abi,functionName:'currentConfigHash'});
  await write(vault,'PumpCoinRegisteredVault','grantTradingPermission',[manager.address,permissionConfig,(await client.getBlock()).timestamp+604800n,20_000000n,prepared.manifest.proposedMandate.slippageBps]);
  await assert.rejects(service.plan(id,'buy',account.address,'1000000'),/manager/);
  // Quotes exercise the complete swap without spending cash, shares or permission budget.
  const before=await service.inspect(id,account.address);
  const buyQuote=await service.plan(id,'buy',manager.address,'1000000');
  assert.equal(buyQuote.output,'500000000000000000');assert.equal(buyQuote.quote!.expectedOutput,buyQuote.output);
  assert.equal(buyQuote.quote!.minimumOutput,'497500000000000000');assert.equal(buyQuote.quote!.amountIn,'1000000');
  assert.equal(decodeFunctionData({abi:artifact('PumpCoinRegisteredVault').abi,data:buyQuote.data}).args![3],497500000000000000n);
  assert.equal((await service.inspect(id)).cash,before.cash);assert.equal((await service.inspect(id)).position,before.position);
  await write(poolManager,'TradingRouterFixture','setHaircut',[25n]);
  const feeQuote=await service.plan(id,'buy',manager.address,'1000000');assert.equal(feeQuote.output,'498750000000000000');assert.equal(feeQuote.quote!.minimumOutput,'497500000000000000');
  if(oracle==='chainlink'&&process.env.PUMPCOIN_QUOTE_EVIDENCE_FILE)await writeFile(process.env.PUMPCOIN_QUOTE_EVIDENCE_FILE,JSON.stringify({mode:'local-anvil-fixture',plan:feeQuote},null,2));
  // The encoded deadline expires independently of the browser countdown.
  const checkpoint=await client.request({method:'evm_snapshot' as any,params:[] as any});
  assert.ok(buyQuote.quote!.expiresAt<=Date.now()+30000,'browser review remains bounded to 30 seconds');
  await client.request({method:'evm_increaseTime' as any,params:[31] as any});await client.request({method:'evm_mine' as any,params:[] as any});
  assert.ok(await client.estimateGas({account:manager.address,to:buyQuote.to,data:buyQuote.data}),'RPC preparation does not consume the entire on-chain deadline');
  await client.request({method:'evm_increaseTime' as any,params:[90] as any});await client.request({method:'evm_mine' as any,params:[] as any});
  await assert.rejects(client.estimateGas({account:manager.address,to:buyQuote.to,data:buyQuote.data}));
  await client.request({method:'evm_revert' as any,params:[checkpoint] as any});
  // A previously reviewed swap cannot execute after the pool moves through its minimum.
  await write(poolManager,'TradingRouterFixture','setHaircut',[100n]);
  await assert.rejects(client.estimateGas({account:manager.address,to:buyQuote.to,data:buyQuote.data}));
  await assert.rejects(service.plan(id,'buy',manager.address,'1000000'));
  await write(poolManager,'TradingRouterFixture','setHaircut',[0n]);
  await write(vault,'PumpCoinRegisteredVault','grantTradingPermission',[manager.address,await client.readContract({address:vault,abi:artifact('PumpCoinRegisteredVault').abi,functionName:'currentConfigHash'}),(await client.getBlock()).timestamp+604800n,20_000000n,25]);
  const tighter=await service.plan(id,'buy',manager.address,'1000000');assert.equal(tighter.quote!.slippageBps,25);assert.equal(tighter.quote!.minimumOutput,'498750000000000000');
  await send('buy','1000000',true);
  const sellQuote=await service.plan(id,'sell',manager.address,'500000000000000000');assert.equal(sellQuote.quote!.expectedOutput,'1000000');assert.equal(sellQuote.quote!.minimumOutput,'997500');
  await send('sell','500000000000000000',true);
  await send('approve-redeem','20000000000000');await send('redeem','20000000000000');assert.equal((await service.inspect(id,account.address)).balances!.shares,'0');
  await client.request({method:'evm_increaseTime' as any,params:[301] as any});await client.request({method:'evm_mine' as any,params:[] as any});assert.equal((await service.inspect(id)).ready,false);await assert.rejects(service.plan(id,'deposit',account.address,'1000000'),/blocked/);
  if(oracle==='chainlink'){await write(monOracle!,'ChainlinkProxyFixture','setAggregator',[usdOracle!]);await assert.rejects(service.inspect(id),/aggregator changed/);await write(monOracle!,'ChainlinkProxyFixture','setAggregator',[(n as any).monOracle.aggregator]);}
  await client.request({method:'anvil_setCode' as any,params:[poolManager,'0x60006000fd'] as any});await assert.rejects(service.inspect(id),/code changed/);
 }finally{child.kill('SIGTERM');await rm(directory,{recursive:true,force:true});}
});
