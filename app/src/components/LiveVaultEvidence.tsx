import { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { RefreshCw, ExternalLink } from 'lucide-react';
import type { LiveVaultObservation } from '../../../agent-registration/types';
import { registrationRequest, registrationSession, type RegistrationRecord } from '../lib/agent-registration';
import { Badge, CopyValue, Note } from './UI';

const explorer = 'https://testnet.monadexplorer.com';
export function LiveVaultEvidence({ record }: { record: RegistrationRecord }) {
  const [data, setData] = useState<LiveVaultObservation>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const current = useRef<AbortController | undefined>(undefined), lock = useRef(false);
  async function refresh(signal: AbortSignal) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const session = await registrationSession(signal), result = await registrationRequest(session.token, '/live-vault', { id: record.id }, signal);
      if (result.observation.chainId !== 10143 || result.observation.vault.toLowerCase() !== record.binding?.vault.toLowerCase()) throw new Error('Evidence does not belong to this Monad vault.');
      if (!signal.aborted) setData(result.observation);
    } catch (e) { if (!signal.aborted) { setData(undefined); setError(e instanceof Error ? e.message : 'Monad evidence could not be refreshed.'); } }
    finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  }
  useEffect(() => {
    if (record.binding?.chainId !== 10143) return;
    const c = new AbortController(); current.current = c; void refresh(c.signal);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(c.signal); }, 30000);
    return () => { c.abort(); clearInterval(timer); };
    // The parent keys this view by registration ID; do not restart on wallet changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, record.binding?.vault]);
  if (record.binding?.chainId !== 10143) return null;
  return <section className="panel" style={{ marginTop: 24 }} aria-label="Live Monad vault evidence">
    <div className="panel-heading"><h2>Live vault & receipts</h2><Badge tone="neutral">Monad testnet · 10143</Badge></div>
    <p>Reads the deployed vault and mined receipts from Monad. Updates every 30 seconds while this page is visible.</p>
    <a className="text-link" href={`${explorer}/address/${record.binding.vault}`} target="_blank" rel="noreferrer">View deployed vault <ExternalLink size={14} /></a>
    <button className="button secondary" disabled={busy} onClick={() => { if (current.current) void refresh(current.current.signal); }}><RefreshCw size={14} />{busy ? 'Reading Monad…' : 'Refresh live evidence'}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {data && <>
      <p className="small muted">Observed at block {data.blockNumber} · {new Date(data.checkedAt).toLocaleString()}. Refresh to check current state.</p>
      <div className="definition-grid">
        <div><small>Vault cash</small><strong>{formatUnits(BigInt(data.cash), 6)} test-USDC</strong></div>
        <div><small>WMON position</small><strong>{formatUnits(BigInt(data.position), data.positionDecimals)}</strong></div>
        <div><small>Total Pump tokens</small><strong>{formatUnits(BigInt(data.shares), data.shareDecimals)}</strong></div>
        <div><small>Vault NAV</small><strong>{data.nav !== undefined ? `${formatUnits(BigInt(data.nav), 6)} test-USDC` : 'Valuation unavailable'}</strong></div>
      </div>
      <p><Badge tone={data.paused ? 'amber' : 'purple'}>{data.paused ? 'Vault paused' : 'Vault enabled'}</Badge> <Badge tone={data.permission?.active ? 'purple' : 'neutral'}>{!data.permissionSupported ? 'Older vault · permissions unavailable' : data.permission?.active ? 'Trading permission active' : 'Trading permission inactive'}</Badge></p>
      {data.permission && <p className="small">UTC turnover: {formatUnits(BigInt(data.permission.dailyQuoteTraded), 6)} / {formatUnits(BigInt(data.permission.dailyQuoteCap), 6)} test-USDC. {data.permission.validUntil !== '0' && `Permission expires ${new Date(Number(data.permission.validUntil) * 1000).toLocaleString()}.`}</p>}
      <h3>Current manager</h3><CopyValue value={data.manager} label="live vault manager" />
      <h3>Current configuration</h3><CopyValue value={data.configHash} label="live vault configuration" />
      <h3>Recent confirmed activity</h3>
      <p className="small muted">Up to {data.history.transactionLimit} transactions emitting vault events in blocks {data.history.fromBlock}–{data.history.toBlock}. Failed calls generally emit no events and are absent here.</p>
      {!data.transactions.length ? <p>No vault events found in this recent block window.</p> : <div className="table-wrap"><table><thead><tr><th>Events</th><th>Block / status</th><th>Receipt</th></tr></thead><tbody>{data.transactions.map(tx => <tr key={tx.hash}>
        <td>{tx.events.map((e, i) => <details key={i}><summary>{e.name}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 280 }}>{JSON.stringify(e.values, null, 2)}</pre></details>)}<small>Sender: {tx.sender}</small></td>
        <td>{tx.blockNumber}<br /><Badge tone={tx.status === 'success' ? 'neutral' : 'amber'}>{tx.status === 'success' ? 'Confirmed' : 'Reverted'}</Badge></td>
        <td><a className="text-link" href={`${explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer">{tx.hash.slice(0, 10)}…{tx.hash.slice(-6)} <ExternalLink size={14} /></a></td>
      </tr>)}</tbody></table></div>}
      <Note>This recent activity view is not complete performance history. Deposits are capital contributions; current NAV alone does not establish trading profit. Testnet tokens have no investment-performance claim.</Note>
    </>}
  </section>;
}
