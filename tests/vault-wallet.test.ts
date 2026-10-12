import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { sendBrowserVaultTransaction, type WalletBinding, type Provider, type VaultWalletTransaction } from '../app/src/lib/wallet-core.js';
const address=privateKeyToAccount(`0x${'1'.repeat(64)}`).address;
const binding: WalletBinding={address,chainId:10143,revision:1,kind:'browser',name:'test'};
const tx: VaultWalletTransaction={chainId:10143,from:address,data:'0x1234',value:'0x0',gas:'0x1234'};
const hash=`0x${'f'.repeat(64)}`;
test('Deployment wallet guard rejects wrong chain, sender, value and account revision before submission',async()=>{
 for(const change of [{chainId:1},{from:'0x0000000000000000000000000000000000000001'},{value:'0x1'}]) await assert.rejects(sendBrowserVaultTransaction({request:async()=>{throw new Error('unexpected RPC');}},binding,()=>binding,{...tx,...change} as VaultWalletTransaction));
 let sends=0; const p:Provider={request:async({method})=>method==='eth_accounts'?[address]:method==='eth_chainId'?'0x1':++sends};
 await assert.rejects(sendBrowserVaultTransaction(p,binding,()=>binding,tx));assert.equal(sends,0);
 const good:Provider={request:async({method})=>method==='eth_accounts'?[address]:method==='eth_chainId'?'0x279f':++sends};
 await assert.rejects(sendBrowserVaultTransaction(good,binding,()=>({...binding,revision:2}),tx));assert.equal(sends,0);
});
test('Submitted hash survives a subsequent wallet change; exact zero-value creation request is sent once',async()=>{
 let current:WalletBinding|undefined=binding, sends=0;
 const p:Provider={request:async({method,params})=>{if(method==='eth_accounts')return [address];if(method==='eth_chainId')return '0x279f';assert.equal(method,'eth_sendTransaction');assert.deepEqual(params,[{from:address,data:tx.data,value:'0x0',gas:tx.gas,chainId:'0x279f'}]);sends++;current=undefined;return hash;}};
 assert.equal(await sendBrowserVaultTransaction(p,binding,()=>current,tx),hash);assert.equal(sends,1);
});
