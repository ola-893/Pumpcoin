import { useEffect, useRef, useState } from 'react';
import { formatEther, type Hex } from 'viem';
import { Check, Download, ShieldCheck } from 'lucide-react';
import { registrationRequest, registrationSession, type RegistrationRecord } from '../lib/agent-registration';
import type { VaultPlan } from '../lib/agent-registration';
import { useWallet } from '../lib/wallet-context';
import { WalletButton } from './WalletProvider';
import { Badge, CopyValue, Note } from './UI';
import { downloadJson } from '../lib/registration';

/** Submission and verification are separate: retries never send a second transaction. */
export function VaultSetup({ record, onComplete }: { record: RegistrationRecord; onComplete: (r: RegistrationRecord) => void }) {
  const wallet = useWallet(), key = `pumpcoin.vault-transaction.v1.${record.id}`;
  const [session, setSession] = useState<Awaited<ReturnType<typeof registrationSession>>>(), [plan, setPlan] = useState<VaultPlan>(), [hash, setHash] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const active = useRef<AbortController | undefined>(undefined), lock = useRef(false);
  useEffect(() => { const c = new AbortController(); active.current = c;
    registrationSession(c.signal).then(s => { if (!c.signal.aborted) setSession(s); }).catch(e => { if (!c.signal.aborted) setError(e.message); });
    try { setHash(localStorage.getItem(key) ?? ''); } catch { /* Manual hash recovery remains available. */ }
    return () => c.abort();
  }, [key]);
  async function action(run: () => Promise<unknown>) { if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await run(); } catch (e) { if (!active.current?.signal.aborted) setError(e instanceof Error ? e.message : 'Vault setup failed.'); }
    finally { lock.current = false; if (!active.current?.signal.aborted) setBusy(false); }
  }
  async function request(route: string, body: unknown) { if (!session) throw new Error('Registration helper unavailable.'); return registrationRequest(session.token, route, body, active.current?.signal); }
  async function prepare() { setStatus('Checking network contracts and simulating vault creation…'); const result = await request('/vault-plan', { id: record.id }); setPlan(result.plan); setStatus('Deployment simulated. Review the transaction before approving it in your controller wallet.'); return result.plan as VaultPlan; }
  async function verify(transactionHash: string) {
    if (!/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw new Error('Enter the deployment transaction hash.');
    setStatus('Checking the mined deployment, runtime, identity owner and vault permissions…');
    const result = await request('/confirm-vault', { id: record.id, transactionHash });
    try { localStorage.removeItem(key); } catch { /* Confirmed receipt is saved by the server. */ }
    onComplete(result.record);
  }
  async function submit() {
    if (hash) throw new Error('A transaction is already saved. Verify that transaction before considering another deployment.');
    const latest = await prepare();
    if (!latest.canSubmit) throw new Error(latest.blockers.join(' '));
    setStatus('Approve vault creation in your controller wallet.');
    const sent = await wallet.sendVaultTransaction(latest); setHash(sent);
    try { localStorage.setItem(key, sent); } catch { setStatus(`Transaction submitted: ${sent}. Save this hash; browser storage is unavailable.`); }
    // Preserve the hash before waiting: a slow RPC or refresh cannot trigger another send.
    setStatus('Transaction submitted. Wait for confirmation, then verify the saved transaction below.');
    await verify(sent);
  }
  if (record.binding) return <section aria-label="Vault setup complete"><Badge tone="purple"><Check size={12} />Identity & vault binding recorded</Badge><CopyValue value={record.binding.vault} label="dedicated vault" />{record.binding.deploymentTransaction && <CopyValue value={record.binding.deploymentTransaction} label="deployment transaction" />}<Note>Trading setup required. This receipt verifies deployment at block {record.binding.blockNumber}; it does not enable investing or establish current trading authority.</Note></section>;
  const correct = wallet.binding?.address.toLowerCase() === record.manifest.controller.toLowerCase() && wallet.binding?.chainId === plan?.chainId;
  return <section aria-label="Complete identity and vault setup" style={{ marginTop: 24 }}>
    <h3>Finish registration · create your vault</h3><p>Both wallet authorizations are saved. One controller transaction creates a dedicated vault and its ERC-8004 identity together. No need to repeat the local model check or signatures.</p>
    <ol className="small"><li>Local model and both wallet authorizations saved.</li><li>Create the public identity and vault with your controller wallet.</li><li>Verify the mined transaction before marking vault setup complete.</li></ol>
    <Note>{record.manifest.vaultPolicy?'Instant testnet demo: configuration has zero notice. ':''}The vault starts paused. Trading and deposits stay blocked until a live valuation source and restricted trading venue are configured. Paper signals are not funded trading performance.</Note>
    {!session ? <p role="status">Connecting to registration helper…</p> : !session.vaultSetupConfigured ? <Note>Vault deployment is not configured on this server. Setup cannot complete here.</Note> : <>
      <button type="button" className="button secondary" disabled={busy || !!hash} onClick={() => void action(prepare)}><ShieldCheck size={16} />{plan ? 'Refresh deployment check' : 'Review vault deployment'}</button>
      {plan && <div className="panel" style={{ marginTop: 16 }}><Badge tone="neutral">Monad testnet · chain {plan.chainId}</Badge><p className="small">{plan.scope}</p><h3>Controller · identity owner</h3><CopyValue value={plan.from} label="deployment controller" /><h3>Trading manager</h3><CopyValue value={record.manifest.executionKey} label="vault manager" /><p>Controller balance: {formatEther(BigInt(plan.balance))} MON<br />Estimated gas budget: {formatEther(BigInt(plan.estimatedFee))} MON</p>{plan.blockers.map(x => <p className="form-error" key={x}>{x}</p>)}<div style={{ margin: '16px 0' }}><WalletButton /></div>{!correct && <p className="small muted">Connect the controller above on Monad testnet to deploy.</p>}<button type="button" className="button full" disabled={busy || wallet.busy || !correct || !plan.canSubmit || !!hash} onClick={() => void action(submit)}>Create identity & vault</button><button className="text-button" type="button" onClick={() => downloadJson('pumpcoin-vault-transaction.json', { chainId: plan.chainId, from: plan.from, data: plan.data, gas: plan.gas, value: plan.value, commitment: plan.commitment, scope: plan.scope })}><Download size={14} />Export transaction for another signing tool</button></div>}
      <details open={!!hash} style={{ marginTop: 16 }}><summary>Already submitted? Recover with the transaction hash</summary><p className="small muted">Verification never submits another transaction. A pending transaction can be checked again after mining. Keep the hash if the wallet or browser closes.</p><label htmlFor={`vault-hash-${record.id}`}>Deployment transaction hash</label><input id={`vault-hash-${record.id}`} className="mono-input" style={{ width: '100%' }} value={hash} disabled={busy} onChange={e => setHash(e.target.value.trim())} /><button type="button" className="button secondary" disabled={busy || !/^0x[0-9a-f]{64}$/i.test(hash)} onClick={() => void action(() => verify(hash as Hex))}>Verify deployment</button></details>
    </>}
    {status && <p className="small" role="status">{status}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
