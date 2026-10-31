import { fresh,integer } from './encoding.js';
import type { Market,Policy } from './types.js';

/** Deterministic order eligibility under explicit operator rules, never a token-safety verdict. */
export function marketEligibility(p:Policy,m:Market|undefined,now:number):string[]{
  if(!m)return ['Instrument identity is unavailable.'];
  const reasons:string[]=[];
  const source=p.marketRules.source??'ryo';
  if(source==='coinbase-exchange'){
    if(p.slippageBps<10)reasons.push('Coinbase depth uses a 10 bps price band; signed adverse slippage must cover that band.');
    if(m.quote?.provider!=='coinbase-exchange')reasons.push('The signed Coinbase quote source is missing.');
    else {const mid=integer(m.price),bid=integer(m.quote.bid),ask=integer(m.quote.ask);if(mid*BigInt(10000+p.slippageBps)/10000n<ask||mid*BigInt(10000-p.slippageBps)/10000n>bid)reasons.push('Observed spread exceeds the signed practice slippage assumption.');}
  } else if(m.quote)reasons.push('Market provider differs from the signed RYO source.');
  if(!p.marketRules.instruments.some(x=>x.id===m.id&&x.symbol===m.symbol&&x.network===m.network))reasons.push('Instrument identity is outside the signed market allowlist.');
  if(!fresh(m.observedAt,now,p.maxAgeSeconds)||integer(m.price)===0n)reasons.push('A fresh, positive observed price is required.');
  if(integer(m.liquidity)===0n||integer(m.liquidity)<integer(p.marketRules.minimumLiquidityUsd))reasons.push('Observed liquidity is below the signed minimum.');
  if(!m.risk||!['unavailable','observed'].includes(m.risk.status))reasons.push('Risk coverage must be explicitly recorded.');
  else if(m.risk.status==='observed'){
    if(!fresh(m.risk.observedAt,now,p.maxAgeSeconds))reasons.push('Reported risk observations are stale or future-dated.');
    if(m.risk.flags.length)reasons.push('Reported provider risk flags block new entries under this policy.');
  }
  return reasons;
}
