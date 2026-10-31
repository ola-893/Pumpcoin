import { decodeMcpResponse } from './mcp.js';
import {normalizeRyoResearch,type RyoResearchCapture} from './ryo-research.js';
import { XMLParser } from 'fast-xml-parser';
import { digest,time,units } from './encoding.js';
import type { Market,Post,RyoResearch } from './types.js';
import { validateTool,type Tool } from './ryo-contract.js';
import { normalizeCoinbase,type CoinbaseCapture } from './coinbase.js';
export type Field={tool:string;pointer:string};
export type RyoProfile={version:2;tools:Record<string,{arguments:Record<string,unknown>}>;fields:Record<'id'|'symbol'|'network'|'price'|'liquidity'|'observedAt'|'liquidityObservedAt'|'mode',Field>;riskFields?:{flags:Field;observedAt:Field}};
export type Exchange={method:string;params:unknown;id:number|null;body:string;contentType:string;receivedAt:string};
export type Capture=
  |CoinbaseCapture
  |RyoResearchCapture
  |{kind:'ryo';symbol:string;profile:RyoProfile;catalog:unknown;exchanges:Exchange[];receivedAt:string}
  |{kind:'ryo-observation';symbol:string;tool:string;arguments:Record<string,unknown>;catalog:Tool[];exchanges:Exchange[];receivedAt:string}
  |{kind:'news';feed:string;body:string;contentType:string;receivedAt:string}
  |{kind:'x';account:string;body:string;receivedAt:string};
export {decodeMcpResponse} from './mcp.js';

