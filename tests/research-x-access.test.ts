import test from 'node:test';
import assert from 'node:assert/strict';
import { researchSources,sourceConfig } from '../research/providers.js';
import { policy } from './research-fixtures.js';

test('retained legacy X selections cannot make any outbound X requests',async()=>{
  let requests=0;
  const source=researchSources({newsFeeds:[]},async()=>{requests++;throw new Error('No request expected');});
  const p=policy(),e=await source.collect({...p,symbols:[],newsFeeds:[]});
  assert.equal(requests,0);assert.equal(source.capabilities.x,false);assert.equal(e.posts.length,0);
  assert.match(e.sources.find(s=>s.source==='x')!.reason!,/removed/);
  assert(!('resolveVoices' in source));assert(!('checkVoices' in source));
});
test('an env token is ignored and news-only collection has no X requirement or requests',async()=>{
  const oldToken=process.env.PUMPCOIN_X_BEARER_TOKEN,oldHandles=process.env.PUMPCOIN_KOL_HANDLES;
  process.env.PUMPCOIN_X_BEARER_TOKEN='test-only-ignored';process.env.PUMPCOIN_KOL_HANDLES='test';
  try{
    const config=await sourceConfig();assert(!('xToken' in config));assert(!('kolHandles' in config));
    const feed='https://93.184.216.34/news.xml',at=new Date(Date.now()-1000).toISOString();let calls=0;
    const source=researchSources({newsFeeds:[feed]},(async input=>{calls++;assert.equal(String(input),feed);return Response.json({items:[{id:'test-only',url:'https://example.com/story',title:'Test headline',date_published:at}]});}) as typeof fetch);
    const e=await source.collect({...policy(),strategies:['market-news'],symbols:[],voices:[],newsFeeds:[feed]});
    assert.equal(calls,1);assert.equal(e.posts.length,1);assert.equal(e.sources.find(s=>s.source==='news')?.available,true);assert(!e.sources.some(s=>s.source==='x'));assert.deepEqual(source.proposedFeeds,[feed]);
  }finally{
    if(oldToken===undefined)delete process.env.PUMPCOIN_X_BEARER_TOKEN;else process.env.PUMPCOIN_X_BEARER_TOKEN=oldToken;
    if(oldHandles===undefined)delete process.env.PUMPCOIN_KOL_HANDLES;else process.env.PUMPCOIN_KOL_HANDLES=oldHandles;
  }
});
