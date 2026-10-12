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
