import { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { registrationRequest, registrationSession, type RegistrationRecord } from '../lib/agent-registration';
import { quoteUnits } from '../lib/registration';
import type { VaultWalletTransaction } from '../lib/wallet-core';
import { useWallet } from '../lib/wallet-context';
import { Badge, CopyValue } from './UI';
import { WalletButton } from './WalletProvider';
import { AutonomousTrader } from './AutonomousTrader';
import { LiveVaultEvidence } from './LiveVaultEvidence';

type Status = { active: boolean; paused: boolean; adapterConfigured: boolean; validUntil: number; dailyQuoteCap: string; dailyQuoteTraded: string };
export function AutonomyControls({ record, showEvidence = true }: { record: RegistrationRecord; showEvidence?: boolean }) {
  const wallet = useWallet(), [status, setStatus] = useState<Status>(), [days, setDays] = useState('7'), [daily, setDaily] = useState('100'), [plan, setPlan] = useState<VaultWalletTransaction & { scope: string }>(), [hash, setHash] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const active = useRef<AbortController | undefined>(undefined), lock = useRef(false);
  useEffect(() => () => active.current?.abort(), []);
  if (!record.binding) return null;
  const controller = wallet.binding?.address.toLowerCase() === record.manifest.controller.toLowerCase() && wallet.binding?.chainId === record.binding.chainId;
  async function action(run: (token: string, signal: AbortSignal) => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    const abort = new AbortController(); active.current = abort;
    try { const helper = await registrationSession(abort.signal); await run(helper.token, abort.signal); }
    catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Trading permission check failed.'); }
    finally { lock.current = false; if (!abort.signal.aborted) setBusy(false); }
  }
  async function prepare(action: 'grant' | 'revoke') {
    setPlan(undefined); setHash('');
    await actionRun(action);
  }
  const actionRun = (operation: 'grant' | 'revoke') => action(async (token, signal) => {
    const result = await registrationRequest(token, '/autonomy-plan', { id: record.id, action: operation, days: Number(days), dailyQuoteCap: operation === 'grant' ? quoteUnits(daily).toString() : '0' }, signal);
    setPlan(result.plan);
  });
  return <><section className="panel operator-permission" aria-label="Autonomous trading permissions">
    <span className="operator-kicker">AGENT AUTHORIZATION</span><h2>Trading permission</h2><p>Approve the agent once to let it sign trades within your limits.</p>
    <button type="button" className="button secondary" disabled={busy} onClick={() => void action(async (token, signal) => { const result = await registrationRequest(token, '/autonomy-status', { id: record.id }, signal); setStatus(result.status); })}>{busy ? 'Checking permission…' : 'Check permission'}</button>
    {status && <><Badge tone={status.active ? 'purple' : 'neutral'}>{status.active ? 'Permission active' : 'Permission inactive'}</Badge><p className="small">UTC daily turnover: {formatUnits(BigInt(status.dailyQuoteTraded), 6)} / {formatUnits(BigInt(status.dailyQuoteCap), 6)} quote units. {status.validUntil ? `Expires ${new Date(status.validUntil * 1000).toLocaleString()}.` : 'No grant recorded.'}</p>{(!status.adapterConfigured || status.paused) && <p className="small muted">Activate the restricted venue and healthy valuation through the vault’s configuration notice before granting permission.</p>}</>}
    <details className="operator-details"><summary>Permission settings</summary><div className="form-grid" style={{ marginTop: 16 }}><label>Duration · days<input type="number" min="1" max="30" value={days} onChange={e => { setDays(e.target.value); setPlan(undefined); }} /></label><label>Daily turnover limit · test-USDC<input value={daily} onChange={e => { setDaily(e.target.value); setPlan(undefined); }} /></label></div>
    <p className="small muted">Both buys and sells count toward the UTC daily cap. Per-trade and position caps remain enforced. Maximum slippage: {record.manifest.proposedMandate.slippageBps} bps.</p>
    <div className="review-actions"><button type="button" className="button" disabled={busy || !controller} onClick={() => void prepare('grant')}>Review trading permission</button><button type="button" className="text-button operator-revoke" disabled={busy || !controller} onClick={() => void prepare('revoke')}>Review revocation</button></div>{!controller && <p className="small">Connect the controller wallet to change permission.</p>}</details>
    {plan && <div className="operator-transaction-review"><h3>Review permission change</h3><p>{plan.scope}</p><WalletButton />{!controller && <p className="small muted">Connect this agent’s controller on the vault’s chain.</p>}<button type="button" className="button full" disabled={busy || wallet.busy || !controller || !!hash} onClick={() => void action(async () => { setHash(await wallet.sendVaultTransaction(plan)); setPlan(undefined); })}>Approve with controller wallet</button></div>}
    {hash && <><p className="small">Transaction submitted. Refresh on-chain permission after it is mined.</p><CopyValue value={hash} label="permission transaction" /></>}
    {record.binding.chainId === 10143 && <AutonomousTrader key={record.id} record={record} />}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>{showEvidence && <LiveVaultEvidence key={record.id} record={record} />}</>;
}
