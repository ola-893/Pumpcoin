import test from 'node:test';import assert from 'node:assert/strict';
import {economyPolicy,gasDay,requireActivityBudget,requireGasBudget} from '../agent-registration/gas-budget.js';
const policy={maxTransactionGasWei:'1000',maxDailyGasWei:'5000',gasReserveWei:'100',minimumTradeIntervalMs:300000,maxTradesPerDay:24};
test('faucet policy validates fee, reserve and activity limits',()=>{
 assert.equal(economyPolicy(policy),policy);assert.throws(()=>economyPolicy({...policy,maxDailyGasWei:'500'}));assert.throws(()=>economyPolicy({...policy,maxTradesPerDay:0}));assert.throws(()=>economyPolicy({...policy,gasReserveWei:'-1'}));
});
test('cost ceiling preserves reserve and charges against actual durable daily costs',()=>{
 assert.equal(requireGasBudget(policy,1100n,100n,10n,4000n),1000n);
 assert.throws(()=>requireGasBudget(policy,1099n,100n,10n,0n),/gas-reserve/);
 assert.throws(()=>requireGasBudget(policy,2000n,101n,10n,0n),/fee-cap/);
 assert.throws(()=>requireGasBudget(policy,2000n,100n,10n,4001n),/daily-limit/);
});
test('UTC rollover resets daily quota while cooldown still crosses midnight',()=>{
 const previous={day:'0',spentWei:'5000',trades:24},next=gasDay(previous,86401n);assert.deepEqual(next,{day:'1',spentWei:'0',trades:0});
 assert.throws(()=>requireActivityBudget(policy,previous,86399n),/daily-limit/);
 assert.throws(()=>requireActivityBudget(policy,next,86401n,'86399'),/cooldown/);
 assert.doesNotThrow(()=>requireActivityBudget(policy,next,86699n,'86399'));
 assert.throws(()=>gasDay({...previous,spentWei:'-1'},86401n),/journal/);
 assert.throws(()=>requireActivityBudget(policy,next,86401n,'86402'),/timestamp/);
});
