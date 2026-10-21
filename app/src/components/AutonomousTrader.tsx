import { refreshAgentDisplay } from '../lib/agent-state-query';
import { useEffect, useRef, useState } from 'react';
import type { RuntimeStatus } from '../../../agent-registration/types';
import { registrationRequest, registrationSession, type RegistrationRecord } from '../lib/agent-registration';
import { Badge } from './UI';

export function AutonomousTrader({ record }: { record: RegistrationRecord }) {
  const [status, setStatus] = useState<RuntimeStatus>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), active = useRef<AbortController | undefined>(undefined);
  async function request(route: '/trader-status' | '/trader-start' | '/trader-stop', signal: AbortSignal) {
    if (lock.current) return; lock.current = true; setBusy(true);
    try {
      const session = await registrationSession(signal), response = await registrationRequest(session.token, route, { id: record.id }, signal);
      if (!signal.aborted) { setStatus(response.runtime); setError(''); if (route !== '/trader-status') void refreshAgentDisplay(record); }
    } catch (e) { if (!signal.aborted) { setStatus(undefined); setError(e instanceof Error ? e.message : 'Trader status unavailable.'); } }
    finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  }
  useEffect(() => {
    const c = new AbortController(); active.current = c; void request('/trader-status', c.signal);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void request('/trader-status', c.signal); }, 5000);
    return () => { c.abort(); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);
  return <div className="operator-runtime" aria-label="Autonomous trader runtime" aria-busy={busy}>
    <div className="operator-runtime-heading"><h3>Agent runtime</h3></div><p className="small">Runs on the backend and continues when this page closes.</p>
    {status && <><Badge tone={status.state === 'blocked' || status.state === 'error' || status.state === 'budget' ? 'amber' : status.running ? 'purple' : 'neutral'}>{!status.configured ? 'Worker not configured' : `${status.running ? 'Running' : 'Stopped'} · ${status.state}`}</Badge><p role="status">{status.message}</p><p className="small muted">Last state change {new Date(status.changedAt).toLocaleString()}.{status.observedAt && ` Last worker cycle ${new Date(status.observedAt).toLocaleString()}.`}</p>
      {status.transactionHash && <p className="small"><a className="text-link" href={`https://testnet.monadexplorer.com/tx/${status.transactionHash}`} target="_blank" rel="noreferrer">Inspect agent transaction · {status.transactionHash.slice(0, 12)}…</a></p>}
    </>}
    <div className="review-actions"><button className="button secondary" disabled={busy || !status?.configured || status.running} onClick={() => { if (active.current) void request('/trader-start', active.current.signal); }}>Start agent trader</button><button className="button secondary" disabled={busy || !status?.running || status.state === 'stopping'} onClick={() => { if (active.current) void request('/trader-stop', active.current.signal); }}>Stop agent trader</button><button className="text-button" disabled={busy} onClick={() => { if (active.current) void request('/trader-status', active.current.signal); }}>{busy?'Checking…':'Refresh status'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <details className="operator-details"><summary>How stopping works</summary><p className="small">Stopping the worker leaves its on-chain permission active and cannot cancel submitted transactions. Revoke permission above to block future trades.</p></details>
  </div>;
}
