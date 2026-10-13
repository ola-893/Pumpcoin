import { getAddress, isAddress, parseAbi, formatUnits, parseUnits, type Address } from 'viem';
import manifest from './deployment.json' with { type: 'json' };
import { monadTestnet, explorerAddressUrl } from './chains.js';

// This manifest deliberately retains the legacy manual deployment. Evidence-mode source
// exists in contracts/, but needs fresh deployed addresses and matching UI before use.
if (
  manifest.chainId !== monadTestnet.id ||
  manifest.mode !== 'manual' ||
  !Object.values(manifest.contracts).every((a) => isAddress(a))
) {
  throw new Error('Unsupported deployment configuration');
}
const addresses = Object.fromEntries(
  Object.entries(manifest.contracts).map(([k, v]) => [k, getAddress(v)]),
);
export const PROTOCOL_ADDRESSES = addresses as Record<keyof typeof manifest.contracts, Address>;
export const PROTOCOL_CHAIN_ID = manifest.chainId;
export const DEPLOYMENT_MODE = manifest.mode;
export const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
export const DEMO_TOKEN_ABI = parseAbi(['function mint(address,uint256)']);
export const CREDIT_LINE_ABI = parseAbi([
  'function registry() view returns (address)',
  'function collateralToken() view returns (address)',
  'function loanToken() view returns (address)',
  'function collateralOf(address) view returns (uint256)',
  'function borrowedOf(address) view returns (uint256)',
  'function maxBorrow(address) view returns (uint256)',
  'function availableToBorrow(address) view returns (uint256)',
  'function ltvBps(address) view returns (uint256)',
  'function totalCollateral() view returns (uint256)',
  'function totalBorrowed() view returns (uint256)',
  'function BASE_LTV_BPS() view returns (uint256)',
  'function BOOSTED_LTV_BPS() view returns (uint256)',
  'function deposit(uint256)',
  'function borrow(uint256)',
  'function repay(uint256)',
  'function withdraw(uint256)',
]);
export const ATTESTATION_REGISTRY_ABI = parseAbi([
  'function attestations(address) view returns (uint8 sourceType,uint8 tier,uint64 issuedAt,uint64 expiresAt,bytes32 proofHash)',
  'function isValid(address,uint8,uint8) view returns (bool)',
]);
export const REPAYMENT_VAULT_ABI = parseAbi([
  'function token() view returns (address)',
  'function creditLine() view returns (address)',
  'function borrowerBalance(address) view returns (uint256)',
  'function delegations(address) view returns (address borrower,uint256 tokenBudget,uint256 spentToken,uint64 expiresAt,bool revoked)',
  'function depositBudget(uint256)',
  'function withdrawUnusedBudget(uint256)',
  'function delegate(address,uint256,uint64)',
  'function revoke(address)',
  'function repayOnBehalf(uint256)',
]);
export const TIER_NAMES = ['None', 'Tier 1', 'Tier 2', 'Tier 3'] as const;
export const DATA_SOURCE_TYPES = ['Payment processor', 'Gig platform', 'Remittance'] as const;
export function tokenAmount(units: bigint, decimals: number, symbol = '') {
  const value = formatUnits(units, decimals);
  return `${value}${symbol ? ` ${symbol}` : ''}`;
}
export function parseAmount(value: string, decimals: number): bigint | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || (value.split('.')[1]?.length ?? 0) > decimals)
    return null;
  try {
    const amount = parseUnits(value, decimals);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}
export function explorerFor(address: string) {
  return explorerAddressUrl(address);
}
