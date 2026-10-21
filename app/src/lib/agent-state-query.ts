import { registrationRequest, registrationSession, type RegistrationRecord } from './agent-registration';
import { readAgentState } from './agent-state';
import { agentStateKey, saveAgentState } from './agent-state-cache';
import { queryClient } from './query-client';

export async function fetchAgentState(record: RegistrationRecord, force = false) {
  const session = await registrationSession();
  const response = await registrationRequest(session.token, force ? '/agent-state-refresh' : '/agent-state', { id: record.id });
  const data = readAgentState(response.state, record);
  try { saveAgentState(sessionStorage, record, data); } catch { /* Persistence is optional; source data is still in memory. */ }
  return data;
}
export function refreshAgentDisplay(record: RegistrationRecord) {
  // Never cache transaction plans/simulations. Invalidate only read-only views
  // after a confirmed transaction or explicit operator runtime change.
  void queryClient.invalidateQueries({ queryKey: ['native-display-v1', record.id] });
  return queryClient.fetchQuery({ queryKey: agentStateKey(record), queryFn: () => fetchAgentState(record, true), staleTime: 0 }).catch(() => undefined);
}
