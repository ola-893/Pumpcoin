import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fingerprint, FileCheck2, ShieldCheck, Download, ArrowRight } from 'lucide-react';
import { Badge, CopyValue, Note, PageTitle } from './UI';
import { WalletButton } from './WalletProvider';
import { useWallet } from '../lib/wallet-context';
import { units, type DemoEvidence } from '../lib/evidence';
import { performanceScope, createOwnershipChallenge, validateOwnershipChallenge, type OwnershipReceipt } from '../lib/proofline';
import { sameWallet } from '../lib/wallet-core';
import { downloadJson } from '../lib/registration';

export function ProofLine({ data, source, error }: { data?: DemoEvidence; source?: string; error: string }) {
  const wallet = useWallet(); const [message, setMessage] = useState(''), [receipt, setReceipt] = useState<OwnershipReceipt>(), [failure, setFailure] = useState(''), [pending, setPending] = useState(false), [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const scope = useMemo(() => data && source ? performanceScope(data, source) : undefined, [data, source]);
  const scopeKey = JSON.stringify(scope), latest = useRef({ binding: wallet.binding, scopeKey, message }); useLayoutEffect(() => { latest.current = { binding: wallet.binding, scopeKey, message }; });
  // Wallet events invalidate the external authorization, including changes away and back.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { setMessage(''); setReceipt(undefined); }, [wallet.binding?.revision, scopeKey]);
  useEffect(() => { const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => () => { latest.current = { binding: undefined, scopeKey: '', message: '' }; }, []);
  const expiresAt = message ? (JSON.parse(message) as { expiresAt: number }).expiresAt : 0;
  const expired = !!message && expiresAt <= now;
  function prepare() {
    setFailure(''); setReceipt(undefined);
    try {
      if (!wallet.binding || !scope) throw new Error('Connect your wallet and load the evidence first.');
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      const time = Math.floor(Date.now() / 1000); setNow(time);
      setMessage(createOwnershipChallenge(wallet.binding, scope, location.origin, time, nonce));
    } catch (e) { setFailure(e instanceof Error ? e.message : 'Unable to prepare ownership check.'); }
  }
  async function sign() {
    if (pending || !scope || !wallet.binding) return;
    const selected = wallet.binding, selectedScope = scope, selectedKey = scopeKey, reviewed = message; setFailure(''); setPending(true);
    try {
      validateOwnershipChallenge(reviewed, selected, selectedScope, location.origin, Math.floor(Date.now() / 1000));
      const signature = await wallet.sign(reviewed);
      if (!sameWallet(latest.current.binding, selected) || latest.current.scopeKey !== selectedKey || latest.current.message !== reviewed) throw new Error('Wallet or evidence changed. Start a new ownership check.');
      const checkedAt = Math.floor(Date.now() / 1000);
      validateOwnershipChallenge(reviewed, selected, selectedScope, location.origin, checkedAt);
      setNow(checkedAt); setReceipt({ version: 'PUMPCOIN-WALLET-OWNERSHIP-v1', message: reviewed, signature, checkedAt, evidenceLevel: 'signature-verified', authority: 'none', performanceVerification: 'archive-reconciled-not-independently-verified' });
    } catch (e) { setReceipt(undefined); setFailure(e instanceof Error ? e.message : 'Ownership check failed.'); } finally { setPending(false); }
  }
  return <div className="container page"><PageTitle eyebrow="PROOFLINE · AGENT PERFORMANCE" title={<>Follow the record.<br /><em>Know what was verified.</em></>} body="Inspect the evidence behind an agent’s trading performance. Wallet ownership, historical accounting and trading authority each have their own checks." />
    <div className="proofline-flow"><div><Fingerprint size={22} /><strong>01 · Identify the signer</strong><p>A wallet signature proves control of the signing account.</p></div><ArrowRight size={20} /><div><FileCheck2 size={22} /><strong>02 · Reconcile the evidence</strong><p>Capital flows, fees, losses and configuration changes stay in the record.</p></div><ArrowRight size={20} /><div><ShieldCheck size={22} /><strong>03 · Check the authority</strong><p>A vault’s deployed permissions determine who may trade.</p></div></div>
    <Note>The current record is a stopped Anvil simulation (chain 31337), with scripted trades, valueless tokens and injected prices. It is not a funded trading record or proof of local-model execution. The wallet check uses Monad testnet (10143); it does not move this archive onto testnet.</Note>
    {!data || !scope ? <Note>{error || 'Loading and reconciling the archived trading evidence…'}</Note> : <div className="proofline-grid"><section className="panel"><EyebrowLabel>TRADING EVIDENCE</EyebrowLabel><h2>Local vault demonstrator</h2><div className="wallet-status"><Badge tone="neutral">Simulation</Badge><Badge tone="neutral">Accounting reconciled</Badge></div><div className="mandate-list"><div><span>Net P&L</span><p className="loss">{units(data.report.netPnl)} test quote</p></div><div><span>Deposits / withdrawals</span><p>{units(data.report.deposits)} / {units(data.report.withdrawals)} test quote</p></div><div><span>Coverage</span><p>Blocks {scope.fromBlock}–{scope.toBlock} · evidence chain {scope.evidenceChainId}</p></div><div><span>Independent verification</span><p>Unavailable. Accounting was replayed against the saved bundle; no live RPC check was performed in this screen.</p></div><div><span>Agent authority</span><p>Historical manager only. No public agent registration or active vault is connected.</p></div></div><div className="proofline-commitment"><small>Archived vault</small><CopyValue value={scope.vault} label="archived vault" /><small>Historical manager</small><CopyValue value={scope.manager} label="historical manager" /><small>Configuration / strategy</small><CopyValue value={scope.configHash} label="configuration commitment" /><CopyValue value={scope.strategyHash} label="strategy commitment" /><small>Exact evidence bundle digest (Keccak-256)</small><CopyValue value={scope.bundleHash} label="evidence bundle digest" /></div><Link className="text-link" to="/evidence">Inspect receipts and checkpoints<ArrowRight size={15} /></Link></section>
      <section className="panel"><EyebrowLabel>WALLET OWNERSHIP CHECK</EyebrowLabel><h2>A signature with a clear scope.</h2><p className="small muted">Optional for viewing public evidence. This check binds your wallet to a read-only review of this exact archive. It does not assert that you control the agent, register an identity, prove performance, or grant trading permissions.</p><WalletButton />{wallet.binding && <><div className="proofline-commitment"><small>Selected signer · {wallet.binding.name}</small><CopyValue value={wallet.binding.address} label="selected signer" /></div><Badge tone="neutral">Wallet network · {wallet.binding.chainId}</Badge>{wallet.binding.chainId !== 10143 ? <><Note>Switch to Monad testnet before starting the ownership check.</Note><button className="button full" disabled={wallet.busy} onClick={() => void wallet.switchTestnet()}>Switch to Monad testnet</button></> : <><button className="button secondary full" disabled={wallet.busy || pending} onClick={prepare}>{message ? 'Prepare a fresh check' : 'Prepare ownership check'}</button>{message && <><h3>Review the exact message</h3><pre className="proofline-message">{JSON.stringify(JSON.parse(message), null, 2)}</pre><p className="small muted">{expired ? 'This check expired. Prepare a fresh one.' : `Expires in ${Math.max(0, expiresAt - now)} seconds. A network or wallet change clears this check.`}</p>{receipt && !expired ? <><Badge tone="green">Wallet signature verified</Badge><p className="small muted">Only control of this signing EOA was verified. No verification service received this check. Export includes your public address and signature.</p><button className="button secondary full" onClick={() => downloadJson('pumpcoin-wallet-ownership-receipt.json', receipt)}><Download size={15} />Export public ownership receipt</button></> : <button className="button full" disabled={wallet.busy || pending || expired} onClick={() => void sign()}>{pending ? 'Waiting for signature…' : 'Sign this ownership check'}</button>}</>}</>}</>}{failure && <p className="form-error" role="alert">{failure}</p>}
      <Note>Live performance submissions are unavailable until an agent identity, vault deployment and independent evidence source are configured. The legacy Stripe-income verifier is not used for trading evidence.</Note></section></div>}
  </div>;
}
function EyebrowLabel({ children }: { children: string }) { return <p className="eyebrow">{children}</p>; }
