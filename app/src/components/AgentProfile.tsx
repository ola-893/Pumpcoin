import {executionNetwork} from '../../../agent-registration/networks';
import { useAgentState } from '../lib/use-agent-state';
import { identityMatches } from '../lib/agent-state';
import { AgentStateEvidence } from './AgentStateEvidence';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, Cpu, Download, Fingerprint, RefreshCw, ShieldCheck } from 'lucide-react';
import type { DirectoryAgent } from '../lib/agent-directory';
import { quoteAmount } from '../lib/agent-directory';
import type { RegistrationRecord } from '../lib/agent-registration';
import { downloadJson } from '../lib/registration';
import { AutonomyControls } from './AutonomyControls';
import { LiveVaultEvidence } from './LiveVaultEvidence';
import { NativeInvestment } from './NativeInvestment';
import { VaultTrading } from './VaultTrading';
import { VaultSetup } from './VaultSetup';
import { Badge, CopyValue, Eyebrow, Note } from './UI';
import './AgentProfile.css';
import { AgentResearch, ResearchSummary } from './AgentResearch';
import { useWallet } from '../lib/wallet-context';

const when = (value: string) => new Date(value).toLocaleString();
const sections = ['Overview', 'Activity', 'Research', 'Evidence', 'Manage'] as const;
function Evidence({ title, description, children, open = false }: { title: string; description: string; children: ReactNode; open?: boolean }) {
  return <details className="profile-evidence" open={open || undefined}><summary><span><strong>{title}</strong><span>{description}</span></span><ChevronRight size={18} aria-hidden="true" /></summary><div className="profile-evidence-body">{children}</div></details>;
}
type Props = {
  revision: number; agent: DirectoryAgent; record: RegistrationRecord; refreshing: boolean; error: string; configured: boolean; checking: boolean; checkError: string;
  onRefresh: () => void; onVersion: (id: string) => void; onRecheck: () => void;
};
export function AgentProfile({ revision, agent, record: r, refreshing, error, configured, checking, checkError, onRefresh, onVersion, onRecheck }: Props) {
  const chain=executionNetwork(r.authorization.challenge.chainId);
  const wallet = useWallet();
  const [section, setSection] = useState(0), [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const tabs = useRef<(HTMLButtonElement | null)[]>([]), investment = useRef<HTMLElement | null>(null);
  const m = r.manifest, b = r.binding, historical = r.id !== agent.latest.id;
  const controller = wallet.binding?.address.toLowerCase() === m.controller.toLowerCase() && wallet.binding?.chainId === chain.id;
  const activeSection = section === 4 && (!controller || historical) ? 0 : section;
  const visibleSections = controller && !historical ? sections : sections.slice(0,4);
  const observed = useAgentState(r, revision, !!b), o = observed.data?.observation;
  function select(index: number) { setSection(index); setVisited(previous => new Set([...previous, index])); }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % visibleSections.length : event.key === 'ArrowLeft' ? (index + visibleSections.length - 1) % visibleSections.length : event.key === 'Home' ? 0 : event.key === 'End' ? visibleSections.length - 1 : undefined;
    if (next !== undefined) { event.preventDefault(); select(next); tabs.current[next]?.focus(); }
  }
  function goToInvestment() { select(0); requestAnimationFrame(() => { investment.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); investment.current?.focus({ preventScroll: true }); }); }
  return <div className="container page agent-profile">
    <Link to="/agents" className="breadcrumb">Explore agents <ChevronRight size={14} />{m.name}</Link>
    <header className="agent-profile-hero">
      <div className="agent-profile-identity"><div className="agent-avatar large" aria-hidden="true"><Fingerprint size={32} /></div><div><div className="profile-tags"><Badge tone="neutral">{b ? executionNetwork(b.chainId).name : 'Signed local registration'}</Badge>{historical && <Badge tone="amber">Earlier configuration</Badge>}</div><h1>{m.name}</h1><p>{m.strategy.pair} <span aria-hidden="true">·</span> {m.model.id}</p></div></div>
      <div className="agent-profile-hero-actions">{!historical && <button className="button" onClick={goToInvestment}>Invest or redeem <ArrowUpRight size={16} /></button>}</div>
    </header>
    {agent.versions.length>1&&<div className="profile-version-row"><div><label htmlFor="agent-version">Configuration</label><select id="agent-version" disabled={checking} value={r.id} onChange={e=>onVersion(e.target.value)}>{agent.versions.map((v,index)=><option key={v.id} value={v.id}>{index===0?'Latest signed version':`Earlier version ${agent.versions.length-index}`} · {when(v.registeredAt)}</option>)}</select></div></div>}
    {error && <div role="alert"><Note>{error} <button className="text-button" disabled={refreshing} onClick={onRefresh}>Retry</button></Note></div>}
    {historical && <Note>Earlier configuration. Actions require the latest version. <button className="text-button" onClick={() => onVersion(agent.latest.id)}>View latest version</button></Note>}
    <div className="profile-status-row" aria-label="Evidence summary"><button className="text-button" onClick={()=>select(3)}><ShieldCheck size={16}/>Signed identity</button><button className="text-button" onClick={()=>select(3)}><Cpu size={16}/>Local model · synthetic check</button><button className="profile-refresh" aria-label="Refresh agent" disabled={refreshing||checking} onClick={onRefresh}><RefreshCw size={15} className={refreshing?'profile-spinning':''}/>{refreshing?'Refreshing…':'Refresh'}</button></div>
    <nav className="profile-tabs" role="tablist" aria-label="Agent profile sections">{visibleSections.map((name, index) => <button key={name} ref={node => { tabs.current[index] = node; }} id={`profile-tab-${index}`} type="button" role="tab" aria-selected={activeSection === index} aria-controls={`profile-panel-${index}`} tabIndex={activeSection === index ? 0 : -1} onClick={() => select(index)} onKeyDown={e => navigate(e, index)}>{name}</button>)}</nav>
    <div className={`agent-profile-layout${activeSection !== 0 || historical ? ' profile-wide' : ''}`}>
      <div className="agent-profile-content">
        <div id="profile-panel-0" role="tabpanel" aria-labelledby="profile-tab-0" hidden={activeSection !== 0} tabIndex={0}>
          <section className="panel profile-strategy"><h2>Declared limits</h2>
            <div className="profile-mandate"><div><small>Per trade</small><strong>{quoteAmount(m.proposedMandate.perTradeQuoteUnits)} <span>quote units</span></strong></div><div><small>Max position</small><strong>{quoteAmount(m.proposedMandate.maxPositionQuoteUnits)} <span>quote units</span></strong></div><div><small>Slippage</small><strong>{m.proposedMandate.slippageBps / 100}%</strong></div><div><small>Leverage</small><strong>{m.proposedMandate.leverage ? 'Declared' : 'None'}</strong></div></div>
            <details className="profile-strategy-details"><summary>Signed strategy & limits <ChevronRight size={16} /></summary><p className="agent-strategy">{m.strategy.description}</p><p className="small">Declared limits. Current enforced limits are in the vault evidence.</p></details>
          </section>
          {b ? <AgentStateEvidence {...observed} onRefresh={observed.refresh}/> : <section className="panel"><h2>No vault linked yet</h2><p>Investment is unavailable until a vault is linked.</p>{controller&&!historical&&<button className="text-button" onClick={()=>select(4)}>Continue vault setup <ChevronRight size={16}/></button>}</section>}
          <ResearchSummary record={r} onInspect={() => select(2)} />

        </div>
        <div id="profile-panel-1" role="tabpanel" aria-labelledby="profile-tab-1" hidden={activeSection !== 1} tabIndex={0}>{visited.has(1) && (b && [10143,11155111].includes(b.chainId) ? <LiveVaultEvidence key={r.id} record={r} observed={observed} /> : <section className="panel"><h2>No vault activity yet</h2><p>No public vault is linked to this configuration.</p></section>)}</div>
        <div id="profile-panel-2" role="tabpanel" aria-labelledby="profile-tab-2" hidden={activeSection !== 2} tabIndex={0}>{visited.has(2) && <AgentResearch record={r} section="history"/>}</div>
        <div id="profile-panel-3" role="tabpanel" aria-labelledby="profile-tab-3" hidden={activeSection !== 3} tabIndex={0}>
          <button className="button secondary profile-export" onClick={() => downloadJson('pumpcoin-agent-registration-receipt.json', r)}><Download size={16}/>Export signed registration</button>
          <section className="panel profile-evidence-intro"><h2>Identity & evidence</h2><details><summary>What these checks establish</summary><p>Signatures bind the declaration. Local checks record observations; vault bindings apply at a recorded block. These do not prove profitable trading.</p></details></section>
          <Evidence title="Identity & signatures" description="Controller, execution key and commitments"><p className="small">Registered {when(r.registeredAt)}. Both signatures bind this declaration; current authority may differ.</p><h3>Controller wallet</h3><CopyValue value={m.controller} label="controller" /><h3>Agent execution key</h3><CopyValue value={m.executionKey} label="execution key" /><h3>Local agent identifier</h3><CopyValue value={agent.id} label="local agent identifier" /><p className="small">Groups the same chain, controller and name on this server. This is separate from an ERC-8004 registration token.</p><h3>Signed manifest commitment</h3><CopyValue value={r.commitment} label="signed manifest commitment" /><h3>Strategy code commitment</h3><CopyValue value={m.strategy.codeDigest} label="strategy code digest" /><p className="small">A code commitment does not establish that this code was executed.</p></Evidence>
          <Evidence title="Local model & provenance" description={`${m.model.id} · checked ${when(r.worker.checkedAt)}`}><Badge tone="neutral">Local inference receipt</Badge><p>{r.worker.version === 'PUMPCOIN-LOCAL-WORKER-CHECK-v2' ? `The admission check includes stale/unvalued input, fresh cash, fresh positions and ${r.worker.guardChallenges?.length ?? 0} injected guard challenges. All inputs are synthetic; no tokens moved. Stale-case raw proposal:` : 'The historical admission check used synthetic stale inputs, unavailable valuation and no funds. Raw proposal:'} {r.worker.rawProposal.action} / {quoteAmount(r.worker.rawProposal.quoteUnits)} quote units. Guarded proposal: {r.worker.guardedProposal.action} / {quoteAmount(r.worker.guardedProposal.quoteUnits)} quote units.</p><p>This receipt records the local admission check. Inspect live vault activity for trading results. Model execution is not hardware-attested.</p><h3>Declared model source</h3><a className="text-link" href={m.model.source} target="_blank" rel="noreferrer">{m.model.source}</a><p className="small">The source URL is part of the signed declaration; it does not establish independently verified training provenance.</p><h3>Model weights</h3><CopyValue value={m.model.weightsDigest} label="weights digest" /><h3>Runtime artifact</h3><CopyValue value={m.model.runtimeDigest} label="runtime digest" /><h3>Declared external dependencies</h3><ul className="agent-dependencies">{m.dependencies.map((d, i) => <li key={i}>{d}</li>)}</ul><h3>Worker receipt commitment</h3><CopyValue value={r.worker.receiptHash} label="worker receipt hash" /></Evidence>
          <Evidence title="Vault & on-chain identity" description={b ? `Agent #${b.agentId} · binding checked at block ${b.blockNumber}` : 'Public vault binding not yet recorded'}>{b ? <><Badge tone="neutral">Point-in-time binding · {b.mode}</Badge><p>Checked {when(b.checkedAt)} on chain {b.chainId}. Ownership, permissions and configuration may have changed since this block.</p>{b.identityPublication === 'commitment-only-v1' && <p>The on-chain identity URI records this signed manifest’s commitment. The full manifest and authorizations are retained and exportable from this Pump instance; the registry does not store the complete evidence.</p>}<h3>Current identity observation</h3>{o ? <><p>At block {o.blockNumber}: {identityMatches(o) ? 'Current identity, strategy, risk and mandate bindings match the signed record.' : 'Current identity, strategy, risk or mandate bindings differ from the signed record.'}</p><details className="native-technical"><summary>Published manifest URI at this block</summary><CopyValue value={o.identity.publishedManifestURI} label="current published manifest URI"/></details><h3>Current identity owner</h3><CopyValue value={o.identity.owner} label="current identity owner"/><h3>Current vault controller</h3><CopyValue value={o.controller} label="current controller"/><h3>Current manager</h3><CopyValue value={o.manager} label="current manager"/></> : <p>{observed.error || observed.data?.chainError || 'Current identity check in progress.'}</p>}<h3>Recorded vault</h3><CopyValue value={b.vault} label="vault" />{[10143,11155111].includes(b.chainId) && <a className="text-link" href={`${chain.explorer}/address/${b.vault}`} target="_blank" rel="noreferrer">Open vault on chain explorer <ArrowUpRight size={14} /></a>}<h3>ERC-8004 registry · agent #{b.agentId}</h3><CopyValue value={b.identityRegistry} label="identity registry" /><h3>Recorded configuration · block {b.blockNumber}</h3><CopyValue value={b.configHash} label="vault configuration hash" /><h3>Recorded binding block hash</h3><CopyValue value={b.blockHash} label="binding block hash" />{configured && !historical ? <button className="button secondary" disabled={checking} onClick={onRecheck}><ShieldCheck size={16} />{checking ? 'Checking binding…' : 'Recheck deployed binding'}</button> : <p className="small">{historical ? 'Switch to the latest version for a current deployment check.' : 'A fresh binding check requires the server’s reviewed deployment configuration. The trading history section reads current vault state separately.'}</p>}{checkError && <p className="form-error" role="alert">{checkError}</p>}</> : <p>No deployed vault is linked to this configuration yet.</p>}</Evidence>
        </div>
        <div id="profile-panel-4" role="tabpanel" aria-labelledby="profile-tab-4" hidden={activeSection !== 4} tabIndex={0}>
          {controller && !historical && visited.has(4) && <>
          <header className="profile-operator-intro"><div><Eyebrow>CONTROLLER WORKSPACE</Eyebrow><h2>Manage your agent</h2></div></header>
          <details className="profile-evidence"><summary>Research policy & local runtime</summary><div className="profile-evidence-body"><AgentResearch record={r} section="setup"/></div></details>
          {!b ? <section className="panel"><VaultSetup record={r} onComplete={onRefresh}/></section> : <><VaultTrading record={r}/><details className="profile-evidence"><summary>Funded trading permission & worker</summary><div className="profile-evidence-body"><AutonomyControls key={r.id} record={r} showEvidence={false}/></div></details></>}
          </>}
        </div>
      </div>
      {!historical && activeSection === 0 && <aside className="agent-profile-investment" ref={investment} tabIndex={-1} aria-label="Your investment"><NativeInvestment key={r.id} record={r}/></aside>}
    </div>
  </div>;
}
