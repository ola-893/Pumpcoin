import { decodeFunctionData, encodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import { nativeGatewayAbi, nativeShareAbi, type NativeAuthorization } from '../../../agent-registration/native-investment-types.js';

export function validateNativeTransaction(tx:{chainId:number;from:Address;to?:Address;value:Hex;data:Hex;gas:Hex;native?:NativeAuthorization;quote?:{expiresAt:number}}, account:Address) {
 const n=tx.native;
 if(!n||tx.chainId!==10143||tx.from.toLowerCase()!==account.toLowerCase()||!/^0x[0-9a-f]+$/i.test(tx.gas)||BigInt(tx.gas)===0n||!/^0x[0-9a-f]+$/i.test(tx.value)||!/^0x(?:[0-9a-f]{2})+$/i.test(tx.data))throw new Error('Invalid MON investment transaction.');
 for(const a of [n.gateway,n.vault])if(getAddress(a)!==a||/^0x0{40}$/i.test(a))throw new Error('Invalid MON gateway binding.');
 if(!/^[1-9][0-9]{0,38}$/.test(n.amount)||!/^\d+$/.test(n.minQuote)||!/^\d+$/.test(n.minOutput)||!Number.isSafeInteger(n.deadline)||n.deadline*1000<=Date.now()||!tx.quote||!Number.isSafeInteger(tx.quote.expiresAt)||tx.quote.expiresAt<=Date.now())throw new Error('MON review expired or contains invalid limits.');
 const amount=BigInt(n.amount),q=BigInt(n.minQuote),out=BigInt(n.minOutput),deadline=BigInt(n.deadline);
 let expected:Hex;
 if(n.action==='approve-native-exit'){
  if(tx.to!==n.vault||BigInt(tx.value)!==0n||q!==0n||out!==0n)throw new Error('Invalid exact Pump approval.');
  decodeFunctionData({abi:nativeShareAbi,data:tx.data});expected=encodeFunctionData({abi:nativeShareAbi,functionName:'approve',args:[n.gateway,amount]});
 }else{
  if(tx.to!==n.gateway||q===0n||out===0n)throw new Error('MON conversion limits or destination changed.');
  decodeFunctionData({abi:nativeGatewayAbi,data:tx.data});
  if(n.action==='deposit-mon'){
   if(BigInt(tx.value)!==amount)throw new Error('MON deposit value differs from the reviewed amount.');
   expected=encodeFunctionData({abi:nativeGatewayAbi,functionName:'depositMON',args:[q,out,deadline]});
  }else if(n.action==='redeem-mon'){
   if(BigInt(tx.value)!==0n)throw new Error('MON redemption must not send native value.');
   expected=encodeFunctionData({abi:nativeGatewayAbi,functionName:'redeemMON',args:[amount,q,out,deadline]});
  }else throw new Error('Unknown MON investment action.');
 }
 if(expected.toLowerCase()!==tx.data.toLowerCase())throw new Error('MON calldata differs from the reviewed amount and limits.');
}
