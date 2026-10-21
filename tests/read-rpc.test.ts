import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient } from 'viem';
import { readTransport } from '../agent-registration/rpc.js';

test('read-only RPC batches checks, preserves block references and cannot broadcast', async () => {
  const batches: any[][] = [];
  const request: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    batches.push(body);
    return Response.json(body.map((call: any) => ({ jsonrpc: '2.0', id: call.id, result: call.method === 'eth_chainId' ? '0x279f' : '0x01' })));
  };
  const client = createPublicClient({ transport: readTransport('https://monad-testnet.drpc.org', request) });
  const address = '0x0000000000000000000000000000000000000001';
  await Promise.all([
    client.getChainId(),
    client.call({ to: address, data: '0x', blockNumber: 123n }),
    client.call({ to: address, data: '0x', gas: 777n, blockNumber: 123n }),
  ]);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 3);
  const calls = batches[0].filter(x => x.method === 'eth_call');
  assert.deepEqual(calls.map(x => x.params[1]), ['0x7b', '0x7b']);
  assert.equal(calls[0].params[0].gas, '0x4c4b40');
  assert.equal(calls[1].params[0].gas, '0x309');
  await assert.rejects(client.request({ method: 'eth_sendRawTransaction', params: ['0x01'] } as any));
  assert.equal(batches.length, 1);
});

test('read batches stay within the public endpoint burst limit', async () => {
  const sizes: number[] = [];
  const request: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    sizes.push(body.length);
    return Response.json(body.map((call: any) => ({ jsonrpc: '2.0', id: call.id, result: '0x01' })));
  };
  const client = createPublicClient({ transport: readTransport('http://127.0.0.1:8545', request) });
  await Promise.all(Array.from({length:12},(_,i)=>client.call({to:'0x0000000000000000000000000000000000000001',data:'0x',blockNumber:BigInt(i)})));
  assert.equal(sizes.reduce((sum,x)=>sum+x,0),12);
  assert.ok(sizes.every(x=>x<=5));
});

// Receipt confirmation polling reads the head number; it still cannot broadcast.
test('read-only transport supports confirmation head reads without signing methods', async () => {
  const methods:string[]=[];
  const request:typeof fetch=async(_input,init)=>{const body=JSON.parse(String(init?.body));const calls=Array.isArray(body)?body:[body];methods.push(...calls.map((c:any)=>c.method));const answers=calls.map((c:any)=>({jsonrpc:'2.0',id:c.id,result:'0x2a'}));return new Response(JSON.stringify(Array.isArray(body)?answers:answers[0]),{headers:{'Content-Type':'application/json'}});};
  const client=createPublicClient({transport:readTransport('https://test.invalid',request)});
  assert.equal(await client.getBlockNumber({cacheTime:0}),42n);
  await assert.rejects(client.request({method:'eth_sendRawTransaction',params:['0x01']} as any));
  assert.deepEqual(methods,['eth_blockNumber']);
});


test('a slow read does not block the next batch and concurrency remains bounded', async () => {
  let active = 0, maximum = 0, started = 0;
  const releases: Array<() => void> = [];
  const request: typeof fetch = async (_input, init) => {
    active++; maximum = Math.max(maximum, active); started++;
    await new Promise<void>(resolve => releases.push(resolve));
    active--;
    const payload = JSON.parse(String(init?.body));
    const calls = Array.isArray(payload) ? payload : [payload];
    const result = calls.map((call: any) => ({ jsonrpc: '2.0', id: call.id, result: '0x01' }));
    return Response.json(Array.isArray(payload) ? result : result[0]);
  };
  const client = createPublicClient({ transport: readTransport('https://test.invalid', request) });
  const first = client.getBalance({ address: '0x0000000000000000000000000000000000000001', blockNumber: 1n });
  await new Promise(resolve => setTimeout(resolve, 30));
  const second = client.getBalance({ address: '0x0000000000000000000000000000000000000002', blockNumber: 1n });
  const third = client.getBalance({ address: '0x0000000000000000000000000000000000000003', blockNumber: 1n });
  for (let i = 0; started < 2 && i < 200; i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(started, 2); assert.equal(maximum, 2);
  while (releases.length) releases.shift()!();
  await Promise.all([first, second, third]);
  assert.ok(maximum <= 2);
});
