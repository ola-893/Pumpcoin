import {executionNetwork} from '../../../agent-registration/networks';
import { formatUnits } from 'viem';
import { Download, RefreshCw } from 'lucide-react';
import { chainLabel, identityMatches, runtimeLabel, type AgentState } from '../lib/agent-state';
import { downloadJson } from '../lib/registration';
import { Badge, CopyValue } from './UI';
export function AgentStateEvidence({ data, error, busy, stale, onRefresh }: { data?: AgentState; error: string; busy: boolean; stale: boolean; onRefresh: () => void }) {
  const o = data?.observation;
  const quote = (value: string) => o ? `${formatUnits(BigInt(value), o.quote.decimals)} ${o.quote.symbol}` : '';
  return <section className="panel profile-performance" aria-label="Observed agent state" aria-busy={busy}>
    <div className="panel-heading"><h2>{error && !data ? 'Vault state unavailable' : chainLabel(data, stale)}</h2><button className="profile-refresh" aria-label="Refresh vault state" disabled={busy} onClick={onRefresh}><RefreshCw size={15} className={busy?'profile-spinning':''}/>{busy?'Updating…':'Refresh'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading vault…</p>}
    {data?.chainError && data.chainError!==error && <p role="alert">{data.chainError}</p>}
    {stale && <p className="small" role="status">Earlier snapshot · refresh required</p>}
    {o && <>
      <p className="small muted">Block {o.blockNumber} · {new Date(o.checkedAt).toLocaleString()}</p>
      <div className="profile-performance-values"><div><small>Vault value</small><strong>{o.nav !== undefined ? quote(o.nav) : 'Unavailable'}</strong></div><div><small>Pump shares issued</small><strong>{formatUnits(BigInt(o.shares), o.shareDecimals)}</strong></div></div>
      <p className="small">{o.activity.trades} trades in observed window <Badge tone={o.permission?.active ? 'purple' : 'neutral'}>{!o.permissionSupported ? 'Permission unknown' : o.permission?.active ? 'Permission active' : 'Permission inactive'}</Badge></p>
      {!identityMatches(o)&&<p className="form-error" role="alert">Current identity or limits differ from the signed record.</p>}
      <details className="native-technical"><summary>Balances & capital flows</summary><div className="definition-grid"><div><small>Cash</small><strong>{quote(o.cash)}</strong></div><div><small>{o.positionToken.symbol} held</small><strong>{formatUnits(BigInt(o.position), o.positionToken.decimals)}</strong></div><div><small>Deposits</small><strong>{quote(o.activity.depositedQuoteUnits)} · {o.activity.deposits} events</strong></div><div><small>Withdrawals</small><strong>{quote(o.activity.withdrawnQuoteUnits)} · {o.activity.withdrawals} events</strong></div></div></details>
      <details className="native-technical"><summary>Source, limits & history coverage</summary><p>{executionNetwork(o.chainId).name} · blocks {o.history.fromBlock}–{o.history.toBlock}{o.history.deploymentBlock&&<> · deployed {o.history.deploymentBlock}</>}. {o.history.completePerformanceHistory?'Source reports complete accounting coverage.':'Partial history; net returns and a performance rating cannot be established.'} Deposits are capital, not profit.</p><p>Reads are anchored to this block and receipts. The configured RPC and reviewed code are trust boundaries.</p><p>Per trade: {quote(o.mandate.perTradeQuoteUnits)}. Position: {quote(o.mandate.maxPositionQuoteUnits)}. Expenses: {quote(o.mandate.expenseBudget)}. Configuration notice: {o.mandate.configurationNoticeSeconds}s.</p>{!o.valuation.available&&<p>Valuation unavailable.{o.valuation.reason&&<> Source result: <code>{o.valuation.reason}</code>.</>}</p>}<CopyValue value={o.blockHash} label="state anchor block hash"/><CopyValue value={o.identity.strategyHash} label="current strategy binding hash"/><CopyValue value={o.identity.riskHash} label="current risk binding hash"/><CopyValue value={o.configHash} label="observed configuration hash"/><CopyValue value={o.valuation.source} label="observed valuation source"/></details>
    </>}
    {(data?.runtime||data?.runtimeError)&&<details className="native-technical"><summary>Local worker</summary>{data.runtime&&<><p>{runtimeLabel(data)} · {data.runtime.message}</p><p className="small">Observed {new Date(data.checkedAt).toLocaleString()}. Last change {new Date(data.runtime.changedAt).toLocaleString()}{data.runtime.observedAt&&<> · last cycle {new Date(data.runtime.observedAt).toLocaleString()}</>}. Host-reported; not execution attestation.</p></>}{data.runtimeError&&<p role="alert">{data.runtimeError}</p>}</details>}
    {data && <details className="native-technical"><summary>Export observation</summary><button className="text-button" onClick={() => downloadJson(`pumpcoin-agent-state-${data.registrationId}.json`, data)}><Download size={14}/>Download JSON</button></details>}
  </section>;
}
