import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,parseAbi,decodeEventLog,keccak256,type Address} from 'viem';
const base=new URL('./',import.meta.url),proof=JSON.parse(await readFile(new URL('pool-maintenance.json',base),'utf8'));
const n=JSON.parse(await readFile(new URL('../../../deployments/pumpcoin-sepolia-vault-network.json',base),'utf8'));
const c=createPublicClient({transport:http(n.rpcUrl,{retryCount:1,timeout:15000})});
assert.equal(await c.getChainId(),11155111);assert.equal(proof.steps.length,9);
assert.equal(keccak256((await c.getCode({address:proof.router}))!),proof.routerHash);
const wrappedAbi=parseAbi(['event Deposit(address indexed dst,uint256 wad)','event Withdrawal(address indexed src,uint256 wad)']);
let gas=0n,wrappedIn=0n,wrappedOut=0n,swapPaid=0n,swapQuote=0n;
const tokenEvents=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
for(const s of proof.steps){
 const r=await c.getTransactionReceipt({hash:s.hash}),tx=await c.getTransaction({hash:s.hash});
 assert.equal(r.status,'success');assert.equal(r.blockHash,s.blockHash);assert.equal(String(r.blockNumber),s.blockNumber);
 assert.equal((await c.getBlock({blockNumber:r.blockNumber})).hash,r.blockHash);
 assert.equal(tx.from.toLowerCase(),proof.controller.toLowerCase());assert.equal(String(tx.value),s.valueWei);
 const paid=r.gasUsed*r.effectiveGasPrice;assert.equal(String(paid),s.gasPaidWei);gas+=paid;
 for(const log of r.logs){
  if(log.address.toLowerCase()===n.position.toLowerCase())try{const e=decodeEventLog({abi:wrappedAbi,data:log.data,topics:log.topics});if(e.eventName==='Deposit')wrappedIn+=e.args.wad;else wrappedOut+=e.args.wad;}catch{}
  if(s.step==='realign-pool')try{const e=decodeEventLog({abi:tokenEvents,data:log.data,topics:log.topics});if(e.args.from.toLowerCase()===proof.controller.toLowerCase()&&log.address.toLowerCase()===n.position.toLowerCase())swapPaid+=e.args.value;if(e.args.to.toLowerCase()===proof.controller.toLowerCase()&&log.address.toLowerCase()===n.quote.toLowerCase())swapQuote+=e.args.value;}catch{}
 }
}
assert.equal(String(gas),proof.gasPaidWei);assert.ok(gas<=100000000000000n);assert.ok(swapPaid>0n&&swapPaid<=100000000000000n);assert.ok(swapQuote>0n);assert.ok(wrappedIn<=200000000000000n);
const blockNumber=BigInt(proof.steps.at(-1).blockNumber),abi=parseAbi(['function allowance(address,address) view returns(uint256)']);
for(const [address,spender] of [[n.position,proof.router],[n.quote,proof.funder]])assert.equal(await c.readContract({address,abi,functionName:'allowance',args:[proof.controller,spender],blockNumber}),0n);
const [healthy]=await c.readContract({address:proof.source,abi:parseAbi(['function status() view returns(bool,uint64)']),functionName:'status',blockNumber});assert.equal(healthy,true);
const summary={verified:true,chainId:11155111,atBlock:String(blockNumber),canonicalTransactions:9,gasPaidWei:String(gas),swapWethPaid:String(swapPaid),swapTestUsdcReceived:String(swapQuote),wrappedDeposits:String(wrappedIn),wrappedWithdrawals:String(wrappedOut),allowancesCleared:true,sourceHealthy:true,scope:'Controller-funded testnet pool maintenance. Swap/LP flows are not an AI decision, vault profit or investor deposit.'};
await writeFile(new URL('pool-maintenance-verification.json',base),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
