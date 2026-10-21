import type { RegistrationRecord } from '../../../agent-registration/types.js';
import { readAgentState, type AgentState } from './agent-state.js';
export const agentStateKey = (r: RegistrationRecord) => ['agent-state-v1', r.id, r.commitment, r.authorization.challenge.chainId, r.binding?.vault.toLowerCase() ?? 'unbound', r.binding?.blockHash ?? ''] as const;
export function restoreAgentState(storage: Pick<Storage, 'getItem' | 'removeItem'>, record: RegistrationRecord, now = Date.now()): AgentState | undefined {
  const key = JSON.stringify(agentStateKey(record));
  try {
    const json = storage.getItem(key); if (!json) return;
    const data = readAgentState(JSON.parse(json), record);
    const age = now - Date.parse(data.observation?.checkedAt ?? data.checkedAt);
    if (age < -5000 || age > 15 * 60000 || !data.observation) { storage.removeItem(key); return; }
    return data;
  } catch { try { storage.removeItem(key); } catch { /* Browser storage is optional. */ } return; }
}
export function saveAgentState(storage: Pick<Storage, 'setItem' | 'removeItem'>, record: RegistrationRecord, value: AgentState) {
  const data = readAgentState(value, record), key = JSON.stringify(agentStateKey(record));
  if (!data.observation || data.chainError || data.cache?.refreshError) { storage.removeItem(key); return; }
  storage.setItem(key, JSON.stringify(data));
}
