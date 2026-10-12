import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Fingerprint } from 'lucide-react';
import { Modal, Badge, CopyValue } from './UI';
import { PROOFLINE_CHAIN_ID, sendBrowserTradingTransaction, type TradingWalletTransaction, sameWallet, validateVaultTransaction, validateTradingTransaction, validateTradingQuote, readBrowserBinding, sendBrowserVaultTransaction, type VaultWalletTransaction, signBrowserMessage, signChecked, publicWalletError, walletAddress, walletChain, type Provider, type WalletBinding } from '../lib/wallet-core';
import { Context, type Choice, useWallet } from '../lib/wallet-context';
import { short } from '../lib/evidence';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [binding, setBinding] = useState<WalletBinding>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [choices, setChoices] = useState<Choice[]>(() => { const p = (window as Window & { ethereum?: Provider }).ethereum; return p?.request ? [{ id: 'browser', name: 'Browser wallet', provider: p }] : []; });
  const current = useRef<WalletBinding | undefined>(undefined), revision = useRef(0), locked = useRef(false), provider = useRef<Provider | undefined>(undefined), detach = useRef<() => void>(() => {});
  function update(value?: WalletBinding) { current.current = value; setBinding(value); }
  function disconnect() { revision.current++; detach.current(); detach.current = () => {}; provider.current = undefined; update(); setError(''); }
  useEffect(() => {
    const announced = (event: Event) => {
      const value = (event as CustomEvent).detail;
      if (!value?.provider || typeof value.provider.request !== 'function' || typeof value.info?.uuid !== 'string' || typeof value.info?.name !== 'string') return;
      setChoices(old => old.some(x => x.provider === value.provider) ? old : [...old, { id: value.info.uuid.slice(0, 100), name: value.info.name.slice(0, 80), provider: value.provider }]);
    };
    window.addEventListener('eip6963:announceProvider', announced);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const generation = revision, live = current;
    return () => { window.removeEventListener('eip6963:announceProvider', announced); generation.current++; detach.current(); live.current = undefined; };
  }, []);
  function start() { if (locked.current) throw new Error('Finish or cancel the current wallet prompt first.'); locked.current = true; setBusy(true); setError(''); }
  function finish() { locked.current = false; setBusy(false); }
  function listen(p: Provider, name: string) {
    const invalidate = (event: 'accounts' | 'chain', value: unknown) => {
      revision.current++;
      if (!current.current || provider.current !== p) return;
      try {
        const previous = current.current;
        update({ ...previous, revision: revision.current, ...(event === 'accounts' ? { address: walletAddress(Array.isArray(value) ? value[0] : undefined) } : { chainId: walletChain(value) }) });
        setError('Wallet changed. Any previous ownership check was cleared.');
      } catch { update(); setError('Wallet disconnected. Connect again.'); }
    };
    const accounts = (value: unknown) => invalidate('accounts', value), chain = (value: unknown) => invalidate('chain', value);
    const dropped = () => { revision.current++; update(); setError('Wallet disconnected. Connect again.'); };
    p.on?.('accountsChanged', accounts); p.on?.('chainChanged', chain); p.on?.('disconnect', dropped);
    detach.current = () => { p.removeListener?.('accountsChanged', accounts); p.removeListener?.('chainChanged', chain); p.removeListener?.('disconnect', dropped); };
    return name;
  }
  async function connectBrowser(choice: Choice) {
    if (locked.current) return; start(); disconnect(); const token = revision.current;
    provider.current = choice.provider; listen(choice.provider, choice.name);
    try {
      const actual = await readBrowserBinding(choice.provider, true);
      if (token !== revision.current) throw new Error('Wallet changed while connecting. Retry.');
      update({ ...actual, revision: token, kind: 'browser', name: choice.name });
    } catch (e) { detach.current(); provider.current = undefined; update(); setError(publicWalletError(e)); } finally { finish(); }
  }
  async function connectMera(create: boolean) {
    if (locked.current) return; start(); disconnect(); const token = revision.current;
    try {
      const { withMeraAccount } = await import('../lib/mera');
      const address = await withMeraAccount(create, async account => account.address);
      if (token !== revision.current) throw new Error('Connection cancelled. Connect again.');
      update({ address, chainId: PROOFLINE_CHAIN_ID, revision: token, kind: 'mera', name: 'Mera passkey' });
    } catch (e) { setError(publicWalletError(e)); } finally { finish(); }
  }
  async function switchTestnet() {
    if (locked.current) return; const selected = current.current, p = provider.current;
    if (!selected || !p || selected.kind !== 'browser') return;
    start();
    try {
      // The wallet explicitly approves switching; no background network changes.
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x279f' }] });
      const actual = await readBrowserBinding(p);
      if (provider.current !== p || !current.current || actual.address.toLowerCase() !== selected.address.toLowerCase() || actual.chainId !== PROOFLINE_CHAIN_ID) throw new Error('Network switch did not preserve the selected wallet. Reconnect.');
      revision.current++; update({ ...selected, ...actual, revision: revision.current }); setError('');
    } catch (e) { setError((e as { code?: number })?.code === 4902 ? 'Add Monad testnet (chain 10143) in your wallet, then reconnect. No network was added automatically.' : publicWalletError(e)); } finally { finish(); }
  }
  async function sign(message: string) {
    const selected = current.current; if (!selected) throw new Error('Connect a wallet first.'); start();
    try {
      if (selected.kind === 'browser') {
        const p = provider.current; if (!p) throw new Error('Reconnect your wallet.');
        return await signBrowserMessage(p, selected, () => current.current, message);
      }
      const { withMeraAccount } = await import('../lib/mera');
      return await withMeraAccount(false, async account => signChecked({ binding: selected, current: () => current.current, message,
        assertExternal: async () => { if (account.address.toLowerCase() !== selected.address.toLowerCase()) throw new Error('A different passkey was selected. Reconnect before signing.'); },
        sign: value => account.signMessage({ message: value }),
      }));
    } catch (e) { const text = publicWalletError(e); setError(text); throw new Error(text); } finally { finish(); }
  }
  async function sendMeraTransaction(transaction: TradingWalletTransaction, selected: WalletBinding) {
    const { withMeraAccount } = await import('../lib/mera');
    const { createWalletClient, http } = await import('viem');
    const { monadTestnet } = await import('viem/chains');
    return await withMeraAccount(false, async account => {
      if (account.address.toLowerCase() !== selected.address.toLowerCase() || !sameWallet(current.current, selected)) throw new Error('Controller changed. Reconnect before submitting.');
      const client = createWalletClient({ account, chain: monadTestnet, transport: http() });
      const request = await client.prepareTransactionRequest({ ...(transaction.to ? { to: transaction.to } : {}), data: transaction.data, value: BigInt(transaction.value), gas: BigInt(transaction.gas) });
      if (!sameWallet(current.current, selected)) throw new Error('Controller changed before submission.');
      const serializedTransaction = await client.signTransaction(request);
      if (!sameWallet(current.current, selected)) throw new Error('Controller changed before broadcast.');
      validateTradingQuote(transaction);
      return client.sendRawTransaction({ serializedTransaction });
    });
  }
  async function sendVaultTransaction(transaction: VaultWalletTransaction) {
    const selected = current.current;
    if (!selected) throw new Error('Connect the controller wallet first.');
    const p = provider.current;
    if (selected.kind === 'browser' && !p) throw new Error('Reconnect the controller wallet.');
    start();
    try {
      validateVaultTransaction(transaction, selected);
      if (selected.kind === 'browser') return await sendBrowserVaultTransaction(p!, selected, () => current.current, transaction);
      return await sendMeraTransaction(transaction, selected);
    }
    catch (e) { const message = publicWalletError(e); setError(message); throw new Error(message); }
    finally { finish(); }
  }
  async function sendTradingTransaction(transaction: TradingWalletTransaction) {
    const selected = current.current, p = provider.current;
    if (!selected || (selected.kind === 'browser' && !p)) throw new Error('Connect your wallet on Monad testnet.');
    start();
    try {
      validateTradingTransaction(transaction, selected);
      if (selected.kind === 'browser') return await sendBrowserTradingTransaction(p!, selected, () => current.current, transaction);
      return await sendMeraTransaction(transaction, selected);
    }
    catch (e) { const message = publicWalletError(e); setError(message); throw new Error(message); }
    finally { finish(); }
  }
  return <Context.Provider value={{ binding, busy, error, choices, connectBrowser, connectMera, disconnect, switchTestnet, sign, sendTradingTransaction, sendVaultTransaction }}>{children}</Context.Provider>;
}
export function WalletButton() {
  const [open, setOpen] = useState(false);
  const wallet = useWallet();
  return <>
    <button className="wallet-button" onClick={() => setOpen(true)}>{wallet.binding ? short(wallet.binding.address) : 'Connect wallet'}</button>
    {open && <Modal title={wallet.binding ? 'Your connected wallet' : 'Choose your wallet'} onClose={() => setOpen(false)}>
      <p>Connect a Mera passkey account or an EVM browser wallet. Wallet ownership and agent performance are separate checks.</p>
      {wallet.binding ? <>
        <CopyValue value={wallet.binding.address} label="wallet address" />
        <div className="wallet-status"><Badge tone="neutral">{wallet.binding.name}</Badge><Badge tone="neutral">{wallet.binding.chainId === 10143 ? 'Monad testnet · 10143' : `Chain ${wallet.binding.chainId}`}</Badge></div>
        {wallet.binding.chainId !== 10143 && <button className="button full" disabled={wallet.busy} onClick={() => void wallet.switchTestnet()}>Switch to Monad testnet</button>}
        <button className="button secondary full" onClick={wallet.disconnect}>Disconnect from PumpCoin</button>
      </> : <div className="wallet-options">
        <h3><Fingerprint size={18} /> Passkey account</h3>
        <p className="small muted">Use an existing passkey to recover the same account. Creating a passkey makes a new account.</p>
        <button className="button full" disabled={wallet.busy} onClick={() => void wallet.connectMera(false)}>Use existing passkey<ArrowRight size={16} /></button>
        <button className="button secondary full" disabled={wallet.busy} onClick={() => void wallet.connectMera(true)}>Create new passkey</button>
        <h3>Browser wallet fallback</h3>
        {wallet.choices.map((choice, i) => <button key={`${choice.id}-${i}`} className="button secondary full" disabled={wallet.busy} onClick={() => void wallet.connectBrowser(choice)}>Connect {choice.name}<ArrowRight size={16} /></button>)}
        {!wallet.choices.length && <p className="small muted">No browser wallet detected.</p>}
      </div>}
      {wallet.busy && <p className="small" role="status">Waiting for your wallet…</p>}
      {wallet.error && <p className="form-error" role="alert">{wallet.error}</p>}
    </Modal>}
  </>;
}
