import type { AgentState, RegistrationRecord, RuntimeStatus, LiveVaultObservation } from './types.js';

// Public evidence only. Chain and local runtime observations have independent
// failure states: a stopped worker does not imply a paused vault, or vice versa.
export function agentStateService(
  records: () => Promise<RegistrationRecord[]>,
  live: { inspect(id: string, policy?: { allowStale?: boolean; force?: boolean }): Promise<LiveVaultObservation>; cacheStatus?(id: string): { refreshing: boolean; error?: unknown } },
  runtime: { status(id: string): Promise<RuntimeStatus> },
) {
  return { async inspect(id: string, force = false): Promise<AgentState> {
    if (!/^0x[0-9a-f]{64}$/i.test(id)) throw new Error('Invalid registration identifier.');
    const record = (await records()).find(r => r.id === id);
    if (!record) throw new Error('Agent registration not found.');
    const result: AgentState = { registrationId: record.id, manifestCommitment: record.commitment, vault: record.binding?.vault, checkedAt: new Date().toISOString() };
    const [chain, worker] = await Promise.allSettled([
      record.binding?.chainId === 10143 ? live.inspect(id, { allowStale: true, force }) : Promise.reject(new Error(record.binding ? `Chain ${record.binding.chainId} is a local simulation; no Monad observation was requested.` : 'This signed registration has no recorded vault binding.')),
      runtime.status(id),
    ]);
    const safe = (e: unknown) => e instanceof Error && !('code' in e) && e.message.length < 300 && !/\/Users\/|\/private\/|https?:\/\//.test(e.message) ? e.message : 'The evidence source could not be read. Retry the observation.';
    if (chain.status === 'fulfilled') result.observation = chain.value; else result.chainError = safe(chain.reason);
    if (worker.status === 'fulfilled') result.runtime = worker.value; else result.runtimeError = safe(worker.reason);
    const cache = live.cacheStatus?.(id);
    if (cache) result.cache = { refreshing: cache.refreshing, ...(cache.error ? { refreshError: safe(cache.error) } : {}) };
    result.checkedAt = new Date().toISOString();
    return result;
  } };
}
