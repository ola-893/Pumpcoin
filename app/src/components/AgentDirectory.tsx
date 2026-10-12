import { AutonomyControls } from './AutonomyControls';
import { NativeInvestment } from './NativeInvestment';
import { VaultTrading } from './VaultTrading';
import { VaultSetup } from './VaultSetup';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, Cpu, Download, Fingerprint, RefreshCw, ShieldCheck, Search } from 'lucide-react';
import { ActionLink, Badge, CopyValue, Empty, Eyebrow, Note, PageTitle } from './UI';
import { filterAgents, loadDirectory, quoteAmount, type AgentFilter, type DirectoryAgent } from '../lib/agent-directory';
import { registrationRequest, type RegistrationRecord } from '../lib/agent-registration';
import { downloadJson } from '../lib/registration';

function useDirectory() {
  const [state, setState] = useState<{ agents: DirectoryAgent[]; revision: number; error: string; configured: boolean; token?: string }>({ agents: [], revision: -1, error: '', configured: false });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadDirectory(controller.signal).then(data => setState({ ...data, revision, error: '' })).catch(() => {
      if (!controller.signal.aborted) setState({ agents: [], revision, error: 'Could not load and verify agent registrations. Use the local PumpCoin server, then retry. No cached or example agents are shown.', configured: false });
    });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => { const reload = () => setRevision(r => r + 1); window.addEventListener('focus', reload); return () => window.removeEventListener('focus', reload); }, []);
  const loading = state.revision !== revision;
  return { ...state, loading, agents: loading ? [] : state.agents, error: loading ? '' : state.error, refresh: () => setRevision(r => r + 1) };
}
const when = (value: string) => new Date(value).toLocaleString();
function Avatar() { return <div className="agent-avatar large" aria-hidden="true"><Fingerprint size={28} /></div>; }
function RegistrationCard({ agent }: { agent: DirectoryAgent }) {
  const r = agent.latest, m = r.manifest;
  return <Link className="agent-card registered-agent-card" to={`/agents/${agent.id}`}>
    <div className="agent-card-main"><Avatar /><div><div className="agent-card-title"><h3>{m.name}</h3><Badge>Registered locally</Badge></div><p className="strategy-preview">{m.strategy.description}</p><div className="agent-tags"><span>{m.model.id}</span><span>{m.strategy.pair}</span><span>Self-hosted declaration</span></div></div></div>
    <div className="agent-card-stats"><div><small>Vault binding</small><strong className="directory-card-status">{r.binding ? 'Recorded' : 'Finish setup'}</strong><span>{r.binding ? `Historical · block ${r.binding.blockNumber}` : 'Controller deployment required'}</span></div><div><small>Signed versions</small><strong>{agent.versions.length}</strong><span>Performance unavailable</span></div><div className="card-arrow"><ArrowUpRight size={24} /></div></div>
  </Link>;
}
export function AgentDirectory() {
  const state = useDirectory(), [query, setQuery] = useState(''), [filter, setFilter] = useState<AgentFilter>('all'), [limit, setLimit] = useState(20);
  const matches = filterAgents(state.agents, query, filter), bindings = state.agents.filter(a => a.latest.binding).length;
  return <div className="container page"><PageTitle eyebrow="AGENT DIRECTORY" title={<>Find intelligence<br /><em>you can inspect.</em></>} body="Browse agents registered on this PumpCoin instance. Inspect signed declarations, strategy versions and recorded vault checks."><ActionLink to="/register" secondary>Register an agent</ActionLink></PageTitle>
    <div className="directory-summary"><span><strong>{state.loading || state.error ? '—' : state.agents.length}</strong> registered agents</span><span><strong>{state.loading || state.error ? '—' : bindings}</strong> recorded vault bindings</span><span><Cpu size={16} /> Self-hosted inference required</span></div>
    <div className="toolbar"><label className="search-box"><Search size={18} /><input aria-label="Search agents" placeholder="Search agent, strategy, model or address" value={query} onChange={e => { setQuery(e.target.value); setLimit(20); }} /></label><div className="filter-pills" aria-label="Agent status">{(['all', 'pending', 'binding'] as const).map(f => <button aria-pressed={filter === f} key={f} className={filter === f ? 'selected' : ''} onClick={() => { setFilter(f); setLimit(20); }}>{f === 'all' ? 'All agents' : f === 'pending' ? 'Vault pending' : 'Binding recorded'}</button>)}</div><button className="button secondary" disabled={state.loading} onClick={state.refresh}><RefreshCw size={15} />Refresh agents</button></div>
    {state.loading ? <p role="status" className="directory-status">Loading and verifying signed registrations…</p> : state.error ? <div role="alert"><Note>{state.error}</Note></div> : !state.agents.length ? <Empty title="No registered agents yet."><p>Complete both wallet authorizations and the local inference check to register your first agent. An unsigned draft does not appear here.</p><ActionLink to="/register">Register an agent</ActionLink></Empty> : !matches.length ? <Empty title="No agents match these filters."><p>Search the latest signed configuration or change the vault status filter.</p><button className="button secondary" onClick={() => { setQuery(''); setFilter('all'); }}>Reset filters</button></Empty> : <><p className="small muted" role="status">{matches.length} agent{matches.length === 1 ? '' : 's'} · latest signed versions</p><div className="registered-agents">{matches.slice(0, limit).map(a => <RegistrationCard key={a.id} agent={a} />)}</div>{matches.length > limit && <button className="button secondary" onClick={() => setLimit(x => x + 20)}>Show more agents</button>}</>}
    <Note>This directory reads this server’s signed registration store, not a global on-chain index. Local inference checks use synthetic inputs. Recorded vault bindings are point-in-time checks; funded performance and investing are unavailable.</Note>
  </div>;
}
export function RegisteredAgentProfile() {
  const { agentId } = useParams();
  return <RegisteredAgentDetails key={agentId} agentId={agentId} />;
}
function RegisteredAgentDetails({ agentId }: { agentId?: string }) {
  const state = useDirectory(), [versionId, setVersionId] = useState<string>(), [busy, setBusy] = useState(false), [checkError, setCheckError] = useState('');
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), []);
  const agent = state.agents.find(a => a.id === agentId), r = agent?.versions.find(v => v.id === versionId) ?? agent?.latest;
  async function recheck(record: RegistrationRecord) {
    if (!state.token) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setCheckError('');
    try { await registrationRequest(state.token, '/verify-binding', { id: record.id, agentId: record.binding!.agentId }, controller.signal); if (!controller.signal.aborted) state.refresh(); }
    catch { if (!controller.signal.aborted) setCheckError('The current deployment could not confirm this binding. The receipt below remains historical; do not treat it as current trading authority.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  if (state.loading) return <div className="container page"><p role="status">Loading and verifying the agent’s signed history…</p></div>;
  if (state.error) return <div className="container page"><Note>{state.error}</Note><button className="button secondary" onClick={state.refresh}>Retry agent lookup</button></div>;
  if (!agent || !r) return <div className="container page"><Empty title="Agent registration not found."><p>This address may belong to another PumpCoin instance, or registration has not been completed. No example profile is substituted.</p><ActionLink to="/agents">Explore agents</ActionLink></Empty></div>;
  const m = r.manifest, b = r.binding, historical = r.id !== agent.latest.id;
  return <div className="container page"><Link to="/agents" className="breadcrumb">Agents <ChevronRight size={14} />{m.name}</Link><div className="profile-heading"><Avatar /><div><div className="title-badges"><Eyebrow>SIGNED LOCAL REGISTRATION</Eyebrow><Badge>{historical ? 'Historical configuration' : 'Latest signed configuration'}</Badge></div><h1>{m.name}</h1><p>{m.model.id} · {m.strategy.pair} · registered {when(r.registeredAt)}</p></div></div>
    <div className="agent-version-controls"><label htmlFor="agent-version">Configuration history</label><select id="agent-version" disabled={busy} value={r.id} onChange={e => { setVersionId(e.target.value); setCheckError(''); }}>{agent.versions.map((v, index) => <option key={v.id} value={v.id}>{index === 0 ? 'Latest' : `Earlier version ${agent.versions.length - index}`} · {when(v.registeredAt)} · {v.commitment.slice(0, 10)}</option>)}</select><button className="button secondary" disabled={busy} onClick={state.refresh}><RefreshCw size={15} />Refresh agent</button></div>
    <div className="profile-grid"><div className="profile-content">
      <section className="panel"><Eyebrow>STRATEGY · OPERATOR DECLARATION</Eyebrow><h2>The proposed trading strategy.</h2><p className="agent-strategy">{m.strategy.description}</p><div className="definition-grid"><div><small>Proposed market</small><strong>{m.strategy.pair}</strong></div><div><small>Leverage</small><strong>None declared</strong></div><div><small>Trade cap</small><strong>{quoteAmount(m.proposedMandate.perTradeQuoteUnits)} quote units</strong></div><div><small>Position cap</small><strong>{quoteAmount(m.proposedMandate.maxPositionQuoteUnits)} quote units</strong></div><div><small>Slippage ceiling</small><strong>{m.proposedMandate.slippageBps} basis points · declared</strong></div></div><h3>Strategy code commitment</h3><CopyValue value={m.strategy.codeDigest} label="strategy code digest" /><Note>These are signed proposed limits. A declaration alone does not enforce vault permissions or prove execution of the strategy code.</Note></section>
      <section className="panel"><Eyebrow>IDENTITY & AUTHORIZATION</Eyebrow><h2>Two roles. One signed configuration.</h2><p>Both EOA signatures were checked against this exact manifest, role, origin, chain and registration nonce.</p><h3>Controller</h3><CopyValue value={m.controller} label="controller" /><h3>Execution key</h3><CopyValue value={m.executionKey} label="execution key" /><h3>Local agent identifier</h3><CopyValue value={agent.id} label="local agent identifier" /><p className="small muted">This local identifier groups the same chain, controller and name. It is not an ERC-8004 registration token. Changing the name or controller creates a different local identity.</p><h3>Signed public manifest</h3><CopyValue value={r.commitment} label="signed manifest commitment" /></section>
      <section className="panel"><Eyebrow>LOCAL INFERENCE EVIDENCE</Eyebrow><h2>{m.model.id}</h2><Badge tone="neutral">Locally observed · not attested</Badge><p>A local inference and deterministic paper guard check was recorded at {when(r.worker.checkedAt)}. Raw proposal: {r.worker.rawProposal.action} / {quoteAmount(r.worker.rawProposal.quoteUnits)} quote units. Guarded proposal: {r.worker.guardedProposal.action} / {quoteAmount(r.worker.guardedProposal.quoteUnits)} quote units.</p><p className="small muted">Synthetic stale inputs, unavailable valuation and no funds. This check does not establish current uptime, strategy execution or trading performance.</p><h3>Model weights</h3><CopyValue value={m.model.weightsDigest} label="weights digest" /><h3>Runtime artifact</h3><CopyValue value={m.model.runtimeDigest} label="runtime digest" /><h3>Declared external dependencies</h3><ul className="agent-dependencies">{m.dependencies.map((d, i) => <li key={i}>{d}</li>)}</ul><h3>Worker receipt commitment</h3><CopyValue value={r.worker.receiptHash} label="worker receipt hash" /></section>
      <section className="panel"><Eyebrow>VAULT BINDING EVIDENCE</Eyebrow><h2>{b ? 'A recorded deployment check.' : 'Vault binding pending.'}</h2>{b ? <><Badge tone="neutral">Historical snapshot · {b.mode}</Badge><p>Checked {when(b.checkedAt)} at block {b.blockNumber} on chain {b.chainId}. Current owner, permissions and configuration may have changed.</p><h3>Identity registry · agent ID {b.agentId}</h3><CopyValue value={b.identityRegistry} label="identity registry" /><h3>Vault</h3><CopyValue value={b.vault} label="vault" /><h3>Configuration at this block</h3><CopyValue value={b.configHash} label="vault configuration hash" /><h3>Anchor block</h3><CopyValue value={b.blockHash} label="binding block hash" />{state.configured && !historical ? <button className="button secondary" disabled={busy} onClick={() => void recheck(r)}><ShieldCheck size={15} />{busy ? 'Checking current deployment…' : 'Recheck deployed binding'}</button> : <p className="small muted">{historical ? 'Inspect the latest signed version before requesting a current deployment check.' : 'No reviewed deployment is configured for a fresh check on this server.'}</p>}</> : historical ? <p>Inspect the latest signed configuration to finish vault setup.</p> : <VaultSetup record={r} onComplete={state.refresh} />}{checkError && <p className="form-error" role="alert">{checkError}</p>}</section>
      {!historical && <NativeInvestment key={r.id} record={r} />}
      {b && !historical && <VaultTrading record={r} />}
      {!historical && <AutonomyControls key={r.id} record={r} />}
    </div><aside className="investment-panel"><Eyebrow>INVESTOR READINESS</Eyebrow><h2>Inspect before investing.</h2><Badge tone="amber">Not investment eligible</Badge><div className="investment-status"><ShieldCheck size={18} /><span>Testnet deposit controls<br /><small>Inspect current readiness on this profile</small></span></div><h3>Performance</h3><p>No reconciled funded trading record is connected to this registration. NAV, returns, assets under management and Pump token valuations are unavailable.</p><button className="button secondary full" onClick={() => downloadJson('pumpcoin-agent-registration-receipt.json', r)}><Download size={16} />Export signed receipt</button><p className="small muted">Includes the public declaration, both authorizations and scoped evidence. Private runtime configuration stays on the server.</p></aside></div>
  </div>;
}
