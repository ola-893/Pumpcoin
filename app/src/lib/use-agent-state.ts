import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type RegistrationRecord } from './agent-registration';
import { fetchAgentState } from './agent-state-query';
import { agentStateKey, restoreAgentState } from './agent-state-cache';
export function useAgentState(record: RegistrationRecord, _revision?: unknown, enabled = true) {
  const client = useQueryClient(), [now, setNow] = useState(Date.now);
  const key = agentStateKey(record);
  const query = useQuery({ queryKey: key, queryFn: () => fetchAgentState(record), enabled,
    initialData: () => { try { return restoreAgentState(sessionStorage, record); } catch { return undefined; } },
    // Restored browser data is historical/provisional until the server rechecks it.
    initialDataUpdatedAt: 0,
    refetchInterval: q => q.state.data?.cache?.refreshing ? 10000 : 120000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const data = query.data;
  const error = query.error?.message || data?.cache?.refreshError || '';
  const stale = !!data && (query.dataUpdatedAt === 0 || !!error || now - Date.parse(data.observation?.checkedAt ?? data.checkedAt) > 90000);
  async function refresh() {
    await client.fetchQuery({ queryKey: key, queryFn: () => fetchAgentState(record, true), staleTime: 0 }).catch(() => undefined);
  }
  return { data, error, busy: query.isFetching || !!data?.cache?.refreshing, stale, refresh };
}
