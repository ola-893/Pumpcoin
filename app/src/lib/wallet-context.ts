import { createContext, useContext } from 'react';
import type { Provider, WalletBinding, VaultWalletTransaction, TradingWalletTransaction } from './wallet-core.js';
export type Choice = { id: string; name: string; provider: Provider };
export type WalletState = {
  binding?: WalletBinding; busy: boolean; error: string; choices: Choice[];
  connectBrowser(choice: Choice): Promise<void>; connectMera(create: boolean): Promise<void>;
  sendTradingTransaction(transaction: TradingWalletTransaction): Promise<`0x${string}`>;
  sendVaultTransaction(transaction: VaultWalletTransaction): Promise<`0x${string}`>;
  disconnect(): void; switchTestnet(): Promise<void>; sign(message: string): Promise<`0x${string}`>;
};
export const Context = createContext<WalletState | undefined>(undefined);
export function useWallet() { const value = useContext(Context); if (!value) throw new Error('Missing wallet provider.'); return value; }
