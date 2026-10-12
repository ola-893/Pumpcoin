import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, getAddress, type Hex } from 'viem';
import { nativeGatewayAbi, nativeShareAbi, type NativeAuthorization } from '../agent-registration/native-investment-types.js';
import { validateTradingTransaction, sendBrowserTradingTransaction, type WalletBinding } from '../app/src/lib/wallet-core.js';

const wallet=getAddress('0x1111111111111111111111111111111111111111'),gateway=getAddress('0x2222222222222222222222222222222222222222'),vault=getAddress('0x3333333333333333333333333333333333333333');
const binding:WalletBinding={address:wallet,chainId:10143,revision:1,kind:'browser',name:'Fixture'};
function deposit(){const deadline=Math.floor(Date.now()/1000)+120,native:NativeAuthorization={action:'deposit-mon',gateway,vault,amount:'1000000000000000000',minQuote:'1000000',minOutput:'1000000000000',deadline};return {chainId:10143,from:wallet,to:gateway,value:'0xde0b6b3a7640000' as Hex,gas:'0x100000' as Hex,data:encodeFunctionData({abi:nativeGatewayAbi,functionName:'depositMON',args:[1000000n,1000000000000n,BigInt(deadline)]}),native,quote:{expiresAt:Date.now()+30000}};}
test('native MON approval is specific to exact calldata, value, amount, chain and gateway',()=>{
 const tx=deposit();validateTradingTransaction(tx,binding);
 assert.throws(()=>validateTradingTransaction({...tx,value:'0x1'},binding),/value differs/);
 assert.throws(()=>validateTradingTransaction({...tx,to:vault},binding),/destination changed/);
 assert.throws(()=>validateTradingTransaction({...tx,data:(tx.data+'00') as Hex},binding),/calldata differs/);
 assert.throws(()=>validateTradingTransaction({...tx,native:{...tx.native,amount:'1'}},binding),/value differs/);
 assert.throws(()=>validateTradingTransaction({...tx,chainId:1},binding),/Invalid MON/);
 assert.throws(()=>validateTradingTransaction({...tx,from:vault},binding),/Invalid MON/);
 const {native,...ordinary}=tx;assert.throws(()=>validateTradingTransaction(ordinary,binding),/Invalid testnet/);
 assert.throws(()=>validateTradingTransaction({...tx,quote:{expiresAt:Date.now()-1}},binding),/expired/);
});
test('native redemption sends no MON and approval cannot be unlimited or spend a different amount',()=>{
 const tx=deposit(),native:NativeAuthorization={...tx.native,action:'redeem-mon',amount:'1000000000000',minOutput:'1000000000000000000'};
 const exit={...tx,value:'0x0' as Hex,native,data:encodeFunctionData({abi:nativeGatewayAbi,functionName:'redeemMON',args:[1000000000000n,1000000n,1000000000000000000n,BigInt(native.deadline)]})};validateTradingTransaction(exit,binding);
 assert.throws(()=>validateTradingTransaction({...exit,value:'0x1'},binding),/must not send/);
 const approval={...tx,to:vault,value:'0x0' as Hex,native:{...native,action:'approve-native-exit' as const,minQuote:'0',minOutput:'0'},data:encodeFunctionData({abi:nativeShareAbi,functionName:'approve',args:[gateway,1000000000000n]})};validateTradingTransaction(approval,binding);
 assert.throws(()=>validateTradingTransaction({...approval,data:encodeFunctionData({abi:nativeShareAbi,functionName:'approve',args:[gateway,2n**256n-1n]})},binding),/calldata differs/);
 assert.throws(()=>validateTradingTransaction({...approval,native:{...approval.native,amount:(2n**256n-1n).toString()}},binding),/invalid limits/);
});
test('wallet binding recheck rejects stale MON quote before sending and retains a submitted hash',async()=>{
 const tx=deposit();let sent=0;
 const provider={request:async({method}:{method:string})=>{if(method==='eth_accounts')return[wallet];if(method==='eth_chainId'){tx.quote.expiresAt=Date.now()-1;return'0x279f';}sent++;return'0x'+'a'.repeat(64);}};
 await assert.rejects(sendBrowserTradingTransaction(provider,binding,()=>binding,tx),/expired/);assert.equal(sent,0);
 const fresh=deposit();let current:WalletBinding|undefined=binding;
 const successful={request:async({method}:{method:string})=>{if(method==='eth_accounts')return[wallet];if(method==='eth_chainId')return'0x279f';current=undefined;return'0x'+'b'.repeat(64);}};
 assert.equal(await sendBrowserTradingTransaction(successful,binding,()=>current,fresh),'0x'+'b'.repeat(64));
});
