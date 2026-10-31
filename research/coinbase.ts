import { digest,time,units } from './encoding.js';
import type { Market } from './types.js';

export type CoinbaseCapture={kind:'coinbase-exchange';symbol:string;url:string;body:string;status:number;startedAt:string;receivedAt:string};
export function coinbaseBookUrl(symbol:string):string {
  if(!/^[A-Z0-9]{2,15}$/.test(symbol))throw new Error('Invalid USD spot-market symbol.');
  return `https://api.exchange.coinbase.com/products/${symbol}-USD/book?level=2`;
}
/** Venue observations, not chain reserves, token safety or guaranteed execution. */
export function normalizeCoinbase(c:CoinbaseCapture):Market {
  if(c.url!==coinbaseBookUrl(c.symbol)||time(c.startedAt)>time(c.receivedAt)||time(c.receivedAt)-time(c.startedAt)>20000)throw new Error('Invalid Coinbase request binding or timing.');
  if(c.status!==200)throw new Error('Coinbase did not return a successful book.');
  const b=JSON.parse(c.body);
  if(b.auction_mode!==false||!Number.isSafeInteger(b.sequence)||b.sequence<0||!Array.isArray(b.bids)||!Array.isArray(b.asks)||!b.bids.length||!b.asks.length||b.bids.length>100000||b.asks.length>100000)throw new Error('A non-auction, two-sided level-two book is required.');
  if(typeof b.time!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(b.time))throw new Error('Coinbase observation timestamp is missing.');
  const observedAt=new Date(time(b.time)).toISOString();
  if(time(observedAt)>time(c.receivedAt))throw new Error('Coinbase observation is later than receipt.');
  const scale=10n**18n;
  function decimal18(value:unknown):bigint {
    if(typeof value!=='string'||!/^(0|[1-9]\d{0,18})(\.\d{1,18})?$/.test(value))throw new Error('Invalid Coinbase decimal.');
    const [whole,fraction='']=value.split('.');return BigInt(whole)*scale+BigInt(fraction.padEnd(18,'0'));
  }
  const bid=BigInt(units(b.bids[0][0])),ask=BigInt(units(b.asks[0][0]));
  if(bid<=0n||bid>=ask)throw new Error('Crossed, locked or non-positive Coinbase book.');
  const mid=(bid+ask)/2n;
  function depth(rows:unknown[],side:'bid'|'ask'):bigint {
    let total=0n,previous:bigint|undefined;
    for(const row of rows){
      if(!Array.isArray(row)||row.length!==3||!Number.isSafeInteger(row[2])||row[2]<1)throw new Error('Invalid Coinbase book level.');
      const price=decimal18(row[0]),quantity=decimal18(row[1]);
      if(price<=0n||quantity<=0n||previous!==undefined&&(side==='bid'?price>=previous:price<=previous))throw new Error('Unordered or invalid Coinbase book.');
      previous=price;
      // Capture all levels but measure only displayed notional within 10 bps of midpoint.
      // Size is already aggregated: order count is never a multiplier. Round depth down.
      if(price*10000n>=mid*10n**12n*9990n&&price*10000n<=mid*10n**12n*10010n)total+=price*quantity;
    }
    return total/(10n**30n);
  }
  const bidDepth=depth(b.bids,'bid'),askDepth=depth(b.asks,'ask');
  return {id:`coinbase:${c.symbol}-USD`,symbol:c.symbol,network:'coinbase-exchange',price:String(mid),liquidity:String(bidDepth<askDepth?bidDepth:askDepth),risk:{status:'unavailable'},observedAt,observations:{price:observedAt,liquidity:observedAt},evidenceId:digest(c),quote:{provider:'coinbase-exchange',bid:String(bid),ask:String(ask),depth:'minimum-two-sided-notional-within-10bps-mid'}};
}
