import { AgentProfile } from './AgentProfile';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Cpu, Fingerprint, RefreshCw, Search } from 'lucide-react';
import { ActionLink, Badge, Empty, Note, PageTitle } from './UI';
import { filterAgents, loadDirectory, type AgentFilter, type DirectoryAgent } from '../lib/agent-directory';
import { registrationRequest, type RegistrationRecord } from '../lib/agent-registration';

function useDirectory() {
  const [state, setState] = useState<{ agents: DirectoryAgent[]; revision: number; error: string; configured: boolean; token?: string }>({ agents: [], revision: -1, error: '', configured: false });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadDirectory(controller.signal).then(data => { if (!controller.signal.aborted) setState({ ...data, revision, error: '' }); }).catch(() => {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, revision, error: 'Could not refresh verified registrations. Check the PumpCoin server and retry. Previously loaded details may be out of date.' }));
    });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => { const reload = () => setRevision(r => r + 1); window.addEventListener('focus', reload); return () => window.removeEventListener('focus', reload); }, []);
  const refreshing = state.revision !== revision;
  // Keep signed details and transaction forms mounted when a wallet prompt returns focus.
  return { ...state, loading: refreshing && state.revision === -1, refreshing, refresh: () => setRevision(r => r + 1) };
}
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
    <Note>This directory reads this server’s signed registration store, not a global on-chain index. Local inference checks use synthetic inputs. Recorded vault bindings are point-in-time checks. Check each profile for current deposit readiness. A registration or vault deployment does not establish trading performance.</Note>
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
  if (state.error && !agent) return <div className="container page"><Note>{state.error}</Note><button className="button secondary" onClick={state.refresh}>Retry agent lookup</button></div>;
  if (!agent || !r) return <div className="container page"><Empty title="Agent registration not found."><p>This address may belong to another PumpCoin instance, or registration has not been completed. No example profile is substituted.</p><ActionLink to="/agents">Explore agents</ActionLink></Empty></div>;
  return <AgentProfile agent={agent} record={r} refreshing={state.refreshing} error={state.error} configured={state.configured} checking={busy} checkError={checkError} onRefresh={state.refresh} onVersion={id => { setVersionId(id); setCheckError(''); }} onRecheck={() => void recheck(r)} />;
}
