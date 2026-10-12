import { monadTestnet } from 'viem/chains';

/**
 * Unora runs on Monad Testnet.
 *
 * We re-export viem's own `monadTestnet` definition rather than hand-rolling a
 * `defineChain` call, so the RPC URL and chain metadata stay in sync with viem
 * upgrades. Confirmed values (Monad docs + viem source, Sept 2026):
 *
 *   chain ID   10143 (0x279f)
 *   currency   MON
 *   RPC        https://testnet-rpc.monad.xyz
 *   explorer   https://testnet.monadexplorer.com
 *
 * Note: Monad reset this testnet from genesis on 2025-12-16, so anything
 * deployed or funded before that date is gone.
 */
export { monadTestnet };

export const MONAD_TESTNET = {
  chainId: monadTestnet.id,
  hexChainId: `0x${monadTestnet.id.toString(16)}`,
  name: monadTestnet.name,
  currencySymbol: monadTestnet.nativeCurrency.symbol,
  rpcUrl: monadTestnet.rpcUrls.default.http[0],
  explorerUrl: monadTestnet.blockExplorers.default.url,
  faucetUrl: 'https://faucet.monad.xyz',
} as const;

/** True when the given chain ID is Monad Testnet. Use to gate "wrong network" UI. */
export function isMonadTestnet(chainId: number | undefined): boolean {
  return chainId === monadTestnet.id;
}

/** Shorten an address for display: 0x1234...abcd */
export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/** Build an explorer link for a transaction hash. */
export function explorerTxUrl(hash: string): string {
  return `${MONAD_TESTNET.explorerUrl}/tx/${hash}`;
}

/** Build an explorer link for an address. */
export function explorerAddressUrl(address: string): string {
  return `${MONAD_TESTNET.explorerUrl}/address/${address}`;
}
