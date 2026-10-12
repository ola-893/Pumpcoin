import { decodeFunctionData, parseAbi, getAddress, isAddress, recoverMessageAddress, stringToHex, type Address, type Hex } from 'viem';

export const PROOFLINE_CHAIN_ID = 10143;
export type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, callback: (value: unknown) => void): void;
  removeListener?(event: string, callback: (value: unknown) => void): void;
};
export function walletAddress(value: unknown): Address {
  if (typeof value !== 'string' || !isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error('Wallet returned an invalid account.');
  return getAddress(value);
}
export function walletChain(value: unknown): number {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new Error('Wallet returned an invalid chain.');
  const chain = Number(BigInt(value));
  if (!Number.isSafeInteger(chain) || chain <= 0) throw new Error('Wallet returned an invalid chain.');
  return chain;
}
export async function readBrowserBinding(provider: Provider, requestAccess = false) {
  const accounts = await provider.request({ method: requestAccess ? 'eth_requestAccounts' : 'eth_accounts' });
  if (!Array.isArray(accounts) || !accounts.length) throw new Error('Wallet disconnected. Connect again.');
  return { address: walletAddress(accounts[0]), chainId: walletChain(await provider.request({ method: 'eth_chainId' })) };
}
export type WalletBinding = { address: Address; chainId: number; revision: number; kind: 'browser' | 'mera'; name: string };
export function sameWallet(a: WalletBinding | undefined, b: WalletBinding) {
  return !!a && a.address.toLowerCase() === b.address.toLowerCase() && a.chainId === b.chainId && a.revision === b.revision && a.kind === b.kind;
}
// Checks on both sides of the wallet prompt reject account/network changes, including
// changing away and back (the event revision still changes). The recovered EOA must match.
export async function signChecked(args: {
  binding: WalletBinding; current: () => WalletBinding | undefined;
  assertExternal: () => Promise<void>; sign: (message: string) => Promise<Hex>; message: string;
}) {
  const guard = () => { if (!sameWallet(args.current(), args.binding)) throw new Error('Wallet changed. Start a new ownership check.'); };
  guard();
  if (args.binding.chainId !== PROOFLINE_CHAIN_ID) throw new Error('Select Monad testnet before signing.');
  await args.assertExternal(); guard();
  const signature = await args.sign(args.message);
  await args.assertExternal(); guard();
  if (!/^0x[0-9a-f]{130}$/i.test(signature)) throw new Error('Wallet returned an invalid EOA signature.');
  const recovered = await recoverMessageAddress({ message: args.message, signature }); guard();
  if (recovered.toLowerCase() !== args.binding.address.toLowerCase()) throw new Error('Signature does not match the selected wallet.');
  return signature;
}
export async function signBrowserMessage(provider: Provider, binding: WalletBinding, current: () => WalletBinding | undefined, message: string) {
  return signChecked({ binding, current, message,
    assertExternal: async () => {
      const actual = await readBrowserBinding(provider);
      if (actual.address.toLowerCase() !== binding.address.toLowerCase() || actual.chainId !== binding.chainId) throw new Error('Wallet account or network changed. Reconnect before signing.');
    },
    sign: async value => await provider.request({ method: 'personal_sign', params: [stringToHex(value), binding.address] }) as Hex,
  });
}
export function publicWalletError(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  if (code === 4001) return 'Wallet request declined. Nothing was signed or submitted.';
  if (code === 'PRF_UNAVAILABLE') return 'This passkey provider did not return PRF. Use a supported provider or connect a browser wallet. A passkey may have been created even though connection failed.';
  if (code === 'PASSKEY_OPERATION_FAILED' || (error as { name?: string })?.name === 'NotAllowedError') return 'Passkey request cancelled or unavailable. Retry or connect a browser wallet.';
  if (code === 'CRYPTO_UNAVAILABLE') return 'Passkeys require HTTPS or localhost and a supported browser.';
  return error instanceof Error ? error.message.slice(0, 300) : 'Wallet operation failed. Retry or choose another wallet.';
}

export function passkeyAvailability() {
  if (!window.isSecureContext) return 'Passkeys require HTTPS or localhost.';
  if (location.hostname === '127.0.0.1' || location.hostname === '[::1]') return 'Open this preview on localhost to use passkeys. Passkeys belong to their hostname.';
  if (!window.PublicKeyCredential || !navigator.credentials) return 'This browser does not expose WebAuthn. Connect a browser wallet instead.';
  return '';
}

export type VaultWalletTransaction = { chainId: number; from: Address; to?: Address; data: Hex; value: '0x0'; gas: Hex };
export function validateVaultTransaction(tx: VaultWalletTransaction, binding: WalletBinding) {
  if (tx.chainId !== PROOFLINE_CHAIN_ID || tx.value !== '0x0' || !/^0x[0-9a-f]+$/i.test(tx.data) || !/^0x[0-9a-f]+$/i.test(tx.gas) || tx.from.toLowerCase() !== binding.address.toLowerCase()) throw new Error('Invalid controller vault transaction.');
  if (tx.to) {
    walletAddress(tx.to);
    const abi = parseAbi(['function grantTradingPermission(address,bytes32,uint64,uint256,uint16)', 'function revokeTradingPermission()']);
    decodeFunctionData({ abi, data: tx.data }); // Controller UI only submits these fixed-shape calls.
  }
}
export async function sendBrowserVaultTransaction(provider: Provider, binding: WalletBinding, current: () => WalletBinding | undefined, tx: VaultWalletTransaction): Promise<Hex> {
  validateVaultTransaction(tx, binding);
  const actual = await readBrowserBinding(provider);
  if (!sameWallet(current(), binding) || actual.address !== binding.address || actual.chainId !== tx.chainId) throw new Error('Connect the controller on Monad testnet before deploying.');
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: binding.address, ...(tx.to ? { to: tx.to } : {}), data: tx.data, value: tx.value, gas: tx.gas, chainId: '0x279f' }] });
  // Never discard a submitted hash because the user subsequently changes wallets.
  // The server verifies its sender, exact input, receipt and chain independently.
  if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Wallet did not return a deployment transaction hash. Check wallet activity before retrying.');
  return hash as Hex;
}

