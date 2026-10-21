import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '../app/src/lib/query-client.js';

test('page remounts and concurrent observers share requests and preserve prior data during revalidation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60000, gcTime: Infinity } } });
  let calls = 0, release!: (value: object) => void;
  const options = { queryKey: ['agent-state', 'id', 'commitment', 10143, 'vault'], queryFn: () => { calls++; return new Promise<object>(r => { release = r; }); } };
  try {
    const first = client.fetchQuery(options), second = client.fetchQuery({ ...options, queryKey: [...options.queryKey] });
    assert.equal(calls, 1);
    const snapshot = { checkedAt: '2026-10-13T18:00:00Z', blockNumber: '123', paused: true };
    release(snapshot); await Promise.all([first, second]);
    assert.equal(await client.fetchQuery({ ...options, queryKey: [...options.queryKey] }), snapshot);
    assert.equal(calls, 1);
    await client.invalidateQueries({ queryKey: options.queryKey });
    const refresh = client.fetchQuery(options);
    assert.equal(calls, 2); assert.equal(client.getQueryData(options.queryKey), snapshot);
    release({ ...snapshot, blockNumber: '124', paused: false }); await refresh;
    assert.equal((client.getQueryData(options.queryKey) as any).blockNumber, '124');
    assert.equal(client.getQueryData(['agent-state', 'id', 'changed-commitment', 10143, 'vault']), undefined);
  } finally { client.clear(); }
});
