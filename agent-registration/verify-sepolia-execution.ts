import {readFile} from 'node:fs/promises';
import {createPublicClient,http,keccak256,stringToHex,decodeEventLog,parseAbi,type Address} from 'viem';
import {sepolia} from 'viem/chains';

/** Read-only reproduction from public receipts. Does not load .env or sign. */
async function main(){
 const root=new URL('../',import.meta.url),proof=JSON.parse(await readFile(new URL('deployments/ryo-sepolia-execution.json',root),'utf8'));
 const fail=():never=>{throw new Error('Public Sepolia evidence differs from canonical chain state.');};
 if(proof.version!=='PUMPCOIN-SEPOLIA-EXECUTION-PROOF-v1'||proof.chainId!==11155111||keccak256(stringToHex(JSON.stringify(proof.manifest)))!==proof.commitment||proof.manifest.modelInference!==false||proof.manifest.ryoEvidence!==false)fail();
 const client=createPublicClient({chain:sepolia,transport:http(proof.manifest.network.rpcUrl,{retryCount:0,timeout:20000})});
 if(await client.getChainId()!==11155111)fail();
 const vault=proof.contracts.vault.address as Address,native=proof.contracts.nativeGateway.address as Address;
 const artifact=async(name:string)=>JSON.parse(await readFile(new URL(`contracts/out/${name}.sol/${name}.json`,root),'utf8'));
 const vaultAbi=(await artifact('PumpCoinSepoliaDemoRegisteredVault')).abi,nativeAbi=(await artifact('NativeVaultInvestorGateway')).abi;
 const events=[];let gas=0n;
 const steps=new Set<string>();let last=0n;
 for(const s of proof.steps){
  if(steps.has(s.step))fail();steps.add(s.step);
  const [receipt,tx]=await Promise.all([client.getTransactionReceipt({hash:s.hash}),client.getTransaction({hash:s.hash})]);
  const sender=['buy-weth','sell-weth'].includes(s.step)?proof.manifest.executionKey:proof.manifest.controller;
  if(receipt.status!=='success'||receipt.blockHash!==s.blockHash||String(receipt.blockNumber)!==s.blockNumber||(await client.getBlock({blockNumber:receipt.blockNumber})).hash!==s.blockHash||tx.from.toLowerCase()!==sender.toLowerCase()||String(tx.value)!==s.valueWei||String(receipt.gasUsed*receipt.effectiveGasPrice)!==s.gasPaidWei)fail();
  gas+=receipt.gasUsed*receipt.effectiveGasPrice;if(receipt.blockNumber>last)last=receipt.blockNumber;
  for(const log of receipt.logs){const abi=log.address.toLowerCase()===vault.toLowerCase()?vaultAbi:log.address.toLowerCase()===native.toLowerCase()?nativeAbi:undefined;if(abi)try{const e=decodeEventLog({abi,data:log.data,topics:log.topics}) as any;if(['ManagerTrade','Deposit','Withdraw','NativeDeposit','NativeRedemption'].includes(e.eventName))events.push({step:s.step,transactionHash:s.hash,logIndex:log.logIndex,event:e.eventName,values:JSON.parse(JSON.stringify(e.args,(_,v)=>typeof v==='bigint'?String(v):v))});}catch{/* Other receipt events. */}}
 }
 for(const name of ['deploy-vault','seed-pool','deposit-capital','buy-weth','sell-weth','invest-eth','redeem-eth','redeem-capital','revoke-test-permission'])if(!steps.has(name))fail();
 if(gas>BigInt(proof.manifest.risk.maximumGasWei)||String(gas)!==proof.gasPaidWei||JSON.stringify(events)!==JSON.stringify(proof.events))fail();
 for(const c of Object.values(proof.contracts) as {address:Address;runtimeCodeHash:string}[])if(keccak256((await client.getCode({address:c.address,blockNumber:last}))??'0x')!==c.runtimeCodeHash)fail();
 const read=(functionName:string)=>client.readContract({address:vault,abi:vaultAbi,functionName,blockNumber:last} as any) as Promise<any>;
 const supply=await read('totalSupply'),permission=await read('tradingPermission'),commitment=await read('registrationCommitment');
 if(supply!==0n||permission[0]!==0n||commitment!==proof.commitment||proof.endState.totalShares!=='0'||proof.endState.permissionRevoked!==true)fail();
 const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)']);
 const balance=(address:Address)=>client.readContract({address,abi:tokenAbi,functionName:'balanceOf',args:[vault],blockNumber:last});
 const [position,quote]=await Promise.all([balance(proof.manifest.network.position),balance(proof.manifest.network.quote)]);
 if(position!==0n||String(position)!==proof.endState.positionUnits||String(quote)!==proof.endState.quoteUnits)fail();
 // Reconcile shares independently from Deposit and Withdraw events.
 let shares=0n;for(const e of events)if(e.event==='Deposit')shares+=BigInt(e.values.shares);else if(e.event==='Withdraw')shares-=BigInt(e.values.shares);if(shares!==0n)fail();
 const invested=events.find(e=>e.event==='NativeDeposit'),redeemed=events.find(e=>e.event==='NativeRedemption');
 if(!invested||!redeemed)throw new Error('Native lifecycle events are missing.');
 if(invested.values.shares!==redeemed.values.shares||BigInt(redeemed.values.mon)<=0n)fail();
 console.log(JSON.stringify({verified:true,chainId:11155111,receiptCount:proof.steps.length,confirmedThroughBlock:String(last),gasPaidWei:String(gas),nativeInvestmentWei:invested.values.mon,nativeReturnedWei:redeemed.values.mon,sharesMintedAndBurned:invested.values.shares,endShares:String(supply),scope:proof.scope},null,2));
}
main().catch(()=>{console.error('Sepolia evidence verification failed or a required public RPC response is unavailable. No transaction was signed.');process.exitCode=1;});