function pointer(value:unknown,path:string):unknown {if(path==='')return value;if(!/^\/(?:[^~]|~[01])*$/.test(path))throw new Error('Invalid configured RYO field pointer.');return path.slice(1).split('/').reduce<unknown>((v,k)=>v&&typeof v==='object'?(v as Record<string,unknown>)[k.replace(/~1/g,'/').replace(/~0/g,'~')]:undefined,value);}
function providerTime(value:unknown):string {if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value))throw new Error('Provider timestamp needs an explicit timezone.');return new Date(time(value)).toISOString();}
export function normalizeCapture(c:Capture): {markets:Market[];posts:Post[];research?:RyoResearch[]} {
  if(c.kind==='ryo-research'){try{return {markets:[],posts:[],research:[normalizeRyoResearch(c)]};}catch{return {markets:[],posts:[],research:[]};}}
  // Failed/invalid responses stay in the evidence too, but cannot claim market coverage.
  if(c.kind==='coinbase-exchange'){try{return {markets:[normalizeCoinbase(c)],posts:[]};}catch{return {markets:[],posts:[]};}}
  if(c.kind==='ryo-observation'){
    validateTool(c.tool,c.arguments,c.catalog);
    if(c.arguments.symbol!==c.symbol||c.exchanges.length!==1)throw new Error('Raw RYO observation is not bound to its symbol.');
    const x=c.exchanges[0],params=x.params as {name:string;arguments:unknown};
    if(x.method!=='tools/call'||params.name!==c.tool||digest(params.arguments)!==digest(c.arguments))throw new Error('Raw RYO observation request mismatch.');
    // An unmapped provider response (including malformed/error envelopes) is retained
    // as an observation only. Its failure must not erase another signed source's book.
    try{decodeMcpResponse(x.body,x.contentType,x.id);}catch{}
    // Raw observation is explicitly NOT a tradable market mapping, even if a future response has numbers.
    return {markets:[],posts:[]};
  }
  if(c.kind==='ryo') {
    const responses:Record<string,unknown>={};
    for(const x of c.exchanges.filter(x=>x.method==='tools/call')) {
      const params=x.params as {name:string;arguments:unknown};
      const expected=c.profile.tools[params.name];
      validateTool(params.name,params.arguments as Record<string,unknown>,c.catalog as Tool[]);
      if(!expected||digest(params.arguments)!==digest(JSON.parse(JSON.stringify(expected.arguments).replaceAll('{{symbol}}',c.symbol))))throw new Error('Captured tool arguments differ from the reviewed mapping.');
      const result=decodeMcpResponse(x.body,x.contentType,x.id);if(result?.isError)throw new Error('Captured RYO tool failed.');
      const payload=result?.structuredContent??JSON.parse(result?.content?.filter((v:any)=>v.type==='text').map((v:any)=>v.text).join('\n'));
      if(params.name in responses)throw new Error('Duplicate market tool response.');responses[params.name]=payload;
    }
    if(c.profile.version!==2||Object.keys(c.profile.tools).some(name=>!(name in responses)))throw new Error('Incomplete captured RYO tool coverage or obsolete safety mapping; review version 2.');
    const get=(name:keyof RyoProfile['fields'])=>{const f=c.profile.fields[name];if(!f||!(f.tool in responses))throw new Error('RYO field mapping is incomplete.');return pointer(responses[f.tool],f.pointer);};
    const id=get('id'),network=get('network');
    if(get('mode')!=='live'||get('symbol')!==c.symbol||typeof id!=='string'||!id||typeof network!=='string'||!network)throw new Error('RYO identity or live data mode is unavailable.');
    const observations={price:providerTime(get('observedAt')),liquidity:providerTime(get('liquidityObservedAt'))};
    if(Object.values(observations).some(t=>time(t)>time(c.receivedAt)))throw new Error('RYO observation is later than receipt.');
    let risk:Market['risk']={status:'unavailable'};
    if(c.profile.riskFields){const read=(f:Field)=>{if(!f||!(f.tool in responses))throw new Error('Risk-field mapping is incomplete.');return pointer(responses[f.tool],f.pointer);};const flags=read(c.profile.riskFields.flags),observedAt=providerTime(read(c.profile.riskFields.observedAt));if(!Array.isArray(flags)||flags.length>30||flags.some(x=>typeof x!=='string'||!x.trim()||x.length>500)||time(observedAt)>time(c.receivedAt))throw new Error('Provider risk flags or timestamp are invalid.');risk={status:'observed',flags,observedAt,evidenceId:digest(c)};}
    return {markets:[{id,symbol:c.symbol,network,price:units(get('price')),liquidity:units(get('liquidity')),risk,observedAt:Object.values(observations).sort()[0],observations,evidenceId:digest(c)}],posts:[]};
  }
  if(c.kind==='news') {
    let entries:any[];
    if(c.contentType.includes('json')){const value=JSON.parse(c.body);entries=Array.isArray(value.items)?value.items:[];}
    else {if(/<!DOCTYPE|<!ENTITY/i.test(c.body))throw new Error('Unsupported feed declarations.');const x=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(c.body),row=x.rss?.channel?.item??x.feed?.entry??[];entries=Array.isArray(row)?row:[row];}
    const posts:Post[]=[];
    for(const x of entries.slice(0,50)) {
      const published=x.date_published??x.pubDate??x.published,link=x.url??(typeof x.link==='string'?x.link:x.link?.['@_href']),title=typeof x.title==='string'?x.title:x.title?.['#text'];
      if(typeof published!=='string'||!Number.isFinite(Date.parse(published))||typeof link!=='string'||typeof title!=='string')continue;
      const u=new URL(link);if(u.protocol!=='https:'||u.username||u.password)continue;
      const text=[title,x.content_text??x.description??x.summary??''].join('\n').replace(/<[^>]*>/g,' ').slice(0,4000),id=digest([c.feed,x.id??x.guid??link]);
      posts.push({id,originId:digest(text.trim().toLowerCase().replace(/\s+/g,' ')),author:u.hostname,publishedAt:new Date(published).toISOString(),text,url:u.href,source:'news'});
    }
    return {markets:[],posts};
  }
  if(c.kind!=='x')throw new Error('Unknown capture kind.');
  const raw=JSON.parse(c.body);if(raw.errors||(!Array.isArray(raw.data)&&raw.meta?.result_count!==0))throw new Error('X observation coverage is unavailable.');
  const posts:Post[]=(raw.data??[]).filter((p:any)=>p.author_id===c.account&&typeof p.id==='string'&&typeof p.text==='string'&&typeof p.created_at==='string').map((p:any)=>({id:`x:${p.id}`,originId:p.referenced_tweets?.find((r:any)=>r.type==='retweeted'||r.type==='quoted')?.id??p.id,author:c.account,publishedAt:providerTime(p.created_at),text:p.text.slice(0,4000),url:`https://x.com/i/status/${p.id}`,source:'x'}));
  return {markets:[],posts};
}
