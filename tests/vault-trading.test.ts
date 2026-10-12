import test from 'node:test';
import assert from 'node:assert/strict';
import {marketChecks,poolId,type TradingNetwork} from '../agent-registration/trading.js';
import {quoteMinimum,simulateTradeQuote} from '../agent-registration/trade-quote.js';
import {sendBrowserTradingTransaction,type Provider,type WalletBinding} from '../app/src/lib/wallet-core.js';
const n={maxStaleness:300,maxConfidenceBps:100,maxDeviationBps:500,minimumQuoteLiquidity:'100000000',fee:3000,tickSpacing:60} as TradingNetwork;
const at=1800000000n;
const mon={price:200000000n,conf:1000n,expo:-8,publishTime:at},usd={price:100000000n,conf:1000n,expo:-8,publishTime:at};
// A 2 USDC / MON pool with token0=6-decimal quote and token1=18-decimal WMON.
const sqrt=56022770974786139918731938227458171n;
test('live-market gate rejects stale, uncertain, future and unliquid reference inputs',()=>{
 const healthy=marketChecks(mon,usd,at,sqrt,1000000000000000n,n);assert.equal(healthy.referencePrice,'2000000');assert.deepEqual(healthy.blockers,[]);
 assert.ok(marketChecks({...mon,publishTime:at-301n},usd,at,sqrt,1000000000000000n,n).blockers.some(x=>x.includes('MON')));
 assert.ok(marketChecks(mon,{...usd,conf:2000000n},at,sqrt,1000000000000000n,n).blockers.some(x=>x.includes('USDC')));
 assert.ok(marketChecks({...mon,publishTime:at+1n},usd,at,sqrt,1000000000000000n,n).blockers.length);
 assert.ok(marketChecks(mon,usd,at,0n,0n,n).blockers.some(x=>x.includes('no active')));
 assert.ok(marketChecks(mon,usd,at,sqrt,1n,n).blockers.some(x=>x.includes('reserve')));
 assert.ok(marketChecks(mon,usd,at,sqrt*2n,1000000000000000n,n).blockers.some(x=>x.includes('differs')));
});
test('pool identifier binds the actual token order, fee and hook-free key',()=>{
 assert.equal(poolId(n,'0x534b2f3A21130d7a60830c2Df862319e593943A3','0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541'),'0x5e65fc6c6777578390f275a30690331f2f3bd3a51bf63fdaeaaea7087ed836b7');
 assert.throws(()=>poolId(n,'0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541','0x534b2f3A21130d7a60830c2Df862319e593943A3'));
});
test('wallet changes and arbitrary payable destinations cannot submit trading transactions',async()=>{
 const from='0x1111111111111111111111111111111111111111' as const;const binding:WalletBinding={address:from,chainId:10143,revision:1,kind:'browser',name:'fixture'};
 let sends=0;const provider:Provider={request:async({method})=>{if(method==='eth_accounts')return[from];if(method==='eth_chainId')return'0x279f';sends++;return'0x'+'a'.repeat(64);}};
 const tx={chainId:10143,from,to:from,data:'0x1234' as const,value:'0x0' as const,gas:'0x10000' as const};
 await assert.rejects(sendBrowserTradingTransaction(provider,binding,()=>({...binding,revision:2}),tx));assert.equal(sends,0);
 await assert.rejects(sendBrowserTradingTransaction(provider,binding,()=>binding,{...tx,value:'0x1'}));assert.equal(sends,0);
 assert.equal(await sendBrowserTradingTransaction(provider,binding,()=>binding,tx),'0x'+'a'.repeat(64));assert.equal(sends,1);
 const changed:Provider={request:async({method})=>method==='eth_accounts'?['0x2222222222222222222222222222222222222222']:'0x279f'};
 await assert.rejects(sendBrowserTradingTransaction(changed,binding,()=>binding,tx));
});


test('quote minimum takes the stricter oracle or DEX floor, including ceiling rounding',()=>{
 assert.equal(quoteMinimum(1001n,50,900n),996n);
 assert.equal(quoteMinimum(1000n,50,999n),999n);
 assert.equal(quoteMinimum(1000n,0,900n),1000n);
 assert.throws(()=>quoteMinimum(0n,50,1n));assert.throws(()=>quoteMinimum(1000n,501,900n));
});
test('quotes bind both swap calls to one canonical block and reject invalid or changing results',async()=>{
 const a='0x1111111111111111111111111111111111111111' as const,hash=('0x'+'a'.repeat(64)) as `0x${string}`;
 const input={vault:a,manager:a,venue:a,tokenIn:a,tokenOut:a,amountIn:1000n,oracleFloor:990n,slippageBps:50,deadline:1800000030n,blockNumber:12n,blockHash:hash};
 const calls:any[]=[];const client={simulateContract:async(x:any)=>{calls.push(x);return {result:1001n};},getBlock:async()=>({hash})};
 const result=await simulateTradeQuote(client,input);assert.equal(result.quote.expectedOutput,'1001');assert.equal(result.quote.minimumOutput,'996');assert.equal(result.args[3],996n);
 assert.deepEqual(calls.map(x=>x.blockNumber),[12n,12n]);assert.deepEqual(calls.map(x=>x.args[3]),[990n,996n]);assert.ok(calls.every(x=>!('stateOverride' in x)));
 await assert.rejects(simulateTradeQuote({...client,getBlock:async()=>({hash:'0x00'})},input),/Chain changed/);
 await assert.rejects(simulateTradeQuote({...client,simulateContract:async()=>({result:0n})},input),/invalid output/);
 let count=0;await assert.rejects(simulateTradeQuote({...client,simulateContract:async()=>({result:++count===1?1001n:1000n})},input),/changed during simulation/);
});
test('expired quotes never open a browser transaction prompt, even after a slow wallet read',async()=>{
 const from='0x1111111111111111111111111111111111111111' as const,binding:WalletBinding={address:from,chainId:10143,revision:1,kind:'browser',name:'fixture'};
 let sends=0;const tx={chainId:10143,from,to:from,data:'0x1234' as const,value:'0x0' as const,gas:'0x10000' as const,quote:{expiresAt:Date.now()-1}};
 const provider:Provider={request:async({method})=>{if(method==='eth_accounts')return[from];if(method==='eth_chainId')return'0x279f';sends++;return'0x'+'a'.repeat(64);}};
 await assert.rejects(sendBrowserTradingTransaction(provider,binding,()=>binding,tx),/expired/);assert.equal(sends,0);
 const pending={...tx,quote:{expiresAt:Date.now()+30000}};
 const slow:Provider={request:async({method})=>{if(method==='eth_accounts'){pending.quote.expiresAt=Date.now()-1;return[from];}if(method==='eth_chainId')return'0x279f';sends++;return'0x'+'a'.repeat(64);}};
 await assert.rejects(sendBrowserTradingTransaction(slow,binding,()=>binding,pending),/expired/);assert.equal(sends,0);
});
