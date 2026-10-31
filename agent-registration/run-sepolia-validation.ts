import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createPublicClient,http,encodeDeployData,encodeFunctionData,parseAbi,keccak256,stringToHex,getAddress,type Address,type Hex,type Abi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {sepolia} from 'viem/chains';
import {configuredSigner} from './signer.js';
import {normalized} from './vault-setup.js';
import {sepoliaStep} from './sepolia-step.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const MAX_GAS=1000000000000000n,MAX_LP_NATIVE=100000000000000n;
const ZERO='0x0000000000000000000000000000000000000000';
const tokenAbi=parseAbi(['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)']);
const readAbi=parseAbi(['function source() view returns(address)','function adapter() view returns(address)','function venue() view returns(address)','function gateway() view returns(address)','function poolId() view returns(bytes32)','function agentId() view returns(uint256)','function currentConfigHash() view returns(bytes32)','function referencePrice() view returns(uint256)','function totalSupply() view returns(uint256)','function status() view returns(bool,bytes32)']);
const artifact=async(name:string)=>JSON.parse(await readFile(join(root,`contracts/out/${name}.sol/${name}.json`),'utf8'));
function sqrt(n:bigint){if(n<2n)return n;let x=n,y=(x+1n)/2n;while(y<x){x=y;y=(x+n/x)/2n;}return x;}

