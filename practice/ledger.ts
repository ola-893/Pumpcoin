import { digest, fresh, integer, time } from '../research/encoding.js';
import type { Evidence, Market, Order, Policy, Portfolio, PracticeEvent } from '../research/types.js';
const Q = 1000000000000n, B = 10000n;
const fee = (n: bigint, bps: number) => (n * BigInt(bps) + B - 1n) / B;
export function initialPortfolio(p: Policy): Portfolio {
  return { cash: p.initialCash, positions: [], pending: [], realized: '0', fees: '0', equity: p.initialCash, peak: p.initialCash, drawdownBps: 0, maxDrawdownBps:0,
    closed: 0, wins: 0, breakEven: 0, updatedAt: null, lastEntryAt: null, day: null, dayOpeningEquity: null };
}
export function marketAt(e: Evidence, id: string, now: number, p: Policy): Market | undefined {
  const rows = e.markets.filter(m => m.id === id);
  return rows.length === 1 && fresh(rows[0].observedAt, now, p.maxAgeSeconds) && integer(rows[0].price) > 0n ? rows[0] : undefined;
}
export function mark(v: Portfolio, e: Evidence, now: number, p: Policy): bigint | null {
  let equity = integer(v.cash);
  for (const position of v.positions) { const m = marketAt(e,position.marketId,now,p); if (!m || time(m.observedAt)<time(position.lastObservedAt??position.openedAt)) return null; equity += integer(position.quantity) * integer(m.price) / Q; }
  return equity;
}
export function advancePortfolio(previous: Portfolio, p: Policy, e: Evidence, at: string): { portfolio: Portfolio; events: PracticeEvent[] } {
  if(e.mode==='synthetic-test')throw new Error('Synthetic evidence cannot advance a practice ledger.');
  const v = structuredClone(previous), events: PracticeEvent[] = [], now = time(at), evidenceHash = digest(e);
  if (v.updatedAt && now <= time(v.updatedAt)) throw new Error('Practice observations must advance monotonically.');
  if(v.day!==at.slice(0,10)){v.day=at.slice(0,10);const opening=mark(v,e,now,p);v.dayOpeningEquity=opening===null?null:String(opening);}
  function event(value: Omit<PracticeEvent,'id'|'at'|'evidenceHash'>) { events.push({ ...value, at, evidenceHash, id: digest([evidenceHash,at,events.length,value]) }); }
  const remaining: Order[] = [];
  const sell = (marketId: string, m: Market, reason: string, orderId: string) => {
    const index = v.positions.findIndex(x => x.marketId === marketId); if (index < 0) return;
    const pos = v.positions[index], price = integer(m.price) * (B-BigInt(p.slippageBps)) / B;
    const proceeds = integer(pos.quantity) * price / Q, charged = fee(proceeds,p.feeBps), pnl = proceeds-charged-integer(pos.cost);
    v.cash = String(integer(v.cash)+proceeds-charged); v.realized = String(BigInt(v.realized)+pnl); v.fees = String(integer(v.fees)+charged);
    v.positions.splice(index,1); v.closed++; if (pnl>0n) v.wins++; if (pnl===0n) v.breakEven++;
    event({ kind:'fill',orderId,symbol:pos.symbol,side:'SELL',price:String(price),quantity:pos.quantity,fee:String(charged),pnl:String(pnl),reason });
  };
  for (const o of v.pending) {
    if (now > time(o.expiresAt)) { event({kind:'rejected',orderId:o.id,symbol:o.symbol,reason:'Order expired before an eligible observed quote.'}); continue; }
    const m = marketAt(e,o.marketId,now,p);
    const held=v.positions.find(pos=>pos.marketId===o.marketId);
    if (!m || now < time(o.eligibleAt) || time(m.observedAt) < time(o.eligibleAt) || (held&&time(m.observedAt)<time(held.lastObservedAt??held.openedAt))) { remaining.push(o); continue; }
    if (o.side==='SELL') { sell(o.marketId,m,o.reason,o.id); continue; }
    const notional = integer(o.notional), charged = fee(notional,p.feeBps);
    const equity = mark(v,e,now,p), exposure = equity === null ? null : equity-integer(v.cash);
    const dayEquity = v.day === at.slice(0,10) && v.dayOpeningEquity !== null ? integer(v.dayOpeningEquity) : equity;
    if (!m.safe || integer(m.liquidity)===0n || v.positions.some(x=>x.marketId===o.marketId) || v.positions.length>=p.maxPositions || equity===null || exposure===null || equity===0n || dayEquity===null || dayEquity===0n ||
      (v.lastEntryAt!==null&&now-time(v.lastEntryAt)<p.cooldownSeconds*1000) || notional*BigInt(p.stopBps+2*p.feeBps+2*p.slippageBps)>equity*BigInt(p.riskBps) ||
      (dayEquity-equity)*B>=dayEquity*BigInt(p.dailyLossBps) || notional+charged>integer(v.cash) || notional*B>equity*BigInt(p.positionBps) || (exposure+notional)*B>equity*BigInt(p.exposureBps) || notional>integer(m.liquidity)/100n) {
      event({kind:'rejected',orderId:o.id,symbol:o.symbol,reason:'Fill-time safety, cash, exposure, liquidity or loss-limit check failed.'}); continue;
    }
    const price = (integer(m.price)*(B+BigInt(p.slippageBps))+B-1n)/B, quantity = notional*Q/price;
    if (!quantity) { event({kind:'rejected',orderId:o.id,symbol:o.symbol,reason:'Order is below practice precision.'}); continue; }
    const cost = quantity*price/Q;
    v.cash = String(integer(v.cash)-cost-charged); v.fees = String(integer(v.fees)+charged); v.lastEntryAt = at;
    v.positions.push({marketId:o.marketId,symbol:o.symbol,quantity:String(quantity),cost:String(cost+charged),entry:String(price),stop:String(price*(B-BigInt(p.stopBps))/B),target:String(price*(B+BigInt(p.targetBps))/B),openedAt:at,lastObservedAt:m.observedAt});
    event({kind:'fill',orderId:o.id,symbol:o.symbol,side:'BUY',price:String(price),quantity:String(quantity),fee:String(charged),reason:o.reason});
  }
  v.pending = remaining;
  // Point observations only: no inference about an unobserved intraperiod high/low.
  for (const pos of [...v.positions]) {
    const m = marketAt(e,pos.marketId,now,p); if (!m || time(m.observedAt)<time(pos.lastObservedAt??pos.openedAt)) continue;
    const price=integer(m.price), reason=price<=integer(pos.stop)?'Observed stop exit':price>=integer(pos.target)?'Observed target exit':now-time(pos.openedAt)>=p.maxHoldingSeconds*1000?'Time-horizon exit':null;
    if (reason&&time(m.observedAt)>=time(pos.openedAt)) sell(pos.marketId,m,reason,digest([pos.marketId,pos.openedAt,reason]));
    else pos.lastObservedAt=m.observedAt;
  }
  const equity = mark(v,e,now,p); v.equity=equity===null?null:String(equity); v.updatedAt=at;
  if (v.day!==at.slice(0,10)) {v.day=at.slice(0,10);v.dayOpeningEquity=v.equity;}
  if (equity!==null) { const peak=equity>integer(v.peak)?equity:integer(v.peak);v.peak=String(peak);v.drawdownBps=peak===0n?0:Number((peak-equity)*B/peak);v.maxDrawdownBps=Math.max(v.maxDrawdownBps,v.drawdownBps); }
  else v.drawdownBps=null;
  event({kind:'mark',reason:equity===null?'Open positions lack a fresh mark.':'Portfolio marked from this observed evidence.'});
  return {portfolio:v,events};
}
export function sizeEntry(v: Portfolio,p: Policy,m: Market,at: string): { notional: string; reasons: string[] } {
  const reasons: string[]=[];
  if (v.equity===null || !integer(v.equity)) return {notional:'0',reasons:['Portfolio has no available equity mark.']};
  const equity=integer(v.equity), cash=integer(v.cash), exposure=equity-cash;
  const pendingBuy=v.pending.filter(o=>o.side==='BUY').reduce((n,o)=>n+integer(o.notional),0n);
  const pendingCash=v.pending.filter(o=>o.side==='BUY').reduce((n,o)=>n+integer(o.notional)+fee(integer(o.notional),p.feeBps),0n);
  if (v.positions.some(x=>x.marketId===m.id)||v.pending.some(x=>x.marketId===m.id)) reasons.push('An open position or order already covers this instrument.');
  if (v.positions.length+v.pending.filter(x=>x.side==='BUY').length>=p.maxPositions) reasons.push('Concurrent position limit reached.');
  if (v.lastEntryAt && time(at)-time(v.lastEntryAt)<p.cooldownSeconds*1000) reasons.push('Entry cooldown active.');
  if (v.dayOpeningEquity===null || (integer(v.dayOpeningEquity)-equity)*B>=integer(v.dayOpeningEquity)*BigInt(p.dailyLossBps)) reasons.push('Daily loss limit reached or day-opening equity unavailable.');
  const cap=equity*BigInt(p.positionBps)/B, budget=equity*BigInt(p.riskBps)/BigInt(p.stopBps+2*p.feeBps+2*p.slippageBps), remaining=equity*BigInt(p.exposureBps)/B-exposure-pendingBuy;
  const amount=[(cash-pendingCash)*B/(B+BigInt(p.feeBps)),cap,budget,remaining,integer(m.liquidity)/100n].reduce((a,b)=>a<b?a:b);
  if (amount<=0n) reasons.push('No virtual cash or remaining exposure capacity.');
  return {notional:amount>0n?String(amount):'0',reasons};
}
export function metrics(v: Portfolio,p: Policy) {
  return { cash:v.cash,equity:v.equity,realized:v.realized,fees:v.fees,
    unrealized:v.equity===null?null:String(BigInt(v.equity)-BigInt(p.initialCash)-BigInt(v.realized)),
    returnBps:!v.updatedAt||v.equity===null?null:Number((BigInt(v.equity)-BigInt(p.initialCash))*10000n/BigInt(p.initialCash)),drawdownBps:v.updatedAt?v.drawdownBps:null,maxDrawdownBps:v.updatedAt?v.maxDrawdownBps:null,
    closedPositions:v.closed,winRateBps:v.closed?Math.floor(v.wins*10000/v.closed):null,breakEven:v.breakEven,markedAt:v.updatedAt };
}
