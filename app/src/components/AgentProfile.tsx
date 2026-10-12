import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Cpu, Download, Fingerprint, History, RefreshCw, ShieldCheck } from 'lucide-react';
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

const when = (value: string) => new Date(value).toLocaleString();
const sections = ['Overview', 'Trading history', 'Identity & evidence', 'Operator setup'] as const;
function Evidence({ title, description, children, open = false }: { title: string; description: string; children: ReactNode; open?: boolean }) {
  return <details className="profile-evidence" open={open || undefined}><summary><span><strong>{title}</strong><span>{description}</span></span><ChevronRight size={18} aria-hidden="true" /></summary><div className="profile-evidence-body">{children}</div></details>;
}
type Props = {
  agent: DirectoryAgent; record: RegistrationRecord; refreshing: boolean; error: string; configured: boolean; checking: boolean; checkError: string;
  onRefresh: () => void; onVersion: (id: string) => void; onRecheck: () => void;
};
export function AgentProfile({ agent, record: r, refreshing, error, configured, checking, checkError, onRefresh, onVersion, onRecheck }: Props) {
  const [section, setSection] = useState(0), [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const tabs = useRef<(HTMLButtonElement | null)[]>([]), investment = useRef<HTMLElement | null>(null);
  const m = r.manifest, b = r.binding, historical = r.id !== agent.latest.id;
  function select(index: number) { setSection(index); setVisited(previous => new Set([...previous, index])); }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : undefined;
    if (next !== undefined) { event.preventDefault(); select(next); tabs.current[next]?.focus(); }
  }
  function goToInvestment() { select(0); requestAnimationFrame(() => { investment.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); investment.current?.focus({ preventScroll: true }); }); }
  return <div className="container page agent-profile">
    <Link to="/agents" className="breadcrumb">Explore agents <ChevronRight size={14} />{m.name}</Link>
    <header className="agent-profile-hero">
      <div className="agent-profile-identity"><div className="agent-avatar large" aria-hidden="true"><Fingerprint size={32} /></div><div><div className="profile-tags"><Badge tone="neutral">{b?.chainId === 10143 ? 'Monad testnet' : 'Signed local registration'}</Badge>{historical && <Badge tone="amber">Earlier configuration</Badge>}</div><h1>{m.name}</h1><p>{m.strategy.pair} <span aria-hidden="true">·</span> {m.model.id} <span aria-hidden="true">·</span> Self-hosted inference</p></div></div>
      <div className="agent-profile-hero-actions"><button className="button secondary" onClick={() => downloadJson('pumpcoin-agent-registration-receipt.json', r)}><Download size={16} />Export evidence</button>{!historical && <button className="button" onClick={goToInvestment}>Invest or redeem <ArrowUpRight size={16} /></button>}</div>
    </header>
    <div className="profile-version-row"><span>Registered {when(r.registeredAt)}</span><div><label htmlFor="agent-version">Configuration</label><select id="agent-version" disabled={checking} value={r.id} onChange={e => onVersion(e.target.value)}>{agent.versions.map((v, index) => <option key={v.id} value={v.id}>{index === 0 ? 'Latest signed version' : `Earlier version ${agent.versions.length - index}`} · {when(v.registeredAt)}</option>)}</select><button className="profile-refresh" disabled={refreshing || checking} onClick={onRefresh}><RefreshCw size={15} className={refreshing ? 'profile-spinning' : ''} />{refreshing ? 'Refreshing…' : 'Refresh'}</button></div></div>
    {error && <div role="alert"><Note>{error} <button className="text-button" disabled={refreshing} onClick={onRefresh}>Retry</button></Note></div>}
    {historical && <Note>You are viewing an earlier signed configuration. Investing and operator actions are available on the latest version. <button className="text-button" onClick={() => onVersion(agent.latest.id)}>View latest version</button></Note>}
    <div className="profile-confidence" aria-label="Evidence at a glance">
      <div><ShieldCheck size={20} /><span><strong>Signed identity</strong><small>Controller and execution key verified</small></span></div>
      <div><Cpu size={20} /><span><strong>Local inference observed</strong><small>Recorded check · independent attestation absent</small></span></div>
      <div><History size={20} /><span><strong>Performance not verified</strong><small>Verified trading results not available</small></span></div>
    </div>
    <nav className="profile-tabs" role="tablist" aria-label="Agent profile sections">{sections.map((name, index) => <button key={name} ref={node => { tabs.current[index] = node; }} id={`profile-tab-${index}`} type="button" role="tab" aria-selected={section === index} aria-controls={`profile-panel-${index}`} tabIndex={section === index ? 0 : -1} onClick={() => select(index)} onKeyDown={e => navigate(e, index)}>{name}</button>)}</nav>
    <div className={`agent-profile-layout${section === 3 || historical ? ' profile-wide' : ''}`}>
      <div className="agent-profile-content">
        <div id="profile-panel-0" role="tabpanel" aria-labelledby="profile-tab-0" hidden={section !== 0} tabIndex={0}>
          <section className="panel profile-strategy"><Eyebrow>THE STRATEGY</Eyebrow><h2>How this agent plans to trade</h2><p>The operator proposes spot trading in <strong>{m.strategy.pair}</strong> using <strong>{m.model.id}</strong>. The limits below are signed declarations; inspect the live vault for enforced permissions.</p>
            <div className="profile-mandate"><div><small>Per-trade limit</small><strong>{quoteAmount(m.proposedMandate.perTradeQuoteUnits)} <span>quote units</span></strong></div><div><small>Position limit</small><strong>{quoteAmount(m.proposedMandate.maxPositionQuoteUnits)} <span>quote units</span></strong></div><div><small>Slippage ceiling</small><strong>{m.proposedMandate.slippageBps / 100}%</strong></div><div><small>Leverage</small><strong>None declared</strong></div></div>
            <details className="profile-strategy-details"><summary>Read the full signed strategy <ChevronRight size={16} /></summary><p className="agent-strategy">{m.strategy.description}</p></details>
          </section>
          <section className="panel profile-performance"><div className="profile-section-title"><span className="profile-section-icon"><History size={20} /></span><div><Eyebrow>TRADING PERFORMANCE</Eyebrow><h2>No verified performance yet</h2></div></div><p>A complete trading record has not been verified for this agent. Returns and a performance-based trust rating are unavailable.</p><div className="profile-performance-values"><div><small>Net return</small><strong>Not available</strong></div><div><small>Performance rating</small><strong>Not rated</strong></div></div><p className="profile-caption">Identity evidence and investment performance are separate. Deposits increase capital; they do not count as profit.</p><button className="button secondary" onClick={() => { select(1); tabs.current[1]?.focus(); }}>Inspect vault activity <ArrowUpRight size={16} /></button></section>
          <section className="profile-investment-explainer" aria-label="How vault shares work"><h2>What your Pump tokens represent</h2><div><span><ArrowUpRight size={18} /><strong>Invest MON</strong><p>Receive Pump tokens representing your shares in this vault.</p></span><span><ArrowDownLeft size={18} /><strong>Redeem your shares</strong><p>Receive their current value in MON, subject to vault liquidity and conversion fees.</p></span></div><p>Gains can increase share value. Losses and expenses can reduce it. Your initial MON amount is not guaranteed.</p></section>
        </div>
        <div id="profile-panel-1" role="tabpanel" aria-labelledby="profile-tab-1" hidden={section !== 1} tabIndex={0}>{visited.has(1) && (b?.chainId === 10143 ? <LiveVaultEvidence key={r.id} record={r} /> : <section className="panel"><h2>No Monad testnet vault linked</h2><p>There is no public Monad vault activity to inspect for this configuration. The controller must complete vault setup first.</p></section>)}</div>
        <div id="profile-panel-2" role="tabpanel" aria-labelledby="profile-tab-2" hidden={section !== 2} tabIndex={0}>
          <section className="panel profile-evidence-intro"><Eyebrow>PROVENANCE & TRUST</Eyebrow><h2>Inspect what the evidence supports</h2><p>Signatures bind the operator’s declaration. The local model check records an observation. A vault binding records a check at a particular block. None of these alone proves profitable trading.</p></section>
          <Evidence title="Identity & signatures" description="Who controls the agent, and which configuration they signed" open><p>Both wallet signatures were checked against this exact manifest, role, origin, chain and registration nonce.</p><h3>Controller wallet</h3><CopyValue value={m.controller} label="controller" /><h3>Agent execution key</h3><CopyValue value={m.executionKey} label="execution key" /><h3>Local agent identifier</h3><CopyValue value={agent.id} label="local agent identifier" /><p className="small">Groups the same chain, controller and name on this server. This is separate from an ERC-8004 registration token.</p><h3>Signed manifest commitment</h3><CopyValue value={r.commitment} label="signed manifest commitment" /><h3>Strategy code commitment</h3><CopyValue value={m.strategy.codeDigest} label="strategy code digest" /><p className="small">A code commitment does not establish that this code was executed.</p></Evidence>
          <Evidence title="Local model & provenance" description={`${m.model.id} · checked ${when(r.worker.checkedAt)}`}><Badge tone="neutral">Locally observed · not independently attested</Badge><p>The local inference check used synthetic stale inputs, unavailable valuation and no funds. Raw proposal: {r.worker.rawProposal.action} / {quoteAmount(r.worker.rawProposal.quoteUnits)} quote units. Guarded proposal: {r.worker.guardedProposal.action} / {quoteAmount(r.worker.guardedProposal.quoteUnits)} quote units.</p><p>This does not establish current uptime, strategy execution or trading performance.</p><h3>Model weights</h3><CopyValue value={m.model.weightsDigest} label="weights digest" /><h3>Runtime artifact</h3><CopyValue value={m.model.runtimeDigest} label="runtime digest" /><h3>Declared external dependencies</h3><ul className="agent-dependencies">{m.dependencies.map((d, i) => <li key={i}>{d}</li>)}</ul><h3>Worker receipt commitment</h3><CopyValue value={r.worker.receiptHash} label="worker receipt hash" /></Evidence>
          <Evidence title="Vault & on-chain identity" description={b ? `Agent #${b.agentId} · binding checked at block ${b.blockNumber}` : 'Public vault binding not yet recorded'}>{b ? <><Badge tone="neutral">Point-in-time binding · {b.mode}</Badge><p>Checked {when(b.checkedAt)} on chain {b.chainId}. Ownership, permissions and configuration may have changed since this block.</p><h3>Vault</h3><CopyValue value={b.vault} label="vault" />{b.chainId === 10143 && <a className="text-link" href={`https://testnet.monadexplorer.com/address/${b.vault}`} target="_blank" rel="noreferrer">Open vault on Monad explorer <ArrowUpRight size={14} /></a>}<h3>ERC-8004 registry · agent #{b.agentId}</h3><CopyValue value={b.identityRegistry} label="identity registry" /><h3>Configuration at this block</h3><CopyValue value={b.configHash} label="vault configuration hash" /><h3>Anchor block</h3><CopyValue value={b.blockHash} label="binding block hash" />{configured && !historical ? <button className="button secondary" disabled={checking} onClick={onRecheck}><ShieldCheck size={16} />{checking ? 'Checking binding…' : 'Recheck deployed binding'}</button> : <p className="small">{historical ? 'Switch to the latest version for a current deployment check.' : 'A fresh binding check requires the server’s reviewed deployment configuration. The trading history section reads current vault state separately.'}</p>}{checkError && <p className="form-error" role="alert">{checkError}</p>}</> : <p>No deployed vault is linked to this configuration yet.</p>}</Evidence>
        </div>
        <div id="profile-panel-3" role="tabpanel" aria-labelledby="profile-tab-3" hidden={section !== 3} tabIndex={0}>
          <section className="panel profile-operator-intro"><Eyebrow>FOR THE AGENT CONTROLLER</Eyebrow><h2>Configure the vault and trading permission</h2><p>Connect the controller wallet to review configuration changes. The agent can sign permitted trades only after the deployed vault’s checks and your on-chain authorization allow it.</p><div className="profile-setup-steps"><span><b>1</b>Deploy vault</span><ChevronRight size={16} /><span><b>2</b>Configure trading venue</span><ChevronRight size={16} /><span><b>3</b>Grant permission</span></div></section>
          {historical ? <Note>Operator actions are available on the latest signed version.</Note> : visited.has(3) && <>{!b && <section className="panel"><h2>Deploy this agent’s vault</h2><VaultSetup record={r} onComplete={onRefresh} /></section>}{b && <><VaultTrading record={r} /><AutonomyControls key={r.id} record={r} showEvidence={false} /></>}</>}
        </div>
      </div>
      {!historical && <aside className="agent-profile-investment" ref={investment} tabIndex={-1} aria-label="Your investment" hidden={section === 3}><NativeInvestment key={r.id} record={r} /></aside>}
    </div>
  </div>;
}
