import { requestOracleRefresh, activeOracleDemand } from '../agent-registration/oracle-demand.js';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeFunctionData, getAddress, keccak256, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { checkedKeeper, oracleKeeper, oracleRefreshEligible, oracleTasks, requireOracleCall, type KeeperConfig } from '../agent-registration/oracle-keeper.js';
const address = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`);
const account = privateKeyToAccount(`0x${'33'.repeat(32)}`), id = `0x${'a'.repeat(64)}` as Hex;
const config: KeeperConfig = { version: 'PUMPCOIN-ORACLE-KEEPER-v1', chainId: 10143, controller: address(1), address: account.address, registrations: [id], refreshAheadSeconds: 120, pollIntervalMs: 30000, maxFeePerGasWei: '500000000000', mode: 'continuous', enabled: true, validUntil: 2000,
  economy: { maxTransactionGasWei: '300000000000000000', maxDailyGasWei: '2000000000000000000', gasReserveWei: '100000000000000000', minimumTradeIntervalMs: 0, maxTradesPerDay: 24 } };
test('Keeper deduplicates shared USDC updates, avoids fresh relays, and rejects future timestamps', () => {
  const views = [1, 2].map(n => ({ id, source: address(n), monPublishedAt: '700', usdPublishedAt: '700' }));
  assert.deepEqual(oracleTasks(views, address(9), 1000n, 120).map(x => x.kind), ['usd', 'mon', 'mon']);
  assert.equal(oracleTasks(views.map(x => ({ ...x, monPublishedAt: '999', usdPublishedAt: '999' })), address(9), 1000n, 120).length, 0);
  assert.throws(() => oracleTasks([{ ...views[0], usdPublishedAt: '1001' }], address(9), 1000n, 120));
  for (const change of [{ chainId: 1 }, { refreshAheadSeconds: 1 }, { registrations: [id,id] }, { maxFeePerGasWei:'999999999999999' }]) assert.throws(() => checkedKeeper({ ...config, ...change } as KeeperConfig));
  assert.equal(checkedKeeper({...config,economy:{...config.economy,maxDailyGasWei:'4000000000000000000'}}).economy.maxDailyGasWei,'4000000000000000000');
  assert.equal(checkedKeeper({...config,economy:{...config.economy,maxDailyGasWei:'4500000000000000000'}}).economy.maxDailyGasWei,'4500000000000000000');
  assert.throws(()=>checkedKeeper({...config,economy:{...config.economy,maxDailyGasWei:'4500000000000000001'}}));
});
test('Keeper call policy excludes transfers, approvals, trades, wrong targets and oversized update fees', () => {
  const abi = parseAbi(['function updateMon(bytes)', 'function updatePriceFeeds(bytes[])', 'function approve(address,uint256)']);
  const task = { registrationId: id, kind: 'mon' as const, target: address(8) };
  const data = encodeFunctionData({ abi, functionName: 'updateMon', args: ['0x1234'] });
  requireOracleCall(task, { to: task.target, data, value: '0' }, address(9));
  for (const plan of [{ to: address(7), data, value:'0' }, { to: task.target, data, value:'1' }, { to:task.target, data:encodeFunctionData({abi,functionName:'approve',args:[address(1),1n]}),value:'0' }]) assert.throws(() => requireOracleCall(task, plan, address(9)));
});
test('Keeper prepares an oracle update from the same verified inspection rather than taking a second snapshot', async () => {
  const root=await mkdtemp(join(tmpdir(),'keeper-inspection-'));
  let inspections=0,prepared=0;
  const source=address(8),pyth=address(9);
  const trading={inspect:async()=>{throw new Error('Duplicate inspection');},plan:async()=>{throw new Error('Duplicate snapshot');},
    inspectForOracle:async()=>{inspections++;return {view:{controller:config.controller,manager:address(2),bundle:{source},paused:false,configured:true,valuation:false,monPublishedAt:'700',usdPublishedAt:'999'},
      plan:async(action:string,signer:string)=>{prepared++;assert.equal(action,'update-mon-price');assert.equal(signer,config.controller);return {to:source,data:encodeFunctionData({abi:parseAbi(['function updateMon(bytes)']),functionName:'updateMon',args:['0x1234']}),value:'0',gas:'0x186a0'};}};}} as any;
  try {
    const result=await oracleKeeper(config,{root,network:{chainId:10143} as any,market:{chainId:10143,oracle:'supra-pyth',pyth} as any,trading,
      client:{getChainId:async()=>10143,getBlock:async()=>({timestamp:1000n}),getBalance:async()=>0n,getGasPrice:async()=>100000000000n}}).cycle(false);
    assert.equal(result.state,'simulated-no-broadcast');assert.equal(inspections,1);assert.equal(prepared,1);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('Keeper dry run never signs; ambiguous broadcast is durable and restart reconciles exact bytes, costs and nonce', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-keeper-')); let sent = 0, signed = 0, mined = false, failSend = true;
  const blockHash = `0x${'b'.repeat(64)}` as Hex, source = getAddress('0x' + 'ab'.repeat(20)), pyth = address(9);
  assert.notEqual(source, source.toLowerCase());
  const data = encodeFunctionData({ abi: parseAbi(['function updateMon(bytes)']), functionName:'updateMon', args:['0x1234'] });
  const trading = { inspect: async () => ({ controller: config.controller, manager:address(2), bundle:{source}, paused:false,configured:true,valuation:false,monPublishedAt:'700',usdPublishedAt:'999' }),
    plan: async () => ({ to:source,data,value:'0',gas:'0x186a0' }) } as any;
  let hash: Hex;
  const client = { getChainId:async()=>10143, getBlock:async()=>({number:11n,timestamp:1000n,hash:blockHash}),getBalance:async()=>5n*10n**18n,getGasPrice:async()=>100000000000n,call:async()=>{},
    sendRawTransaction:async({serializedTransaction}:any)=>{sent++;hash=keccak256(serializedTransaction); if(failSend)throw new Error('accepted then timeout'); return hash;},
    getTransactionReceipt:async()=>{if(!mined){const error=new Error('pending');error.name='TransactionReceiptNotFoundError';throw error;}return {transactionHash:hash,blockNumber:10n,blockHash,status:'success',gasUsed:50000n,effectiveGasPrice:100000000000n};} };
  const wallet={ prepareTransactionRequest:async(x:any)=>({...x,chain:monadTestnet,chainId:10143,type:'eip1559',nonce:0,maxFeePerGas:200000000000n,maxPriorityFeePerGas:1n}),signTransaction:async(x:any)=>{signed++;return account.signTransaction(x);} };
  const opts={root,network:{chainId:10143,rpcUrl:'https://unused.example'} as any,market:{chainId:10143,oracle:'supra-pyth',pyth} as any,trading,client,wallet,account};
  try {
    assert.equal((await oracleKeeper(config,opts).cycle(false)).state,'simulated-no-broadcast'); assert.equal(signed,0);assert.equal(sent,0);
    await assert.rejects(oracleKeeper({...config,enabled:false},opts).cycle(true),/enabled/); assert.equal(signed,0);
    await assert.rejects(oracleKeeper(config,opts).cycle(true),/timeout/); assert.equal(signed,1); assert.equal(sent,1);
    const file=join(root,'.local/oracle-keeper',`${account.address.toLowerCase()}.json`), pending=JSON.parse(await readFile(file,'utf8')).pending;
    assert.equal(keccak256(pending.serialized),pending.hash);assert.equal(pending.registrationId,id);
    failSend=false; assert.equal((await oracleKeeper(config,opts).cycle(true)).state,'pending'); assert.equal(signed,1); assert.equal(sent,2);
    mined=true;
    const originalInspect=trading.inspect;
    trading.inspect=async()=>{throw new Error('Mined receipt reconciliation must not repeat the vault snapshot.');};
    assert.equal((await oracleKeeper(config,opts).cycle(true)).state,'success'); assert.equal(signed,1);
    trading.inspect=originalInspect;
    const journal=JSON.parse(await readFile(file,'utf8')); assert.equal(journal.pending,undefined); assert.equal(journal.budget.spentWei,String(50000n*100000000000n)); assert.equal(journal.receipts.length,1);
    await assert.rejects(oracleKeeper({...config,economy:{...config.economy,maxTransactionGasWei:'1'}},opts).cycle(true),/fee-cap|base fee/); assert.equal(signed,1);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('On-demand requests expire, coalesce and stay scoped to reviewed registrations', async () => {
  const root=await mkdtemp(join(tmpdir(),'oracle-demand-'));
  try {
    await mkdir(join(root,'.local'),{recursive:true});
    await writeFile(join(root,'.local/oracle-keeper-config.json'),JSON.stringify({...config,mode:'on-demand'}));
    assert.equal(await requestOracleRefresh(id,root,1000),true);
    assert.equal(await requestOracleRefresh(id,root,2000),true);
    const active=await activeOracleDemand([id],root,2000);assert.equal(active.has(id),true);
    assert.equal((await activeOracleDemand([id],root,601001)).size,0);
    assert.equal(await requestOracleRefresh(`0x${'c'.repeat(64)}`,root,2000),false);
    assert.equal(JSON.parse(await readFile(join(root,'.local/oracle-keeper-demand',`${id.slice(2)}.json`),'utf8')).requestedAt,1000);
    const idle=oracleKeeper({...config,mode:'on-demand'},{root,network:{chainId:10143,rpcUrl:'https://unused.example'} as any,market:{chainId:10143,oracle:'supra-pyth',pyth:address(9)} as any,
      client:{getChainId:async()=>10143,getBlock:async()=>({timestamp:1000n}),getBalance:async()=>0n},trading:{inspect:async()=>({controller:config.controller,manager:address(2),bundle:{source:address(8)},paused:false,configured:true,monPublishedAt:'700',usdPublishedAt:'700'})} as any});
    // Real wall time is after the deliberately expired fixture request.
    assert.equal((await idle.cycle(false)).state,'idle');
  } finally {await rm(root,{recursive:true,force:true});}
});

test('An explicitly retained on-demand request stays warm only until its existing ten-minute expiry', async () => {
 const root=await mkdtemp(join(tmpdir(),'keeper-warm-window-'));
 const reviewed={...config,mode:'on-demand' as const};
 const options={root,network:{chainId:10143} as any,market:{chainId:10143,oracle:'supra-pyth',pyth:address(9)} as any,
  client:{getChainId:async()=>10143,getBlock:async()=>({timestamp:1000n}),getBalance:async()=>0n},trading:{inspect:async()=>({controller:config.controller,manager:address(2),bundle:{source:address(8)},paused:false,configured:true,valuation:true,monPublishedAt:'999',usdPublishedAt:'999'})} as any};
 try{await mkdir(join(root,'.local'),{recursive:true});await writeFile(join(root,'.local/oracle-keeper-config.json'),JSON.stringify(reviewed));
  await requestOracleRefresh(id,root);await oracleKeeper(reviewed,options).cycle(true);assert.equal((await activeOracleDemand([id],root)).size,0);
  const now=Date.now();await requestOracleRefresh(id,root,now);await oracleKeeper({...reviewed,keepWarmRequests:true},options).cycle(true);assert.equal((await activeOracleDemand([id],root,now+599999)).size,1);assert.equal((await activeOracleDemand([id],root,now+600000)).size,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Keeper primes a reviewed guard only after feeds align; a waiting candidate does not consume gas', async () => {
  const root=await mkdtemp(join(tmpdir(),'keeper-guard-'));
  const pyth=address(9), guard=address(10),source=address(8);
  let candidateAt='0';
  const trading={inspect:async()=>({id,controller:config.controller,manager:address(2),bundle:{source,guard:{address:guard,acceptedAt:'0',acceptedPublication:'0',candidateAt,candidatePublication:'999'}},paused:false,configured:false,valuation:false,blockers:[],monPublishedAt:'999',usdPublishedAt:'999'}),
    plan:async(_id:string,action:string)=>{assert.equal(action,'checkpoint-valuation');return {to:guard,data:encodeFunctionData({abi:parseAbi(['function checkpoint() returns(bool)']),functionName:'checkpoint'}),value:'0',gas:'0x186a0'};}} as any;
  const options={root,network:{chainId:10143,rpcUrl:'https://unused.example'} as any,market:{chainId:10143,oracle:'supra-pyth',pyth} as any,trading,client:{getChainId:async()=>10143,getBlock:async()=>({timestamp:1000n}),getBalance:async()=>0n,getGasPrice:async()=>100000000000n}};
  try{const result=await oracleKeeper(config,options).cycle(false);assert.equal(result.state,'simulated-no-broadcast');assert.equal(result.due[0].kind,'checkpoint');candidateAt='999';assert.equal((await oracleKeeper(config,options).cycle(false)).state,'fresh-or-blocked');}
  finally{await rm(root,{recursive:true,force:true});}
});

test('Advancing a guard candidate refreshes the remaining MON feed without repeatedly selecting fresh USDC', async () => {
  const root=await mkdtemp(join(tmpdir(),'keeper-advance-'));
  const source=address(8),pyth=address(9),guard=address(10);
  const trading={inspect:async()=>({controller:config.controller,manager:address(2),paused:false,configured:false,valuation:false,blockers:[],monPublishedAt:'800',usdPublishedAt:'999',
    bundle:{source,guard:{address:guard,acceptedAt:'0',acceptedPublication:'0',candidateAt:'900',candidatePublication:'800'}}}),
    plan:async(_id:string,action:string)=>{assert.equal(action,'update-mon-price');return {to:source,data:encodeFunctionData({abi:parseAbi(['function updateMon(bytes)']),functionName:'updateMon',args:['0x1234']}),value:'0',gas:'0x186a0'};}} as any;
  try {
    const result=await oracleKeeper(config,{root,network:{chainId:10143} as any,market:{chainId:10143,oracle:'supra-pyth',pyth} as any,trading,
      client:{getChainId:async()=>10143,getBlock:async()=>({timestamp:1000n}),getBalance:async()=>0n,getGasPrice:async()=>100000000000n}}).cycle(false);
    assert.deepEqual(result.due.map(task=>task.kind),['mon']);
  } finally {await rm(root,{recursive:true,force:true});}
});


test('On-demand bootstrap permits an empty paused unconfigured guarded vault, while funded or configured pauses remain excluded', () => {
  const bootstrap = { paused: true, configured: false, cash: '0', position: '0', bundle: { guard: {} } };
  assert.equal(oracleRefreshEligible(bootstrap, true), true);
  assert.equal(oracleRefreshEligible(bootstrap), false);
  for (const change of [{ cash: '1' }, { position: '1' }, { configured: true }, { cash: undefined }, { bundle: {} }]) {
    assert.equal(oracleRefreshEligible({ ...bootstrap, ...change }, true), false);
  }
  assert.equal(oracleRefreshEligible({ ...bootstrap, paused: false }), true);
});


test('Empty paused bootstrap requires an explicit on-demand request before any checkpoint plan', async () => {
  const root = await mkdtemp(join(tmpdir(), 'keeper-paused-bootstrap-'));
  const guard = address(10), source = address(8), pyth = address(9);
  const reviewed = { ...config, mode: 'on-demand' as const, registrations: [id, ('0x' + 'c'.repeat(64)) as Hex] };
  let cash = '0', plans = 0;
  const trading = { inspect: async (selected: string) => { assert.equal(selected, id, 'Inactive registrations must not consume the bootstrap snapshot window.'); return ({ controller: config.controller, manager: address(2), paused: true, configured: false, cash, position: '0', valuation: false, blockers: [], monPublishedAt: '999', usdPublishedAt: '999', bundle: { source, guard: { address: guard, acceptedAt: '0', acceptedPublication: '0', candidateAt: '0', candidatePublication: '0' } } }); },
    plan: async () => { plans++; return { to: guard, data: encodeFunctionData({ abi: parseAbi(['function checkpoint() returns(bool)']), functionName: 'checkpoint' }), value: '0', gas: '0x186a0' }; } } as any;
  const options = { root, network: { chainId: 10143 } as any, market: { chainId: 10143, oracle: 'supra-pyth', pyth } as any, trading, client: { getChainId: async () => 10143, getBlock: async () => ({ timestamp: 1000n }), getBalance: async () => 0n, getGasPrice: async () => 100000000000n } };
  try {
    await mkdir(join(root, '.local'), { recursive: true });
    await writeFile(join(root, '.local/oracle-keeper-config.json'), JSON.stringify(reviewed));
    assert.equal((await oracleKeeper(reviewed, options).cycle(false)).state, 'idle');
    assert.equal(plans, 0);
    await requestOracleRefresh(id, root);
    assert.equal((await oracleKeeper(reviewed, options).cycle(false)).state, 'simulated-no-broadcast');
    assert.equal(plans, 1);
    cash = '1';
    await oracleKeeper(reviewed, options).cycle(false);
    assert.equal(plans, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
