import { get, put } from '@vercel/blob';
import { basename } from 'node:path';

export interface JsonStorage {
  load<T = unknown>(path: string): Promise<T | undefined>;
  save(path: string, value: unknown): Promise<void>;
}

/** Immutable metadata ships with the deployment; new reviews survive cold starts. */
export function reviewStorage(namespace: 'vault-native' | 'vault-liquidity', seed: Record<string, unknown>): JsonStorage {
  const key = (path: string) => {
    const name = basename(path);
    if (!/^[0-9a-f]{64}(?:-[0-9a-f]{40})?\.json$/.test(name)) throw new Error('Invalid review storage key.');
    return `${namespace}/${path.includes('/plans/') ? 'plans/' : ''}${name}`;
  };
  return {
    async load<T>(path: string) {
      const name = key(path);
      if (!name.includes('/plans/')) return seed[name] as T | undefined;
      const result = await get(name, { access: 'private', useCache: false });
      if (!result) return undefined;
      if (result.statusCode !== 200) throw new Error('Saved transaction review is unavailable.');
      return JSON.parse(await new Response(result.stream).text()) as T;
    },
    async save(path: string, value: unknown) {
      const name = key(path);
      if (!name.includes('/plans/')) throw new Error('Infrastructure metadata is published by the operator.');
      await put(name, JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' });
    },
  };
}
