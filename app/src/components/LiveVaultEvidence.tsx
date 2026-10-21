import { useAgentState } from '../lib/use-agent-state';
import { formatUnits } from 'viem';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { type RegistrationRecord } from '../lib/agent-registration';
import { Badge, CopyValue, Note } from './UI';

const explorer = 'https://testnet.monadexplorer.com';
type Observation = ReturnType<typeof useAgentState>;
export function LiveVaultEvidence({ record, observed }: { record: RegistrationRecord; observed?: Observation }) {
  return observed ? <VaultEvidence record={record} observed={observed}/> : <StandaloneVaultEvidence record={record}/>;
}
function StandaloneVaultEvidence({ record }: { record: RegistrationRecord }) {
  const observed = useAgentState(record);
  return <VaultEvidence record={record} observed={observed}/>;
}
function VaultEvidence({ record, observed }: { record: RegistrationRecord; observed: Observation }) {
  const data = observed.data?.observation, busy = observed.busy, error = observed.error || observed.data?.chainError;
  if (record.binding?.chainId !== 10143) return null;
  return <section className="panel" aria-label="Live Monad vault evidence">
    <div className="panel-heading"><h2>Vault activity on Monad</h2><Badge tone="neutral">Monad testnet · {record.binding.chainId}</Badge></div>
    <p>Reads the deployed vault and mined receipts from Monad. Updates every 60 seconds while this page is visible.</p>
    <a className="text-link" href={`${explorer}/address/${record.binding.vault}`} target="_blank" rel="noreferrer">View deployed vault <ExternalLink size={14} /></a>
    <button className="button secondary" disabled={busy} onClick={observed.refresh}><RefreshCw size={14} />{busy ? 'Reading Monad…' : 'Refresh live evidence'}</button>
    {busy && !data && <p role="status" className="small">Reading the public vault and confirmed receipts…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {data && <>
      {observed.stale && <Note>This is an earlier snapshot; refresh to establish current state.</Note>}
      <p className="small muted">Observed at block {data.blockNumber} · {new Date(data.checkedAt).toLocaleString()}. Refresh to check current state.</p>
      <div className="definition-grid">
        <div><small>Vault cash</small><strong>{formatUnits(BigInt(data.cash), data.quote.decimals)} {data.quote.symbol}</strong></div>
        <div><small>{data.positionToken.symbol} position</small><strong>{formatUnits(BigInt(data.position), data.positionDecimals)}</strong></div>
        <div><small>Total Pump tokens</small><strong>{formatUnits(BigInt(data.shares), data.shareDecimals)}</strong></div>
        <div><small>Vault NAV</small><strong>{data.nav !== undefined ? `${formatUnits(BigInt(data.nav), data.quote.decimals)} ${data.quote.symbol}` : 'Valuation unavailable'}</strong></div>
      </div>
      <p><Badge tone={data.paused ? 'amber' : 'purple'}>{data.paused ? 'Vault paused' : 'Vault enabled'}</Badge> <Badge tone={data.permission?.active ? 'purple' : 'neutral'}>{!data.permissionSupported ? 'Permission read unavailable' : data.permission?.active ? 'Trading permission active' : 'Trading permission inactive'}</Badge></p>
      {data.permission && <p className="small">UTC turnover: {formatUnits(BigInt(data.permission.dailyQuoteTraded), data.quote.decimals)} / {formatUnits(BigInt(data.permission.dailyQuoteCap), data.quote.decimals)} {data.quote.symbol}. {data.permission.validUntil !== '0' && `Permission expires ${new Date(Number(data.permission.validUntil) * 1000).toLocaleString()}.`}</p>}
      <details className="native-technical"><summary>Current manager & configuration</summary><h3>Current manager</h3><CopyValue value={data.manager} label="live vault manager" />
      <h3>Current configuration</h3><CopyValue value={data.configHash} label="live vault configuration" /></details>
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
