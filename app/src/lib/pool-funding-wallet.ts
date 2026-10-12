import { encodeFunctionData, getAddress, parseAbi, type Address, type Hex } from 'viem';
import type { PoolFundingAuthorization } from '../../../agent-registration/pool-funding-types';
const abi=parseAbi(['function seed(uint128,int24,int24,uint256,uint256) payable']);
export function validatePoolFundingTransaction(tx:{chainId:number;from:Address;to?:Address;value:Hex;data:Hex;gas:Hex;funding?:PoolFundingAuthorization;quote?:{expiresAt:number}},account:Address){
 const f=tx.funding;
 if(!f||tx.chainId!==10143||tx.from.toLowerCase()!==account.toLowerCase()||getAddress(f.funder)!==f.funder||/^0x0{40}$/i.test(f.funder)||tx.to!==f.funder||!/^0x[0-9a-f]+$/i.test(tx.gas)||BigInt(tx.gas)===0n||!/^0x[0-9a-f]+$/i.test(tx.value)||BigInt(tx.value)!==3n*10n**18n||!tx.quote||!Number.isSafeInteger(tx.quote.expiresAt)||tx.quote.expiresAt<=Date.now())throw new Error('Invalid bounded demo-pool funding transaction.');
 if(!/^[1-9][0-9]{0,38}$/.test(f.liquidity)||BigInt(f.liquidity)>=(1n<<128n)||f.maxQuote!=='200000'||!Number.isSafeInteger(f.lower)||!Number.isSafeInteger(f.upper)||f.lower%10!==0||f.upper-f.lower!==20||f.lower< -887270||f.upper>887270||!Number.isSafeInteger(f.deadline)||f.deadline*1000<=Date.now()||f.deadline*1000>Date.now()+300000)throw new Error('Demo pool amount, range or deadline changed.');
 const expected=encodeFunctionData({abi,functionName:'seed',args:[BigInt(f.liquidity),f.lower,f.upper,BigInt(f.maxQuote),BigInt(f.deadline)]});if(expected.toLowerCase()!==tx.data.toLowerCase())throw new Error('Demo pool calldata differs from the reviewed funding limits.');
}
