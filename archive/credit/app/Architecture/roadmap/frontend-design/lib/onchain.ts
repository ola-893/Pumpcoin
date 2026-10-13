/**
 * The deployed ProofLine contracts on Monad testnet — the real backend this app reads.
 *
 * Addresses come from `deployments/monad-testnet.json` at the repo root, which the
 * deploy script writes. Everything a wallet owns — collateral, debt, borrowing terms,
 * repayment budget — lives on these five addresses, so the dashboard's mock wallet has
 * been replaced by reads against them.
 *
 * What these contracts are (and are not): ProofLine is the credit-plumbing demo —
 * tiered LTV, delegated repayment, oracle rotation. There is no interest accrual, no
 * price feed, and no pool of markets yet. Where a page needs the Unora product (markets,
 * sponsor graph, score ladder), it says so honestly instead of inventing numbers.
 */

import { parseAbi, formatUnits } from 'viem';
import { explorerAddressUrl } from './chains';

/** Parsed from deployments/monad-testnet.json — chainId 10143 (Monad Testnet). */
export const PROTOCOL_ADDRESSES = {
  collateralToken: '0x8DA26C2b004f5962c0846f57d193de12f2F62612' as const,
  loanToken: '0x62E0EC7483E779DA0fCa9B701872e4af8a0FEd87' as const,
  attestationRegistry: '0x7Da0baBc8F5690A61f8FC63Df40aA5aF7eb33F75' as const,
  creditLine: '0xe91EF9C06aDD6b030bfb22cbf7dfF51904DEaC10' as const,
  repaymentVault: '0x092C790d51CBf208a47edaB20d1e9c4C73737081' as const,
} as const;

/** Minimal read ABI for the erc20s the protocol uses (both are 6-decimal DemoTokens). */
export const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

/** DemoToken is freely mintable — the faucet for demo collateral and loan tokens. */
export const DEMO_TOKEN_ABI = parseAbi(['function mint(address to, uint256 amount)']);

export const CREDIT_LINE_ABI = parseAbi([
  'function collateralOf(address) view returns (uint256)',
  'function borrowedOf(address) view returns (uint256)',
  'function maxBorrow(address) view returns (uint256)',
  'function availableToBorrow(address) view returns (uint256)',
  'function ltvBps(address) view returns (uint256)',
  'function loanToken() view returns (address)',
  'function deposit(uint256)',
  'function borrow(uint256)',
  'function repay(uint256)',
]);

export const ATTESTATION_REGISTRY_ABI = parseAbi([
  'function attestations(address) view returns (uint8 sourceType, uint8 tier, uint64 issuedAt, uint64 expiresAt, bytes32 proofHash)',
  'function isValid(address, uint8, uint8) view returns (bool)',
]);

export const REPAYMENT_VAULT_ABI = parseAbi([
  'function borrowerBalance(address) view returns (uint256)',
]);

/** Enum mirrors of the onchain enums (solidity 0.8.24 / AttestationRegistry.sol). */
export const DATA_SOURCE_TYPES = ['payment-processor', 'gig-platform', 'remittance'] as const;
export type DataSourceName = (typeof DATA_SOURCE_TYPES)[number];

export const TIER_NAMES = ['None', 'Tier 1', 'Tier 2', 'Tier 3'] as const;
export type TierName = (typeof TIER_NAMES)[number];

/** Both demo tokens are 6-decimal (DemoToken.sol), but read it anyway rather than assume. */
const TOKEN_DECIMALS = 6;

export function toUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** TOKEN_DECIMALS));
}

export function fromUnits(units: bigint | undefined): number {
  if (units === undefined) return 0;
  return Number(formatUnits(units, TOKEN_DECIMALS));
}

/** Compact USD-style display of a token amount: $1.2k, $12,500, $0. */
export function formatTokenUsd(amount: number, compact = false): string {
  if (!Number.isFinite(amount)) return '—';
  if (compact) {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 10_000) return `$${(amount / 1_000).toFixed(1)}k`;
    if (amount === 0) return '$0';
  }
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** Faucet amount: 1,000 demo tokens per mint, mirroring the backend demo script. */
export const FAUCET_AMOUNT = 1_000;

export function explorerFor(address: string): string {
  return explorerAddressUrl(address);
}
