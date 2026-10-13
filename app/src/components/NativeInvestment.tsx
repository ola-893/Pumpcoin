import { useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import type { NativeAction, NativePlan, NativeState } from '../../../agent-registration/native-investment-types';
import { useWallet } from '../lib/wallet-context';
import { registrationSession, registrationRequest, type RegistrationRecord } from '../lib/agent-registration';
import { WalletButton } from './WalletProvider';
import { Badge, CopyValue, Note } from './UI';

const labels:Record<NativeAction,string>={'deposit-mon':'Invest MON','redeem-mon':'Redeem Pump for MON','approve-native-exit':'Approve exact Pump amount','deploy-native':'Deploy MON gateway'};
type Pending={hash:string;planId:string;action:NativeAction};
export function NativeInvestment({record}:{record:RegistrationRecord}) {
 const wallet=useWallet(),[state,setState]=useState<NativeState>(),[action,setAction]=useState<NativeAction>('deposit-mon'),[amount,setAmount]=useState('1'),[plan,setPlan]=useState<NativePlan>(),[pending,setPending]=useState<Pending>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[now,setNow]=useState(Date.now);
 const lock=useRef(false),revision=useRef(wallet.binding?.revision);revision.current=wallet.binding?.revision;
 const key=`pumpcoin.native-pending.v1.${record.id}`;
 async function request(route:string,body:unknown,signal?:AbortSignal){const session=await registrationSession(signal);return registrationRequest(session.token,route,body,signal);}
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'MON investment check failed.');}finally{lock.current=false;setBusy(false);}}
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{setPending(undefined);try{const saved=JSON.parse(localStorage.getItem(key)??'null');if(saved&&/^0x[0-9a-f]{64}$/i.test(saved.planId)&&saved.action in labels)setPending({...saved,hash:typeof saved.hash==='string'?saved.hash:''});}catch{/* A visible hash remains available after submission. */}},[key]);
 useEffect(()=>{setState(undefined);setPlan(undefined);setError('');if(!record.binding)return;const c=new AbortController();request('/native-state',{id:record.id,account:wallet.binding?.address??''},c.signal).then(x=>{if(!c.signal.aborted)setState(x.state);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[record.id,record.binding?.vault,wallet.binding?.address,wallet.binding?.chainId,wallet.binding?.revision]);
 async function refresh(){const x=await request('/native-state',{id:record.id,account:wallet.binding?.address??''});setState(x.state);setPlan(undefined);}
 async function review(selected:NativeAction=action){
  const binding=wallet.binding;if(!binding||binding.chainId!==10143)throw new Error('Connect your wallet on Monad testnet.');
  const units=selected==='deploy-native'?'0':parseUnits(amount,selected==='deposit-mon'?18:12).toString();
  const x=await request('/native-plan',{id:record.id,action:selected,account:binding.address,amount:units});
  if(revision.current!==binding.revision)throw new Error('Wallet changed. Review again.');
  if(x.plan.from.toLowerCase()!==binding.address.toLowerCase()||x.plan.action!==selected||x.plan.native?.amount!==units&&selected!=='deploy-native'||x.plan.native&&(x.plan.native.gateway!==state?.gateway||x.plan.native.vault!==state?.vault))throw new Error('Review does not match the selected wallet, amount or vault.');
  setPlan(x.plan);setStatus('Exact transaction simulated. Review the amounts before opening your wallet.');
 }
 async function submit(){
  if(!plan||pending)throw new Error('Verify the pending transaction before submitting another.');
  // Require durable local recovery before broadcasting a money movement.
  const marker={planId:plan.id,action:plan.action};localStorage.setItem(key,JSON.stringify(marker));
  let hash:string;
  try { hash=await wallet.sendTradingTransaction(plan); } catch(e) {
   if(e instanceof Error&&e.message.includes('Wallet request declined')){localStorage.removeItem(key);}else{setPending({...marker,hash:''});setPlan(undefined);}
   throw e;
  }
  const saved={...marker,hash};setPending(saved);setPlan(undefined);
  try{localStorage.setItem(key,JSON.stringify(saved));}catch{setError('Storage failed after submission. Save the visible hash and review ID before refreshing.');}
  setStatus('Submitted. Checking the receipt; your saved transaction remains available if verification needs a retry.');
  await verify(saved);
 }
 async function verify(receipt=pending){if(!receipt||!/^0x[0-9a-f]{64}$/i.test(receipt.hash))throw new Error('Find the transaction hash in your wallet activity before verifying.');const x=await request('/native-receipt',{id:record.id,planId:receipt.planId,transactionHash:receipt.hash});localStorage.removeItem(key);setPending(undefined);setStatus(x.receipt.status==='success'?'Verified on Monad testnet. Your balances will refresh.':'The transaction reverted. No investment change was made.');await refresh();}
 const expired=!!plan&&now>=plan.quote.expiresAt;
 let approvalNeeded=false;try{approvalNeeded=!!wallet.binding&&state?.allowance!==undefined&&action==='redeem-mon'&&parseUnits(amount,12)>BigInt(state?.allowance??'0');}catch{/* Invalid input is explained during review. */}
 const checking=!state&&!error&&!!record.binding;
 let validAmount=false;try{validAmount=/^\d+(\.\d+)?$/.test(amount)&&parseUnits(amount,action==='deposit-mon'?18:12)>0n;}catch{/* Review explains malformed amounts. */}
 const canReview=!!wallet.binding&&wallet.binding.chainId===10143&&(approvalNeeded?!!state?.gateway:!!state?.ready&&!error)&&validAmount&&!pending&&!busy&&!wallet.busy;
 return <section className="panel native-investment" aria-label="Invest and redeem MON">
  <div className="native-heading"><h2>Your investment</h2><Badge tone={checking?'neutral':state?.ready&&!error?'green':'amber'}>{checking?'Checking…':error?'Check unavailable':state?.ready?'Ready on testnet':'Setup required'}</Badge></div>
  <p>Invest MON to receive Pump vault shares. Redeem your shares for their current value in MON.</p>
  {!record.binding?<Note>Investing opens after this agent has a deployed vault and verified trading infrastructure.</Note>:<>
   {checking&&<p className="native-checking" role="status">Checking vault readiness on Monad testnet…</p>}
   {state&&!state.ready&&<div className="native-unavailable"><strong>Investing is not available yet</strong><p>Fresh prices and healthy liquidity are required to invest or redeem. You can approve an exact Pump amount first; approval does not move your shares.</p><details><summary>View setup requirements <span>{state.blockers.length}</span></summary><ul>{state.blockers.map(x=><li key={x}>{x}</li>)}</ul></details></div>}
   <div className="native-switch" role="group" aria-label="Investment action">{(['deposit-mon','redeem-mon'] as const).map(option=><button key={option} type="button" aria-pressed={action===option} disabled={busy||!!pending} onClick={()=>{setAction(option);setAmount('1');setPlan(undefined);setStatus('');}}>{option==='deposit-mon'?'Invest MON':'Redeem Pump'}</button>)}</div>
   <div className="native-amount"><label htmlFor={`native-amount-${record.id}`}>{action==='deposit-mon'?'Amount to invest':'Shares to redeem'}</label><div><input id={`native-amount-${record.id}`} aria-describedby={`native-help-${record.id}`} autoComplete="off" value={amount} inputMode="decimal" disabled={busy||!!pending} onChange={e=>{setAmount(e.target.value);setPlan(undefined);}}/><span>{action==='deposit-mon'?'MON':'Pump'}</span></div></div>
   <p className="native-help" id={`native-help-${record.id}`}>{action==='deposit-mon'?'You receive Pump shares. Conversion fees apply.':'You receive MON at the current share value, subject to liquidity.'}</p>
   {amount&&!validAmount&&<p className="form-error" role="status">Enter an amount greater than zero.</p>}
   {approvalNeeded&&<p className="small">First approve this exact Pump amount. After its receipt is verified, review the MON redemption.</p>}
   <div className="native-wallet"><WalletButton/></div>
   {wallet.binding&&wallet.binding.chainId!==10143&&<p className="form-error">Switch your connected wallet to Monad testnet to continue.</p>}
   <button className="button full native-review-button" disabled={!canReview} onClick={()=>void run(()=>review(approvalNeeded?'approve-native-exit':action))}>{busy?'Checking transaction…':approvalNeeded?'Review Pump approval':action==='deposit-mon'?'Review investment':'Review redemption'}</button>
   {!wallet.binding&&<p className="native-help">Connect your wallet to see balances and review an investment.</p>}
   <div className="native-balances"><div><small>Your MON</small><strong>{state?.nativeBalance!==undefined?formatUnits(BigInt(state.nativeBalance),18):'—'}</strong></div><div><small>Your Pump shares</small><strong>{state?.shares!==undefined?formatUnits(BigInt(state.shares),12):'—'}</strong></div></div>
   <button className="profile-refresh" disabled={busy||checking} onClick={()=>void run(refresh)}>{busy?'Checking…':'Refresh balances & readiness'}</button>
   {state&&<details className="native-technical"><summary>Vault details & verified balances</summary><p className="small">Checked at block {state.blockNumber} · {new Date(state.checkedAt).toLocaleString()}</p><p className="small">Liquid redemption limit: {state.maxRedeem!==undefined?`${formatUnits(BigInt(state.maxRedeem),12)} Pump`:'Unavailable'}</p><p className="small">Vault value: {state.nav!==undefined?`${formatUnits(BigInt(state.nav),6)} test-USDC`:'Unavailable'}. The vault accounts in test-USDC; MON investment uses a conversion gateway.</p>{state.gateway&&<CopyValue value={state.gateway} label="MON conversion gateway"/>}</details>}
   {state&&!state.gateway&&wallet.binding?.chainId===10143&&wallet.binding.address.toLowerCase()===state.controller.toLowerCase()&&<details className="native-technical"><summary>Controller: MON gateway setup</summary><p className="small">Review the conversion gateway deployment after the vault’s trading infrastructure is configured.</p><button className="button secondary" disabled={busy||!!pending} onClick={()=>void run(()=>review('deploy-native'))}>Review gateway deployment</button></details>}
   {plan&&<div className="native-plan"><h3>{labels[plan.action]}</h3><p>{plan.scope}</p>{plan.quoteAssets&&<p>Conversion amount: {formatUnits(BigInt(plan.quoteAssets),6)} test-USDC.</p>}{plan.output&&<p>You receive approximately <strong>{formatUnits(BigInt(plan.output),plan.action==='deposit-mon'?12:18)} {plan.action==='deposit-mon'?'Pump shares':'MON'}</strong>; minimum {formatUnits(BigInt(plan.native!.minOutput),plan.action==='deposit-mon'?12:18)}.</p>}<p className="small">Gas budget: {formatUnits(BigInt(plan.estimatedFee),18)} MON, in addition to your investment. {plan.action==='deposit-mon'&&`MON sent: ${formatUnits(BigInt(plan.value),18)}.`}</p><p className="small">{expired?'Review expired. Simulate again.':`Review expires in ${Math.max(0,Math.ceil((plan.quote.expiresAt-now)/1000))} seconds.`} Conversion uses the fixed WMON/test-USDC pool; the displayed output includes its fees. Minimum output tolerance is 0.1%, with an additional independent oracle floor.</p><button className="button full" disabled={busy||wallet.busy||expired||!!pending} onClick={()=>void run(submit)}>Confirm in wallet</button></div>}
  </>}
  <p className="native-risk">Gains, losses and fees change your share value. The MON you receive may be less than you invested.</p>
  {pending&&<Note><p>Submitted {labels[pending.action].toLowerCase()}. Keep this receipt until verified.</p>{pending.hash&&<CopyValue value={pending.hash} label="native investment transaction"/>}{!pending.hash&&<p>The wallet did not return a verified hash. Check its activity before retrying this investment.</p>}{!pending.hash&&<button className="text-button" disabled={busy} onClick={()=>{localStorage.removeItem(key);setPending(undefined);setStatus('You confirmed no transaction was submitted. Review again before investing.');}}>I checked my wallet: nothing was submitted</button>}<input aria-label="Recover MON transaction hash" value={pending.hash} placeholder="Transaction hash from wallet activity" onChange={e=>{const saved={...pending,hash:e.target.value.trim()};setPending(saved);localStorage.setItem(key,JSON.stringify(saved));}}/><CopyValue value={pending.planId} label="saved review ID"/>{pending.hash&&<a className="text-link" href={`https://testnet.monadexplorer.com/tx/${pending.hash}`} target="_blank" rel="noreferrer">View on Monad explorer</a>}<button className="button secondary" disabled={busy||!/^0x[0-9a-f]{64}$/i.test(pending.hash)} onClick={()=>void run(verify)}>Verify mined receipt</button></Note>}
  {status&&<p role="status" className="small native-feedback">{status}</p>}{error&&<div className="native-feedback"><p role="alert" className="form-error">{error}</p>{!state&&record.binding&&<button className="button secondary" disabled={busy} onClick={()=>void run(refresh)}>Retry vault check</button>}</div>}
 </section>;
}
