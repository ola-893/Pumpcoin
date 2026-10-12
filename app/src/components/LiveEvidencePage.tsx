import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadDirectory, type DirectoryAgent } from '../lib/agent-directory';
import { LiveVaultEvidence } from './LiveVaultEvidence';
import { ActionLink, Empty, Note, PageTitle } from './UI';

export function LiveEvidencePage() {
  const [agents, setAgents] = useState<DirectoryAgent[]>(), [selected, setSelected] = useState(''), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    loadDirectory(c.signal).then(({ agents: records }) => { if (!c.signal.aborted) { setAgents(records.filter(a => a.latest.binding?.chainId === 10143)); setError(''); } })
      .catch(() => { if (!c.signal.aborted) { setAgents(undefined); setError('Could not verify the Monad vault directory. Keep the frontend backend running and retry.'); } });
    return () => c.abort();
  }, [revision]);
  const agent = agents?.find(a => a.id === selected) ?? agents?.[0];
  return <div className="container page"><PageTitle eyebrow="LIVE EVIDENCE · MONAD TESTNET" title={<>Follow the vault.<br /><em>Inspect its receipts.</em></>} body="Observe deployed vault balances, permission state and recent confirmed transactions on chain 10143." />
    {error ? <Note>{error}</Note> : !agents ? <p role="status">Verifying registered Monad vaults…</p> : !agents.length ? <Empty title="No Monad vault is connected yet."><p>Register an agent and verify its testnet vault deployment in the frontend before inspecting live evidence.</p><ActionLink to="/agents">Explore agents</ActionLink></Empty> : agent && <>
      <label htmlFor="live-evidence-agent">Registered Monad vault</label><select id="live-evidence-agent" style={{ width: '100%', margin: '8px 0 16px' }} value={agent.id} onChange={e => setSelected(e.target.value)}>{agents.map(a => <option key={a.id} value={a.id}>{a.latest.manifest.name} · {a.latest.binding!.vault}</option>)}</select>
      <Link className="text-link" to={`/agents/${agent.id}`}>Open agent controls</Link><LiveVaultEvidence key={agent.latest.id} record={agent.latest} />
    </>}
    <button className="button secondary" onClick={() => setRevision(v => v + 1)}>Refresh vault directory</button>
    <p className="small muted" style={{ marginTop: 24 }}><Link to="/evidence/archive">Archived local regression evidence</Link> is a separate development record.</p>
  </div>;
}
