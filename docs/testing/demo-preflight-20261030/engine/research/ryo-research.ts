import {digest,fresh,integer,time} from './encoding.js';
import {decodeMcpResponse} from './mcp.js';
import {validateTool,type Tool} from './ryo-contract.js';
import type {Exchange} from './normalization.js';
import type {Evidence,Policy,RyoResearch} from './types.js';
export type RyoResearchCapture={kind:'ryo-research';tool:RyoResearch['tool'];arguments:Record<string,unknown>;catalog:Tool[];exchanges:Exchange[];receivedAt:string};
export const researchSourceKey=(tool:RyoResearch['tool'],args:Record<string,unknown>)=>tool==='analyze_token'?`ryo-research:${args.symbol}`:'ryo-sentiment';
/** Preserve every JSON numeric lexeme as a string. Raw bytes remain the authoritative source. */
export function researchJson(text:string):any{
  return JSON.parse(text,(_key,value,context?:{source?:string})=>{
    if(typeof value!=='number')return value;
    if(typeof context?.source!=='string')throw new Error('Lossless research parsing requires JSON.parse source context.');
    return context.source;
  });
}
/** Explicit downward projection for price comparisons only; provider decimals remain untouched. */
export function priceMicro(value:unknown):bigint{
  if(typeof value!=='string'||!/^\d{1,36}(?:\.\d{1,36})?(?:[eE][+-]?\d{1,2})?$/.test(value))throw new Error('Invalid research USD price.');
  const [mantissa,exponent='0']=value.toLowerCase().split('e'),[whole,fraction='']=mantissa.split('.'),power=Number(exponent)+6-fraction.length;
  if(Math.abs(power)>72)throw new Error('Research price exceeds decimal limits.');
  const digits=BigInt(whole+fraction),result=power>=0?digits*10n**BigInt(power):digits/10n**BigInt(-power);
  if(result<=0n||result>=10n**36n)throw new Error('Research USD price is not representable.');return result;
}
export function normalizeRyoResearch(c:RyoResearchCapture):RyoResearch{
  if(!['analyze_token','monitor_market_sentiment_shift'].includes(c.tool))throw new Error('Unsupported research tool.');
  validateTool(c.tool,c.arguments,c.catalog);
  if(c.tool==='analyze_token'?(Object.keys(c.arguments).join()!=='symbol'||typeof c.arguments.symbol!=='string'||! /^[A-Z0-9]{2,15}$/.test(c.arguments.symbol)):(Object.keys(c.arguments).join()!=='time_window'||c.arguments.time_window!=='7d'))throw new Error('Unreviewed research arguments.');
  if(c.exchanges.length!==1)throw new Error('A research observation requires one bound tool response.');
  const x=c.exchanges[0],params=x.params as {name:string;arguments:unknown};
  if(x.method!=='tools/call'||params.name!==c.tool||digest(params.arguments)!==digest(c.arguments)||time(x.receivedAt)>time(c.receivedAt))throw new Error('Research request/receipt mismatch.');
  const result=decodeMcpResponse(x.body,x.contentType,x.id);
  if(result?.isError)throw new Error('RYO research tool failed.');
  // The authenticated public contract returns a JSON string in text content blocks.
  const text=result?.content?.filter((v:any)=>v.type==='text').map((v:any)=>v.text).join('\n');
  if(!text)throw new Error('Research requires a losslessly reviewable public text envelope.');
  const p=researchJson(text);
  if(p.schema_version!=='1.0'||p.tool!==c.tool||!['ok','partial'].includes(p.status)||p.data_mode!=='live'||!p.data||typeof p.data!=='object'||Array.isArray(p.data)||!p.request||typeof p.as_of!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(p.as_of))throw new Error('Live RYO research coverage is unavailable.');
  const asOf=new Date(time(p.as_of)).toISOString();if(time(asOf)>time(x.receivedAt))throw new Error('Research as_of is later than receipt.');
  if(!p.availability||typeof p.availability!=='object'||Object.values(p.availability).some(v=>typeof v!=='string')||!Array.isArray(p.warnings)||p.warnings.some((v:any)=>typeof v!=='string'))throw new Error('Research coverage must be explicit.');
  let symbol:string|null=null;
  if(c.tool==='analyze_token'){
    symbol=c.arguments.symbol as string;
    if(p.request.symbol!==symbol||p.data.asset?.symbol!==symbol||p.availability.market_data!=='available')throw new Error('RYO token identity/market coverage mismatch.');
    priceMicro(p.data.market?.price_usd);
  }else{
    if(p.request.time_window!=='7d'||p.availability.research!=='available'||!p.data.evidence)throw new Error('Sentiment evidence is unavailable.');
    const fg=p.data.evidence.fear_greed?.value;
    if(typeof fg!=='string'||!/^\d{1,3}$/.test(fg)||Number(fg)>100)throw new Error('Sentiment measurement is missing or invalid.');
  }
  const dates=(v:unknown)=>{if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(/(?:^|_)date$/.test(k)&&typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&x>asOf.slice(0,10))throw new Error('Research component date is later than the pack timestamp.');if(x&&typeof x==='object')dates(x);}};dates(p.data);
  return {id:digest(c),provider:'ryo',tool:c.tool,symbol,asOf,receivedAt:c.receivedAt,status:p.status,dataMode:'live',data:p.data,coverage:p.availability,warnings:p.warnings};
}
/** Required RYO evidence is independent of execution quotes and source publications. */
export function ryoEntryReasons(p:Policy,e:Evidence,symbol:string,now:number,omit?:string):string[]{
  if(!p.ryoResearch)return [];
  const rows=(e.research??[]).filter(r=>r.id!==omit),reasons:string[]=[];
  if(!e.sources.some(s=>s.source==='ryo-research'&&s.available))reasons.push('Required RYO research coverage is unavailable.');
  const analysis=rows.filter(r=>r.tool==='analyze_token'&&r.symbol===symbol),sentiment=rows.filter(r=>r.tool==='monitor_market_sentiment_shift');
  if(analysis.length!==1||sentiment.length!==1||[...analysis,...sentiment].some(r=>!fresh(r.asOf,now,p.maxAgeSeconds)))reasons.push('Fresh RYO token research and market sentiment are required.');
  if(analysis.length===1){
    const r=analysis[0];if(p.ryoResearch.blockAvoidVerdict&&r.data.verdict==='avoid')reasons.push('The signed policy blocks entries when RYO reports an avoid verdict.');
    const markets=e.markets.filter(m=>m.symbol===symbol);
    if(markets.length===1){const reference=integer(markets[0].price),price=priceMicro(r.data.market?.price_usd),difference=reference>price?reference-price:price-reference;
      if(reference===0n||difference*10000n>reference*BigInt(p.ryoResearch.maxPriceDeviationBps))reasons.push('RYO research price differs from the signed execution-reference source beyond policy tolerance.');}
  }
  return reasons;
}
/** Bounded, documented projection for model input; full normalized data/raw captures stay inspectable. */
export function researchProjection(r:RyoResearch):RyoResearch{
  const clip=(v:unknown,max=500)=>typeof v==='string'?v.slice(0,max):null;
  const list=(v:unknown)=>Array.isArray(v)?v.slice(0,5).map(x=>clip(x,250)):[];
  if(r.tool==='analyze_token')return {...r,data:{asset:r.data.asset??null,market:r.data.market??null,performance:r.data.performance??null,technical_analysis:r.data.technical_analysis??null,intelligence:{narrative:clip(r.data.intelligence?.narrative),catalysts:list(r.data.intelligence?.catalysts),risks:list(r.data.intelligence?.risks)},verdict:r.data.verdict??null}};
  return {...r,data:{observation_as_of:r.data.observation_as_of??null,source_attribution:r.data.source_attribution??null,evidence:r.data.evidence??null}};
}
