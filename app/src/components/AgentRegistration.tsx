import { VaultSetup } from './VaultSetup';
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Check, Download, Fingerprint, Cpu, ShieldCheck } from 'lucide-react';
import { recoverMessageAddress, type Hex } from 'viem';
import { useWallet } from '../lib/wallet-context';
import { WalletButton } from './WalletProvider';
import { Badge, CopyValue, Note } from './UI';
import { downloadJson } from '../lib/registration';
import { authorizationMessage, checkWorker, registrationSession, registrationRequest, type Challenge, type Prepared, type RegistrationRecord } from '../lib/agent-registration';

export function AgentRegistration({ prepared, onRegistered }: { prepared: Prepared; onRegistered?: (r: RegistrationRecord) => void }) {
  const wallet = useWallet();
  const [helper, setHelper] = useState<{ token: string; configured: boolean }>(), [challenge, setChallenge] = useState<Challenge>(), [worker, setWorker] = useState<RegistrationRecord['worker']>(), [signatures, setSignatures] = useState<Partial<Record<'controller' | 'execution', Hex>>>({}), [record, setRecord] = useState<RegistrationRecord>(), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState(''), [now, setNow] = useState(() => Date.now()), [pasted, setPasted] = useState('');
  const abort = useRef(new AbortController()), lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); abort.current = controller;
    registrationSession(controller.signal).then(async s => { setHelper(s); const data = await registrationRequest(s.token, '/records', undefined, controller.signal); const found = data.records.find((r: RegistrationRecord) => r.commitment === prepared.commitment); if (found && !controller.signal.aborted) setRecord(found); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  useEffect(() => { if (record) onRegistered?.(record); }, [record, onRegistered]);
  const expired = !!challenge && now >= challenge.expiresAt;
  async function action(run: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await run(); } catch (e) { if (!abort.current.signal.aborted) setError(e instanceof Error ? e.message : 'Registration failed.'); } finally { lock.current = false; if (!abort.current.signal.aborted) setBusy(false); }
  }
  async function runWorker() {
    if (!helper) throw new Error('Local registration helper is unavailable.');
    let c = challenge;
    if (!c || expired) { c = (await registrationRequest(helper.token, '/challenge', { prepared }, abort.current.signal)).challenge; setChallenge(c); setSignatures({}); setWorker(undefined); }
    setWorker(await checkWorker(helper.token, c!.id, setStatus, abort.current.signal)); setStatus('Local inference answered; the paper guard returned HOLD. This is not a strategy backtest.');
  }
  async function sign(role: 'controller' | 'execution') {
    if (!challenge || expired || !worker) throw new Error('Run a fresh local worker check first.');
    const address = role === 'controller' ? prepared.manifest.controller : prepared.manifest.executionKey;
    if (!wallet.binding || wallet.binding.address.toLowerCase() !== address.toLowerCase()) throw new Error(`Connect the ${role === 'controller' ? 'controller' : 'execution'} wallet ${address}, then sign. You can switch wallets between the two signatures.`);
    if (wallet.binding.chainId !== challenge.chainId) throw new Error(`Select chain ${challenge.chainId} before signing.`);
    const signature = await wallet.sign(authorizationMessage(challenge, role)); abort.current.signal.throwIfAborted();
    if (Date.now() >= challenge.expiresAt) throw new Error('The registration session expired during signing. Start again.');
    setSignatures(old => ({ ...old, [role]: signature }));
  }
  const request = (route: string, body: unknown) => { if (!helper) throw new Error('Local helper is unavailable.'); return registrationRequest(helper.token, route, body, abort.current.signal); };
  return <section className="panel" aria-label="Agent registration checks" style={{ marginTop: 24 }}>
    <h3>Register your local agent</h3><p className="small muted">Check the running model, then authorize this declaration with both wallets. Registration stores a versioned record on this computer.</p>
    {!record ? <>
      <button className="button secondary full" type="button" disabled={busy || !helper} onClick={() => void action(runWorker)}><Cpu size={16} />{worker && !expired ? 'Check local worker again' : 'Check local worker'}</button>
      {worker && !expired && <p className="small success" role="status">Local inference checked · paper-only · not attested</p>}
      {challenge && <details><summary className="small muted">Inspect what both wallets authorize</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 10 }}>{authorizationMessage(challenge, 'controller')}</pre><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 10 }}>{authorizationMessage(challenge, 'execution')}</pre></details>}
      <div style={{ margin: '16px 0' }}><WalletButton /></div>
      <div className="review-actions"><button className="button secondary" type="button" disabled={busy || wallet.busy || !worker || expired || !!signatures.controller} onClick={() => void action(() => sign('controller'))}><Fingerprint size={16} />{signatures.controller ? 'Controller signed' : 'Sign as controller'}</button><button className="button secondary" type="button" disabled={busy || wallet.busy || !worker || expired || !!signatures.execution} onClick={() => void action(() => sign('execution'))}><ShieldCheck size={16} />{signatures.execution ? 'Execution key signed' : 'Sign as execution key'}</button></div>
      <details><summary className="small muted">Execution signer outside this browser?</summary><p className="small muted">Sign the exact execution authorization shown above in your signing tool. Paste the signature, never a private key. The helper verifies it before registration.</p><label className="small" htmlFor="execution-signature">Execution authorization signature</label><input id="execution-signature" className="mono-input" value={pasted} onChange={e => setPasted(e.target.value)} style={{ width: '100%' }} /><button className="text-button" type="button" disabled={busy || !worker || expired} onClick={() => void action(async () => { if (!challenge || expired || !/^0x[0-9a-f]{130}$/i.test(pasted)) throw new Error('Enter a 65-byte EOA signature for this current session.'); const address = await recoverMessageAddress({ message: authorizationMessage(challenge, 'execution'), signature: pasted as Hex }); if (address.toLowerCase() !== prepared.manifest.executionKey.toLowerCase()) throw new Error('Signature does not match the execution key and this declaration.'); setSignatures(x => ({ ...x, execution: pasted as Hex })); })}>Use execution signature</button></details>
      <button className="button full" type="button" disabled={busy || !worker || !signatures.controller || !signatures.execution || expired} onClick={() => void action(async () => { const value = await request('/commit', { id: challenge!.id, controllerSignature: signatures.controller, executionSignature: signatures.execution }); setRecord(value.record); setStatus('Local authorizations saved. Continue below to create and verify the public identity and vault.'); })}>Save authorizations & continue<Check size={16} /></button>
      {expired && <p className="form-error">The session expired. Check the worker again and obtain fresh signatures.</p>}
    </> : <>
      <Badge tone="purple">Registered locally</Badge><p className="small">Both authorizations and the local inference check passed. This is not a public identity or an investment-eligible vault.</p><CopyValue value={record.localAgentId} label="local agent identity" /><button className="button secondary" type="button" onClick={() => downloadJson('pumpcoin-local-registration.json', record)}>Export registration receipt<Download size={16} /></button>
      <VaultSetup record={record} onComplete={setRecord} />
    </>}
    {busy && <p className="small" role="status">{status || 'Checking registration…'}</p>}{!busy && status && <p className="small" role="status">{status}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
export function LocalRegistrations() {
  const [records, setRecords] = useState<RegistrationRecord[]>([]), [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); registrationSession(controller.signal).then(s => registrationRequest(s.token, '/records', undefined, controller.signal)).then(x => setRecords(x.records)).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  return <section aria-label="Registered local agents"><h2 style={{ marginTop: 28 }}>Your locally registered agents</h2>{error && <Note>{error}</Note>}{!error && !records.length && <p className="small muted">No signed local registrations yet. Saving a draft does not register an agent.</p>}{records.slice(0, 20).map(r => <div className="panel" key={r.id} style={{ marginTop: 12 }}><h3>{r.manifest.name}</h3><Link className="text-link" to={`/agents/${r.localAgentId}`}>View agent profile</Link><Badge tone="purple">Registered locally · {r.binding ? 'binding checked at a recorded block' : 'vault pending'}</Badge><p className="small muted">{r.manifest.model.id} · {r.manifest.strategy.pair} · not investment eligible</p><CopyValue value={r.commitment} label="registered manifest" /><button className="text-button" onClick={() => downloadJson('pumpcoin-local-registration.json', r)}>Export registration receipt</button></div>)}</section>;
}