let stage="preflight";
async function main(){
 if(process.argv.slice(2).some(x=>x!=='--broadcast'))throw new Error('Use execution:sepolia [--broadcast].');
 const broadcast=process.argv.includes('--broadcast'),env=parseEnv(await readFile(join(root,'.env'),'utf8'));
 const rawKey=env.PRIVATE_KEY;if(!rawKey||! /^(0x)?[a-f0-9]{64}$/i.test(rawKey))throw new Error('A valid local controller PRIVATE_KEY is required.');
 for(const key of ['PUMPCOIN_SIGNER_PASSWORD_FILE','PUMPCOIN_SIGNER_DIRECTORY'])if(env[key]&&!process.env[key])process.env[key]=env[key];
 const controller=privateKeyToAccount((rawKey.startsWith('0x')?rawKey:'0x'+rawKey) as Hex);
 const n=JSON.parse(await readFile(join(root,'deployments/pumpcoin-sepolia-vault-network.json'),'utf8'));
 const m=JSON.parse(await readFile(join(root,'deployments/pumpcoin-sepolia-trading-network.json'),'utf8'));
 const client=createPublicClient({chain:sepolia,transport:http(n.rpcUrl,{retryCount:0,timeout:20000})});
 if(n.chainId!==11155111||m.chainId!==11155111||await client.getChainId()!==11155111)throw new Error('Validation is restricted to the reviewed Sepolia profile.');
 for(const [address,hash] of [[n.identityRegistry,n.identityCodeHash],[n.quote,n.quoteCodeHash],[n.position,n.positionCodeHash],[m.poolManager,m.poolManagerCodeHash],[m.stateView,m.stateViewCodeHash]])if(keccak256((await client.getCode({address}))??'0x')!==hash)throw new Error('A reviewed external deployment pin changed.');
 const names=['PumpCoinSepoliaDemoRegisteredVault','SepoliaChainlinkVaultTradingBundle','TestnetPoolFunder','NativeVaultInvestorGateway'];
 const artifacts=Object.fromEntries(await Promise.all(names.map(async name=>[name,await artifact(name)])));
 const signer=await configuredSigner();if(!signer)throw new Error('Configure the encrypted execution signer before validation.');
 try{
 const manager=await signer.provision(controller.address,'Pump RYO Sepolia execution validation');
 const managerAccount=await signer.account(controller.address,'Pump RYO Sepolia execution validation');
 const manifest={version:'PUMPCOIN-SEPOLIA-EXECUTION-VALIDATION-v1',name:'Pump RYO execution validation — infrastructure only',chainId:11155111,controller:controller.address,executionKey:manager,modelInference:false,ryoEvidence:false,purpose:'Controller-driven testnet plumbing validation. No AI agent enrollment or performance claim.',strategy:'Buy 0.01 test-USDC of WETH, sell the acquired WETH, redeem capital. Fixed infrastructure test, not an AI recommendation.',risk:{tradeCapQuoteUnits:'100000',positionCapQuoteUnits:'1000000',slippageBps:50,maximumGasWei:String(MAX_GAS),maximumLpNativeWei:String(MAX_LP_NATIVE),maximumLpQuoteUnits:'200000',capitalDepositQuoteUnits:'1000000',nativeInvestmentWei:'1000000000000'},network:n,market:m,creationHashes:Object.fromEntries(names.map(name=>[name,keccak256(artifacts[name].bytecode.object)]))};
 const commitment=keccak256(stringToHex(JSON.stringify(manifest))),strategy=keccak256(stringToHex(manifest.strategy)),risk=keccak256(stringToHex(JSON.stringify(manifest.risk)));
 const directory=join(root,'.local/sepolia-execution',commitment.slice(2));
 const estimate=await client.estimateFeesPerGas();
 console.log(JSON.stringify({state:broadcast?'starting':'preflight',chainId:11155111,controller:controller.address,manager,commitment,maximumGasWei:String(MAX_GAS),maximumNativeValueWei:String(MAX_LP_NATIVE+51000000000000n),maximumQuoteUnits:'1200000',balanceWei:String(await client.getBalance({address:controller.address})),feeCeilingWei:String(estimate.maxFeePerGas),scope:manifest.purpose}));
 if(!broadcast)return;
 const steps:Awaited<ReturnType<typeof sepoliaStep>>[]=[];let spent=0n;
 const read=(address:Address,functionName:string,args:unknown[]=[],abi:Abi=readAbi)=>client.readContract({address,abi,functionName,args} as any) as Promise<any>;
 const step=async(name:string,build:()=>Promise<{to?:Address;data:Hex;value?:bigint}>,account=controller)=>{stage=name;const result=await sepoliaStep({directory,step:name,account,client,remainingGasWei:MAX_GAS-spent,build});steps.push(result);spent+=BigInt(result.gasPaidWei);console.log(JSON.stringify({state:'confirmed',...result}));return result;};
 const call=(name:string,to:Address,abi:Abi,functionName:string,args:()=>Promise<unknown[]>|unknown[],value=0n,account=controller)=>step(name,async()=>({to,data:encodeFunctionData({abi,functionName,args:await args()} as any),value}),account);
 async function deploy(stepName:string,name:string,args:()=>Promise<unknown[]>){const a=artifacts[name],r=await step(stepName,async()=>({data:encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args:await args()})}));if(!r.address)throw new Error('Missing deployment address.');const code=await client.getCode({address:r.address,blockNumber:BigInt(r.blockNumber)});if(!code||normalized(code,a.deployedBytecode.immutableReferences)!==normalized(a.deployedBytecode.object,a.deployedBytecode.immutableReferences))throw new Error('Deployed runtime differs from its reviewed artifact.');return getAddress(r.address);}
 // Keep on-chain registry metadata compact. The complete immutable manifest is
 // committed by hash and included in the public receipt package, not duplicated
 // as a large storage string inside the identity registry.
 const uri='data:application/json;base64,'+Buffer.from(JSON.stringify({name:'Pump RYO execution validation',type:'infrastructure-validation',chainId:11155111,modelInference:false,manifestCommitment:commitment,evidencePath:'deployments/ryo-sepolia-execution.json'})).toString('base64');
 const vault=await deploy('deploy-vault',names[0],async()=>[{quote:n.quote,position:n.position,controller:controller.address,manager,strategy,risk,tradeCap:100000n,positionCap:1000000n,registry:n.identityRegistry,uri,commitment}]);
 const bundle=await deploy('deploy-trading',names[1],async()=>[vault,{nativeFeed:m.monOracle,usdFeed:m.usdOracle,poolManager:m.poolManager,stateView:m.stateView,fee:m.fee,tickSpacing:m.tickSpacing},50]);
 const source=getAddress(await read(bundle,'source')),adapter=getAddress(await read(bundle,'adapter')),venue=getAddress(await read(bundle,'venue')),gateway=getAddress(await read(bundle,'gateway'));
 const funder=await deploy('deploy-pool-funder',names[2],async()=>[controller.address,n.quote,n.position,m.poolManager,m.stateView,source,m.fee,m.tickSpacing]);
 await call('approve-pool-quote',n.quote,tokenAbi,'approve',()=>[funder,200000n]);
 const funderAbi=(await artifact('TestnetPoolFunder')).abi,vaultAbi=artifacts[names[0]].abi,venueAbi=(await artifact('UniswapV4VaultVenue')).abi,gatewayAbi=(await artifact('VaultInvestorGateway')).abi;
 await call('seed-pool',funder,funderAbi,'seed',async()=>{const mark=BigInt(await read(source,'referencePrice')),poolId=await read(source,'poolId'),[existing,tick]=await read(m.stateView,'getSlot0',[poolId],parseAbi(['function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)']));const price=existing===0n?sqrt(10n**18n*(1n<<192n)/mark):existing;const current=existing===0n?Math.floor(2*Math.log(Number(price)/Number(1n<<96n))/Math.log(1.0001)):Number(tick);const lower=Math.floor(current/m.tickSpacing)*m.tickSpacing;return [(125000000n*price+(1n<<96n)-1n)/(1n<<96n),lower,lower+2*m.tickSpacing,200000n,(await client.getBlock()).timestamp+300n];},MAX_LP_NATIVE);
 if(!(await read(source,'status'))[0])throw new Error('Public demo pool is not healthy.');
 await call('propose-config',vault,vaultAbi,'proposeDemoConfig',async()=>[{adapter,venue,stream:ZERO,valuationSource:source,perTradeCap:100000n,maxPositionValue:1000000n,expenseBudget:0n,strategyHash:strategy,riskHash:risk,identityRegistry:n.identityRegistry,agentId:await read(vault,'agentId')}]);
 await call('apply-config',vault,vaultAbi,'applyConfig',()=>[]);
 await call('unpause',vault,vaultAbi,'unpause',()=>[]);
 await call('approve-capital',n.quote,tokenAbi,'approve',()=>[gateway,1000000n]);
 await call('deposit-capital',gateway,gatewayAbi,'deposit',async()=>[1000000n,1n,(await client.getBlock()).timestamp+300n]);
 await call('grant-test-permission',vault,vaultAbi,'grantTradingPermission',async()=>[manager,await read(vault,'currentConfigHash'),(await client.getBlock()).timestamp+3600n,100000n,50]);
 await step('fund-execution-gas',async()=>({to:manager,data:'0x',value:50000000000000n}));
 await call('buy-weth',vault,vaultAbi,'managerTrade',async()=>[n.quote,n.position,10000n,await read(venue,'minimumOutput',[n.quote,10000n],venueAbi),(await client.getBlock()).timestamp+300n,venue],0n,managerAccount);
 await call('sell-weth',vault,vaultAbi,'managerTrade',async()=>{const bought=await read(n.position,'balanceOf',[vault],tokenAbi);if(bought<=0n)throw new Error('No acquired WETH is available to sell.');return [n.position,n.quote,bought,await read(venue,'minimumOutput',[n.position,bought],venueAbi),(await client.getBlock()).timestamp+300n,venue];},0n,managerAccount);
 const nativeGateway=await deploy('deploy-native-gateway',names[3],async()=>[vault,m.poolManager,source,m.fee,m.tickSpacing,50]);
 const nativeAbi=artifacts[names[3]].abi;
 // The seed is tracked separately. Native deposit/redeem shares come from the exact deposit event.
 await call('invest-eth',nativeGateway,nativeAbi,'depositMON',async()=>[1n,1n,(await client.getBlock()).timestamp+300n],1000000000000n);
 const nativeDeposit=await client.getTransactionReceipt({hash:steps.find(x=>x.step==='invest-eth')!.hash});
 const {decodeEventLog}=await import('viem');let investorShares=0n;
 for(const log of nativeDeposit.logs)if(log.address.toLowerCase()===vault.toLowerCase()){try{const e=decodeEventLog({abi:vaultAbi,data:log.data,topics:log.topics}) as any;if(e.eventName==='Deposit')investorShares+=BigInt(e.args.shares);}catch{/* Other vault events. */}}
 if(investorShares<=0n)throw new Error('Native investment did not mint verified Pump shares.');
 await call('approve-native-redemption',vault,tokenAbi,'approve',()=>[nativeGateway,investorShares]);
 await call('redeem-eth',nativeGateway,nativeAbi,'redeemMON',async()=>{const q=await read(vault,'previewRedeem',[investorShares],vaultAbi);const minimum=await read(nativeGateway,'minimumOutput',[n.quote,q*9990n/10000n],nativeAbi);return [investorShares,q*9990n/10000n,minimum*9990n/10000n,(await client.getBlock()).timestamp+300n];});
 await call('approve-capital-redemption',vault,tokenAbi,'approve',async()=>[gateway,await read(vault,'balanceOf',[controller.address],tokenAbi)]);
 await call('redeem-capital',gateway,gatewayAbi,'redeem',async()=>[await read(vault,'balanceOf',[controller.address],tokenAbi),990000n,(await client.getBlock()).timestamp+300n]);
 await call('revoke-test-permission',vault,vaultAbi,'revokeTradingPermission',()=>[]);
 await client.waitForTransactionReceipt({hash:steps.at(-1)!.hash,confirmations:2,timeout:120000});
 for(const s of steps)if((await client.getBlock({blockNumber:BigInt(s.blockNumber)})).hash!==s.blockHash)throw new Error('A validation receipt was reorganized.');
 const supply=String(await read(vault,'totalSupply')),position=String(await read(n.position,'balanceOf',[vault],tokenAbi));if(supply!=='0'||position!=='0')throw new Error('End-state invariant failed: outstanding shares or position.');
 const contracts:Record<string,unknown>={};for(const [name,address] of Object.entries({vault,bundle,source,adapter,venue,gateway,funder,nativeGateway}))contracts[name]={address,runtimeCodeHash:keccak256((await client.getCode({address}))!)};
 const events=[];for(const step of steps){const receipt=await client.getTransactionReceipt({hash:step.hash});for(const log of receipt.logs){const abi=log.address.toLowerCase()===vault.toLowerCase()?vaultAbi:log.address.toLowerCase()===nativeGateway.toLowerCase()?nativeAbi:undefined;if(abi)try{const event=decodeEventLog({abi,data:log.data,topics:log.topics}) as any;if(['ManagerTrade','Deposit','Withdraw','NativeDeposit','NativeRedemption'].includes(event.eventName))events.push({step:step.step,transactionHash:step.hash,logIndex:log.logIndex,event:event.eventName,values:JSON.parse(JSON.stringify(event.args,(_,v)=>typeof v==='bigint'?String(v):v))});}catch{/* Unrelated events. */}}}
 const result={version:'PUMPCOIN-SEPOLIA-EXECUTION-PROOF-v1',manifest,commitment,verifiedAt:new Date().toISOString(),chainId:11155111,contracts,steps,events,gasPaidWei:String(spent),endState:{totalShares:supply,positionUnits:position,quoteUnits:String(await read(n.quote,'balanceOf',[vault],tokenAbi)),permissionRevoked:true},scope:'Public testnet receipts for controller-driven infrastructure validation. Project-funded demo liquidity. No RYO-price coverage, AI inference or investment-performance claim.'};
 await mkdir(join(root,'deployments'),{recursive:true});await writeFile(join(root,'deployments/ryo-sepolia-execution.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({state:'verified',proof:'deployments/ryo-sepolia-execution.json',contracts,gasPaidWei:String(spent)}));
 }finally{signer.close();}
}
main().catch(error=>{if(error?.constructor===Error&&error.message.length<160&&!/0x|PRIVATE_KEY|\/Users|\/private|credential|password/i.test(error.message))console.error(error.message);console.error(`Sepolia validation stopped at ${stage}. Inspect the private signed-step journal and chain receipts before retrying. No pending transaction is replaced automatically.`);process.exitCode=1;});
