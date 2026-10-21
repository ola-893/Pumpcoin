import { createPublicClient, http } from 'viem';

let tail: Promise<unknown> = Promise.resolve();
let nextAt = 0;
let active = 0;
const slots: Array<() => void> = [];
async function acquire() {
  if (active < 2) { active++; return; }
  await new Promise<void>(resolve => slots.push(resolve));
}
function release() {
  const next = slots.shift(); if (next) next(); else active--;
}
const readMethods = ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getCode', 'eth_getStorageAt', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_getBalance', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getTransactionCount', 'eth_feeHistory', 'eth_maxPriorityFeePerGas'];

/** Independent RPC reads remain bound to the caller's explicit block.
 * This transport cannot broadcast a transaction; wallet submission is separate.
 */
export function readTransport(url: string, request: typeof fetch = fetch) {
  const fetchFn: typeof fetch = (input, init) => {
    const operation = tail.then(async () => {
      const payload = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const calls = Array.isArray(payload) ? payload : [payload];
      for (const call of calls) {
        // Explicit read gas avoids a provider's implicit full-block gas limit.
        // Caller-specified gas and all transaction gas estimates remain intact.
        if (call?.method === 'eth_call' && call.params?.[0] && !call.params[0].gas)
          call.params[0].gas = '0x4c4b40';
      }
      await acquire();
      const delay = Math.max(0, nextAt - Date.now());
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      nextAt = Date.now() + Math.max(1, calls.length) * 250;
      return { input, init: { ...init, ...(payload ? { body: JSON.stringify(payload) } : {}) } };
    });
    tail = operation.catch(() => undefined);
    // Queue only request starts, not network completion. Slow responses no longer
    // block every agent's independent reads; at most two batches are in flight.
    return operation.then(async prepared => {
      try { return await request(prepared.input, prepared.init); }
      finally { release(); }
    });
  };
  return http(url, { methods: { include: readMethods }, batch: { batchSize: 5, wait: 15 }, fetchFn, timeout: 30000, retryCount: 2, retryDelay: 500 });
}

export const readClient = (url: string) => createPublicClient({ transport: readTransport(url), cacheTime: 0 });
