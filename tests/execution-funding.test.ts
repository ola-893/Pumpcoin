import test from 'node:test';import assert from 'node:assert/strict';
import {validateTradingTransaction,sendBrowserTradingTransaction,type WalletBinding} from '../app/src/lib/wallet-core.js';
const controller='0x1111111111111111111111111111111111111111' as const,manager='0x2222222222222222222222222222222222222222' as const;
const binding:WalletBinding={address:controller,chainId:10143,revision:1,kind:'browser',name:'fixture'};
const tx={chainId:10143,from:controller,to:manager,data:'0x' as const,value:'0x2386f26fc10000' as const,gas:'0x6270' as const,executionFunding:{controller,manager,amount:'10000000000000000'},quote:{expiresAt:Date.now()+60000}};
test('execution gas funding accepts only the explicit registered-manager transfer shape',()=>{
 assert.doesNotThrow(()=>validateTradingTransaction(tx,binding));
 const funded={...tx,value:'0x2c68af0bb140000' as const,executionFunding:{...tx.executionFunding,amount:'200000000000000000'}};
 assert.doesNotThrow(()=>validateTradingTransaction(funded,binding));
 assert.throws(()=>validateTradingTransaction({...funded,value:tx.value},binding));
 for(const changed of [{...tx,to:controller},{...tx,value:'0x1' as const},{...tx,data:'0x1234' as const},{...tx,chainId:1},{...tx,executionFunding:{...tx.executionFunding,amount:'1000000000000000000'}}])assert.throws(()=>validateTradingTransaction(changed,binding));
});
test('expired gas funding plans cannot issue a wallet send',async()=>{
 let sends=0;const provider={request:async()=>{sends++;return null;}};
 await assert.rejects(sendBrowserTradingTransaction(provider,binding,()=>binding,{...tx,quote:{expiresAt:Date.now()-1}}),/expired/);assert.equal(sends,0);
});
