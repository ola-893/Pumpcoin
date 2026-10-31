import { lookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { digest } from './encoding.js';
import { decodeMcpResponse,normalizeCapture,type Capture,type Exchange,type RyoProfile } from './normalization.js';
export type { RyoProfile } from './normalization.js';
import type { Evidence, Market, Policy, Post, SourceStatus } from './types.js';
import { MCP_VERSIONS,validateTool,type Tool } from './ryo-contract.js';
import {researchSourceKey,type RyoResearchCapture} from './ryo-research.js';
import { coinbaseBookUrl } from './coinbase.js';

type Config = { url?:string; key?:string; authHeader?:string; authPrefix?:string; profile?:RyoProfile; newsFeeds:string[];ratePerMinute?:number };
async function publicUrl(value:string) {
  const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||u.hostname==='localhost')throw new Error('Source requires a public HTTPS origin.');
  const addresses=await lookup(u.hostname,{all:true});
  if(!addresses.length||addresses.some(({address:a})=>/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::|f[cd]|fe[89ab])/i.test(a)||a.includes('::ffff:')))throw new Error('Private source addresses are not allowed.');
  return u;
}
async function bounded(response:Response,allowError=false) {
  if(!response.ok&&!allowError) {await response.body?.cancel();throw new Error(`Source returned HTTP ${response.status}.`);}
  if(!response.body)throw new Error('Source returned no data.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2000000)throw new Error('Source response exceeds evidence limit.');chunks.push(value);}}finally{await reader.cancel();}
  return Buffer.concat(chunks).toString('utf8');
}
export async function sourceConfig():Promise<Config> {
  const map=process.env.PUMPCOIN_RYO_PROFILE;
  const rate=process.env.PUMPCOIN_RYO_RATE_PER_MINUTE??process.env.Rate_Per_Minute;
  if(rate!==undefined&&(!/^\d+$/.test(rate)||Number(rate)<1||Number(rate)>10000))throw new Error('Invalid RYO request-rate configuration.');
  return {url:process.env.PUMPCOIN_RYO_MCP_URL,key:process.env.PUMPCOIN_RYO_API_KEY,authHeader:process.env.PUMPCOIN_RYO_AUTH_HEADER??'Authorization',authPrefix:process.env.PUMPCOIN_RYO_AUTH_PREFIX??'Bearer ',
    profile:map?JSON.parse(await readFile(map,'utf8')):undefined,newsFeeds:(process.env.PUMPCOIN_NEWS_FEEDS??'').split(',').map(x=>x.trim()).filter(Boolean),ratePerMinute:rate?Number(rate):undefined};
}
export function researchSources(config:Config,fetcher:typeof fetch=fetch) {
  let session:string|undefined,catalog:Tool[]|undefined,next=1;
  let protocol:string|undefined,discovery:Promise<Tool[]>|undefined;
  let requestMinute=-1,requestCount=0;
  const cache=new Map<string,{until:number;evidence:Evidence}>(),pending=new Map<string,Promise<Evidence>>();
  const capabilities={ryo:!!config.url&&!!config.key,ryoMapping:config.profile?.version===2,x:false,news:config.newsFeeds.length>0};
  async function rpc(method:string,params:unknown,notification=false,log?:Exchange[],signal?:AbortSignal):Promise<any> {
    if(!config.url||!config.key)throw new Error('Configure RYO builder access on the operator computer.');
    const minute=Math.floor(Date.now()/60000);if(minute!==requestMinute){requestMinute=minute;requestCount=0;}if(++requestCount>Math.min(30,config.ratePerMinute??6))throw new Error('RYO request budget reached for this minute.');
    const url=await publicUrl(config.url),headers:Record<string,string>={'Content-Type':'application/json',Accept:'application/json, text/event-stream',[config.authHeader??'Authorization']:(config.authPrefix??'Bearer ')+config.key};
    if(session)headers['Mcp-Session-Id']=session;
    if(protocol&&method!=='initialize')headers['MCP-Protocol-Version']=protocol;
    const id=notification?null:next++;
    const response=await fetcher(url,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id}),method,params}),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    const sid=response.headers.get('mcp-session-id');if(sid)session=sid;
    if(notification&&response.status===202){await response.body?.cancel();return;}
    const body=await bounded(response),contentType=response.headers.get('content-type')??'';
    log?.push({method,params,id,body,contentType,receivedAt:new Date().toISOString()});
    return decodeMcpResponse(body,contentType,id);
  }
  async function discover(signal?:AbortSignal):Promise<Tool[]>{
    if(catalog)return catalog;if(discovery)return discovery;
    discovery=(async()=>{const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'pumpcoin-research',version:'1.0.0'}},false,undefined,signal);if(!MCP_VERSIONS.includes(init?.protocolVersion))throw new Error('Unsupported MCP transport version.');protocol=init.protocolVersion;await rpc('notifications/initialized',{},true,undefined,signal);const r=await rpc('tools/list',{},false,undefined,signal);if(!Array.isArray(r?.tools)||r.nextCursor)throw new Error('RYO returned an invalid or incomplete tool catalog.');catalog=r.tools;return catalog!;})();
    try{return await discovery;}finally{discovery=undefined;}
  }
  async function call(name:string,args:Record<string,unknown>,log:Exchange[],signal?:AbortSignal){
    if(!catalog)await discover(signal);validateTool(name,args,catalog!);
    const result=await rpc('tools/call',{name,arguments:args},false,log,signal);if(result?.isError)throw new Error('RYO tool reported unavailable evidence.');
    if(result?.structuredContent)return result.structuredContent;
    const text=result?.content?.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n');if(!text)throw new Error('RYO tool returned no structured evidence.');return JSON.parse(text);
  }
  async function market(symbol:string):Promise<{market:Market;raw:Capture}> {
    const profile=config.profile;if(!profile||profile.version!==2)throw new Error('Configure authentic version 2 RYO price, liquidity and identity mappings; no safety verdict is required.');
    if(!catalog)await discover();const exchanges:Exchange[]=[];
    for(const [tool,definition] of Object.entries(profile.tools)){const args=JSON.parse(JSON.stringify(definition.arguments).replaceAll('{{symbol}}',symbol));await call(tool,args,exchanges);}
    const raw:Capture={kind:'ryo',symbol,profile,catalog,exchanges:[...exchanges],receivedAt:new Date().toISOString()};
    return {market:normalizeCapture(raw).markets[0],raw};
  }
  async function news(url:string):Promise<{posts:Post[];raw:Capture}> {
    if(!config.newsFeeds.includes(url))throw new Error('News feed is not allowlisted.');
    const response=await fetcher(await publicUrl(url),{headers:{Accept:'application/rss+xml, application/atom+xml, application/feed+json, application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
    const raw:Capture={kind:'news',feed:url,body:await bounded(response),contentType:response.headers.get('content-type')??'',receivedAt:new Date().toISOString()};
    return {posts:normalizeCapture(raw).posts,raw};
  }
  async function capture(p:Pick<Policy,'symbols'|'newsFeeds'|'voices'>&{marketRules?:Policy['marketRules'];ryoResearch?:Policy['ryoResearch']}):Promise<Evidence>{
    const e:Evidence={version:'PUMPCOIN-RESEARCH-EVIDENCE-v1',mode:'live-observed',capturedAt:new Date().toISOString(),markets:[],posts:[],sources:[],raw:[]};
    if(p.ryoResearch)e.research=[];
    async function research(tool:RyoResearchCapture['tool'],args:Record<string,unknown>){
      const exchanges:Exchange[]=[];try{await call(tool,args,exchanges,AbortSignal.timeout(20000));}catch{}
      let available=false;
      if(exchanges.length){const raw:RyoResearchCapture={kind:'ryo-research',tool,arguments:args,catalog:catalog!,exchanges,receivedAt:new Date().toISOString()};const rows=normalizeCapture(raw).research??[];e.raw.push(raw);e.research!.push(...rows);available=rows.length===1;}
      e.sources.push({source:researchSourceKey(tool,args),available,...(!available?{reason:'Required RYO research is unavailable or incompatible; any received raw response is retained.'}:{}),retrievedAt:new Date().toISOString()});
    }
    const marketSource=p.marketRules?.source??'ryo';
    let ryoMapped=0,coinbaseMapped=0;
    for(const symbol of p.symbols){
      if(marketSource==='coinbase-exchange'){
        try{
          const url=coinbaseBookUrl(symbol),startedAt=new Date().toISOString();
          const response=await fetcher(await publicUrl(url),{headers:{Accept:'application/json','Cache-Control':'no-cache'},redirect:'error',signal:AbortSignal.timeout(15000)});
          const raw:Capture={kind:'coinbase-exchange',symbol,url,status:response.status,body:await bounded(response,true),startedAt,receivedAt:new Date().toISOString()};
          const rows=normalizeCapture(raw).markets;e.raw.push(raw);e.markets.push(...rows);coinbaseMapped+=rows.length;
          e.sources.push({source:`coinbase-exchange:${symbol}`,available:rows.length===1,...(!rows.length?{reason:'Coinbase returned an unavailable, invalid or non-continuous book. Raw response retained.'}:{}),retrievedAt:raw.receivedAt});
        }catch{e.sources.push({source:`coinbase-exchange:${symbol}`,available:false,reason:'Public Coinbase quote could not be retrieved within the capture budget.',retrievedAt:new Date().toISOString()});}
      }
      if(p.ryoResearch)await research('analyze_token',{symbol});
      if(p.ryoResearch&&(!config.profile||marketSource!=='ryo')){e.sources.push({source:`ryo:${symbol}`,available:false,reason:'RYO research is separately attributed; this response does not establish an executable market/depth mapping.',retrievedAt:new Date().toISOString()});continue;}
      if((!config.profile||marketSource!=='ryo')&&capabilities.ryo){
        const exchanges:Exchange[]=[];try{await call('analyze_token',{symbol},exchanges,AbortSignal.timeout(20000));}catch{}
        if(exchanges.length){const raw:Capture={kind:'ryo-observation',symbol,tool:'analyze_token',arguments:{symbol},catalog:catalog!,exchanges,receivedAt:new Date().toISOString()};normalizeCapture(raw);e.raw.push(raw);}
        e.sources.push({source:`ryo:${symbol}`,available:false,reason:exchanges.length?'RYO response captured; no reviewed price, liquidity and instrument-identity mapping is established. This response supplies no RYO pricing; entries use the signed market source.':'RYO observation could not be retrieved.',retrievedAt:new Date().toISOString()});continue;
      }
      if(marketSource==='ryo')try{const result=await market(symbol);e.markets.push(result.market);e.raw.push(result.raw);ryoMapped++;}catch{e.sources.push({source:`ryo:${symbol}`,available:false,reason:'RYO evidence unavailable or incompatible. Verify builder access, catalog and response mapping.',retrievedAt:new Date().toISOString()});}
    }
    if(p.ryoResearch){await research('monitor_market_sentiment_shift',{time_window:'7d'});const available=p.symbols.every(s=>e.sources.some(x=>x.source===`ryo-research:${s}`&&x.available))&&e.sources.some(s=>s.source==='ryo-sentiment'&&s.available);e.sources.push({source:'ryo-research',available,...(!available?{reason:'Signed RYO token/sentiment coverage is incomplete.'}:{}),retrievedAt:new Date().toISOString()});}
    e.sources.push({source:'ryo',available:ryoMapped===p.symbols.length,reason:ryoMapped===p.symbols.length?undefined:'RYO priced watchlist coverage is incomplete. Raw tool responses are separate from executable quotes.',retrievedAt:new Date().toISOString()} as SourceStatus);
    if(marketSource==='coinbase-exchange')e.sources.push({source:'coinbase-exchange',available:coinbaseMapped===p.symbols.length,reason:coinbaseMapped===p.symbols.length?undefined:'Selected USD spot-book coverage is incomplete.',retrievedAt:new Date().toISOString()} as SourceStatus);
    for(const [kind,selected,read] of [['news',p.newsFeeds,news]] as const){let complete=selected.length>0;for(const selectedId of selected){try{const result=await read(selectedId);e.posts.push(...result.posts);e.raw.push(result.raw);e.sources.push({source:`${kind}:${selectedId}`,available:true,retrievedAt:new Date().toISOString()});}catch{complete=false;e.sources.push({source:`${kind}:${selectedId}`,available:false,reason:'Selected source observation failed or could not be normalized.',retrievedAt:new Date().toISOString()});}}
      e.sources.push({source:kind,available:complete,...(!complete?{reason:'Select operator-allowlisted accessible news feeds.'}:{}),retrievedAt:new Date().toISOString()});}
    if(p.voices.length)e.sources.push({source:'x',available:false,reason:'X collection has been removed. Historical selected accounts were not queried.',retrievedAt:new Date().toISOString()});
    e.capturedAt=new Date().toISOString();
    // Avoid undefined optional properties in the canonical signed encoding.
    const encoded=JSON.stringify(e);if(Buffer.byteLength(encoded)>2000000)throw new Error('Combined research evidence exceeds the capture budget. Narrow the watchlist or sources.');return JSON.parse(encoded);
  }
  async function collect(p:Policy):Promise<Evidence>{const key=digest(p),saved=cache.get(key);if(saved&&saved.until>Date.now())return structuredClone(saved.evidence);const work=pending.get(key);if(work)return structuredClone(await work);const current=capture(p);pending.set(key,current);try{const evidence=await current;cache.set(key,{until:Date.now()+Math.min(30000,p.intervalSeconds*1000),evidence});return structuredClone(evidence);}finally{pending.delete(key);}}
  return {capabilities,proposedFeeds:[...config.newsFeeds],discover,collect,async check(symbol:string,marketSource:'ryo'|'coinbase-exchange'='ryo'){if(!/^[A-Z0-9]{2,15}$/.test(symbol)||!['ryo','coinbase-exchange'].includes(marketSource))throw new Error('Provide a supported market symbol and source.');return capture({symbols:[symbol],newsFeeds:config.newsFeeds,voices:[],...(capabilities.ryo?{ryoResearch:{version:1,required:true,maxPriceDeviationBps:500,blockAvoidVerdict:true} as const}:{}),marketRules:{source:marketSource,instruments:[],minimumLiquidityUsd:'1',maximumLiquidityBps:100,riskEvidence:'record-unavailable-block-reported'}});},async inspect(name:string,args:Record<string,unknown>){const exchanges:Exchange[]=[];try{const result=await call(name,args,exchanges);return {result,exchanges,catalog};}catch{if(!exchanges.length)throw new Error('RYO inspection failed before a tool response was received.');return {result:null,error:'RYO returned an unavailable or incompatible tool result.',exchanges,catalog};}}};
}
