import { formatUnits } from 'viem';
import { Download, RefreshCw } from 'lucide-react';
import { activityLabel, chainLabel, identityMatches, runtimeLabel, type AgentState } from '../lib/agent-state';
import { downloadJson } from '../lib/registration';
import { Badge, CopyValue, Eyebrow, Note } from './UI';
export function AgentStateEvidence({ data, error, busy, stale, onRefresh }: { data?: AgentState; error: string; busy: boolean; stale: boolean; onRefresh: () => void }) {
  const o = data?.observation;
  const quote = (value: string) => o ? `${formatUnits(BigInt(value), o.quote.decimals)} ${o.quote.symbol}` : '';
  return <section className="panel profile-performance" aria-label="Observed agent state" aria-busy={busy}>
    <Eyebrow>AGENT STATE & TRADING EVIDENCE</Eyebrow><h2>{error && !data ? 'Evidence check failed' : chainLabel(data, stale)}</h2>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Reading this registration’s vault, identity and local worker state…</p>}
    {data?.chainError && <p role="alert">{data.chainError}</p>}
    {stale && <Note>Showing an earlier cached snapshot. Its block and original observation time are unchanged; background refresh must finish before treating it as current.</Note>}
    {busy && data && <p role="status" className="small">Refreshing in the background; the last observed snapshot remains visible.</p>}
    {o && <>
      <p className="small muted">Monad testnet · chain {o.chainId} · block {o.blockNumber} · {new Date(o.checkedAt).toLocaleString()}</p>
      <div className="profile-performance-values"><div><small>Vault NAV at this block</small><strong>{o.nav !== undefined ? quote(o.nav) : 'NAV read unavailable'}</strong></div><div><small>Pump shares issued</small><strong>{formatUnits(BigInt(o.shares), o.shareDecimals)}</strong></div></div>
      <div className="definition-grid"><div><small>Vault cash</small><strong>{quote(o.cash)}</strong></div><div><small>{o.positionToken.symbol} held</small><strong>{formatUnits(BigInt(o.position), o.positionToken.decimals)}</strong></div><div><small>Deposits in observed window</small><strong>{quote(o.activity.depositedQuoteUnits)} · {o.activity.deposits} events</strong></div><div><small>Withdrawals in observed window</small><strong>{quote(o.activity.withdrawnQuoteUnits)} · {o.activity.withdrawals} events</strong></div></div>
      <p>{activityLabel(data, stale)}. <Badge tone={o.permission?.active ? 'purple' : 'neutral'}>{!o.permissionSupported ? 'Permission read unavailable' : o.permission?.active ? 'Trading permission active' : 'Trading permission inactive'}</Badge></p>
      <p className="small">Current identity checks: {identityMatches(o) ? 'owner, published manifest, authority, strategy/risk commitments and mandate match this signed registration' : 'one or more current identity checks differ from this signed registration'}.</p>
      {!o.valuation.available && <p className="small">The valuation source did not establish an available NAV at this block.{o.valuation.reason && <> Source result: <code>{o.valuation.reason}</code>.</>}</p>}
      <details className="native-technical"><summary>State provenance & current enforced limits</summary><p>Every contract read is anchored to this block. Activity is checked against mined receipts from the configured Monad RPC. A single RPC and reviewed code artifacts are trust boundaries.</p><p>Per-trade cap: {quote(o.mandate.perTradeQuoteUnits)}. Position cap: {quote(o.mandate.maxPositionQuoteUnits)}. Expense budget: {quote(o.mandate.expenseBudget)}. Configuration notice: {o.mandate.configurationNoticeSeconds} seconds.</p><CopyValue value={o.blockHash} label="state anchor block hash"/><CopyValue value={o.identity.strategyHash} label="current strategy binding hash"/><CopyValue value={o.identity.riskHash} label="current risk binding hash"/><CopyValue value={o.configHash} label="observed configuration hash"/><CopyValue value={o.valuation.source} label="observed valuation source"/></details>
      <Note>History coverage: blocks {o.history.fromBlock}–{o.history.toBlock}{o.history.deploymentBlock && <>; vault deployed at block {o.history.deploymentBlock}</>}. {o.history.completePerformanceHistory ? 'Complete accounting coverage is reported by the source.' : 'This is a recent vault-event window, not complete accounting history. It cannot establish net returns or a performance trust score.'} Deposits are capital contributions. A zero trade count applies only to this window.</Note>
    </>}
    {data?.runtime && <><h3>Local worker: {runtimeLabel(data)}</h3><p>{data.runtime.message}</p><p className="small muted">Backend observation {new Date(data.checkedAt).toLocaleString()}. Last state change {new Date(data.runtime.changedAt).toLocaleString()}{data.runtime.observedAt && <>; last worker cycle {new Date(data.runtime.observedAt).toLocaleString()}</>}. This is host-reported runtime state, not proof of model execution.</p></>}
    {data?.runtimeError && <p role="alert">{data.runtimeError}</p>}
    <button className="button secondary" disabled={busy} onClick={onRefresh}><RefreshCw size={14}/>{busy ? 'Reading evidence…' : 'Refresh agent state'}</button>
    {data && <button className="button secondary" onClick={() => downloadJson(`pumpcoin-agent-state-${data.registrationId}.json`, data)}><Download size={14}/>Export observed state</button>}
  </section>;
}
