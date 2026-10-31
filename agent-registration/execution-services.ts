import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {RegistrationRecord} from './types.js';
import {liveVaultService} from './live-vault.js';
import {tradingService} from './trading.js';
import {nativeInvestmentService} from './native-investment.js';
import {poolFundingService} from './pool-funding.js';

/** Server-reviewed profiles only. Historical agents keep their original chain and bytecode pins. */
export function executionServices(records:()=>Promise<RegistrationRecord[]>,oracleKey:()=>string|undefined){
  const read=(name:string)=>JSON.parse(readFileSync(new URL(`../deployments/${name}`,import.meta.url),'utf8'));
  const profiles=[
    {network:read('pumpcoin-sepolia-vault-network.json'),market:read('pumpcoin-sepolia-trading-network.json')},
    {network:read('pumpcoin-vault-network.json'),market:read('pumpcoin-trading-network.json')},
  ].map(({network,market})=>{
    const live=liveVaultService(network,records),trading=tradingService(network,market,fileURLToPath(new URL('../.local/vault-trading/',import.meta.url)),records,undefined,oracleKey);
    return {network,live,trading,native:nativeInvestmentService(network,market,fileURLToPath(new URL('../.local/vault-native/',import.meta.url)),records,trading),pool:poolFundingService(network,market,fileURLToPath(new URL('../.local/vault-liquidity/',import.meta.url)),trading)};
  });
  const remembered=new Map<string,typeof profiles[number]>();
  async function target(id:string){
    const r=(await records()).find(x=>x.id===id);if(!r)throw new Error('Unknown registered agent.');
    const chain=r.binding?.chainId??r.authorization.challenge.chainId,p=profiles.find(x=>x.network.chainId===chain);
    if(!p||r.authorization.challenge.chainId!==chain)throw new Error('No reviewed execution profile matches this signed agent chain.');
    remembered.set(id,p);return p;
  }
  const trading={
    inspect:async(...a:Parameters<typeof profiles[number]['trading']['inspect']>)=>(await target(a[0])).trading.inspect(...a),
    plan:async(...a:Parameters<typeof profiles[number]['trading']['plan']>)=>(await target(a[0])).trading.plan(...a),
    confirm:async(...a:Parameters<typeof profiles[number]['trading']['confirm']>)=>(await target(a[0])).trading.confirm(...a),
    confirmGuard:async(...a:Parameters<typeof profiles[number]['trading']['confirmGuard']>)=>(await target(a[0])).trading.confirmGuard(...a),
    receipt:async(...a:Parameters<typeof profiles[number]['trading']['receipt']>)=>(await target(a[0])).trading.receipt(...a),
  };
  const native={
    inspect:async(...a:Parameters<typeof profiles[number]['native']['inspect']>)=>(await target(a[0])).native.inspect(...a),
    plan:async(...a:Parameters<typeof profiles[number]['native']['plan']>)=>(await target(a[0])).native.plan(...a),
    receipt:async(...a:Parameters<typeof profiles[number]['native']['receipt']>)=>(await target(a[0])).native.receipt(...a),
  };
  const pool={
    inspect:async(...a:Parameters<typeof profiles[number]['pool']['inspect']>)=>(await target(a[0])).pool.inspect(...a),
    plan:async(...a:Parameters<typeof profiles[number]['pool']['plan']>)=>(await target(a[0])).pool.plan(...a),
    receipt:async(...a:Parameters<typeof profiles[number]['pool']['receipt']>)=>(await target(a[0])).pool.receipt(...a),
  };
  const live={inspect:async(...a:Parameters<typeof profiles[number]['live']['inspect']>)=>(await target(a[0])).live.inspect(...a),cacheStatus:(id:string)=>remembered.get(id)?.live.cacheStatus(id)??{refreshing:false}};
  return {trading,native,pool,live};
}
