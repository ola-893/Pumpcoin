import { useEffect, useRef, useState } from 'react';
import type { RuntimeStatus } from '../../../agent-registration/types';
import { registrationRequest, registrationSession, type RegistrationRecord } from '../lib/agent-registration';
import { Badge, Note } from './UI';

export function AutonomousTrader({ record }: { record: RegistrationRecord }) {
  const [status, setStatus] = useState<RuntimeStatus>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), active = useRef<AbortController | undefined>(undefined);
  async function request(route: '/trader-status' | '/trader-start' | '/trader-stop', signal: AbortSignal) {
    if (lock.current) return; lock.current = true; setBusy(true);
    try {
      const session = await registrationSession(signal), response = await registrationRequest(session.token, route, { id: record.id }, signal);
      if (!signal.aborted) { setStatus(response.runtime); setError(''); }
    } catch (e) { if (!signal.aborted) { setStatus(undefined); setError(e instanceof Error ? e.message : 'Trader status unavailable.'); } }
    finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  }
  useEffect(() => {
    const c = new AbortController(); active.current = c; void request('/trader-status', c.signal);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void request('/trader-status', c.signal); }, 5000);
    return () => { c.abort(); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);
  return <div style={{ marginTop: 24 }} aria-label="Autonomous trader runtime">
    <h3>Agent trader</h3><p>The backend signs and submits permitted trades. Starting the trader uses the server’s reviewed deployment for this registration.</p>
    {status && <><Badge tone={status.state === 'blocked' || status.state === 'error' ? 'amber' : status.running ? 'purple' : 'neutral'}>{status.state === 'starting' ? 'Starting' : status.state === 'hold' ? 'Running · holding' : status.state === 'blocked' ? 'Running · trading blocked' : status.state === 'unconfigured' ? 'Setup required' : status.state === 'stopping' ? 'Stopping' : status.running ? 'Trader running' : 'Trader stopped'}</Badge><p role="status">{status.message}</p><p className="small muted">Status observed {new Date(status.changedAt).toLocaleString()}.{status.observedAt && ` Last worker cycle ${new Date(status.observedAt).toLocaleString()}.`}</p>
      {status.transactionHash && <p className="small"><a className="text-link" href={`https://testnet.monadexplorer.com/tx/${status.transactionHash}`} target="_blank" rel="noreferrer">Inspect agent transaction · {status.transactionHash.slice(0, 12)}…</a></p>}
    </>}
    <div className="review-actions"><button className="button secondary" disabled={busy || !status?.configured || status.running} onClick={() => { if (active.current) void request('/trader-start', active.current.signal); }}>Start agent trader</button><button className="button secondary" disabled={busy || !status?.running || status.state === 'stopping'} onClick={() => { if (active.current) void request('/trader-stop', active.current.signal); }}>Stop agent trader</button><button className="text-button" disabled={busy} onClick={() => { if (active.current) void request('/trader-status', active.current.signal); }}>Refresh trader status</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <Note>Stopping the process does not revoke its on-chain permission or cancel submitted transactions. Use controller revocation above to disable future trades. The trader continues when you close this page while the backend stays running.</Note>
  </div>;
}