export type TradingWalletTransaction = Omit<VaultWalletTransaction, 'value'> & { to?: Address; value: Hex };
export function validateTradingTransaction(tx: TradingWalletTransaction, binding: WalletBinding) {
  if (tx.chainId !== PROOFLINE_CHAIN_ID || (!/^0x[0-9a-f]+$/i.test(tx.value) || BigInt(tx.value) > 1000000000000000n || (BigInt(tx.value) > 0n && tx.to?.toLowerCase() !== '0x2880ab155794e7179c9ee2e38200202908c17b43')) || !/^0x[0-9a-f]+$/i.test(tx.data) || !/^0x[0-9a-f]+$/i.test(tx.gas) || tx.from.toLowerCase() !== binding.address.toLowerCase() || (tx.to !== undefined && walletAddress(tx.to) !== tx.to)) throw new Error('Invalid testnet vault transaction.');
}
export async function sendBrowserTradingTransaction(provider: Provider, binding: WalletBinding, current: () => WalletBinding | undefined, tx: TradingWalletTransaction): Promise<Hex> {
  validateTradingTransaction(tx, binding);
  const actual = await readBrowserBinding(provider);
  if (!sameWallet(current(), binding) || actual.address !== binding.address || actual.chainId !== tx.chainId) throw new Error('Wallet or network changed. Review this transaction again.');
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: binding.address, ...(tx.to ? { to: tx.to } : {}), data: tx.data, value: tx.value, gas: tx.gas, chainId: '0x279f' }] });
  if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Wallet did not return a transaction hash. Check wallet activity before retrying.');
  return hash as Hex;
}
