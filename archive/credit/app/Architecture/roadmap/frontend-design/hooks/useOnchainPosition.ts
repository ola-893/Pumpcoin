import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import {
  ATTESTATION_REGISTRY_ABI,
  CREDIT_LINE_ABI,
  ERC20_ABI,
  PROTOCOL_ADDRESSES,
  REPAYMENT_VAULT_ABI,
  DATA_SOURCE_TYPES,
  TIER_NAMES,
  fromUnits,
} from '@/lib/onchain';

/**
 * The connected wallet's REAL position, read from the deployed ProofLine contracts.
 *
 * This replaces the mock wallet: whatever the dashboard shows is what the chain says.
 * A wallet that has done nothing reads as a wallet that has done nothing — empty state,
 * no phantom loan. The `?state=` demo override still exists for pitch screenshots
 * (lib/position.ts), but the default view is the honest, live one.
 *
 * All reads are against the Monad testnet addresses in lib/onchain.ts.
 */

export interface OnchainCredential {
  source: string;
  tier: string;
  tierLevel: number;
  issuedAt: Date;
  expiresAt: Date;
  expired: boolean;
}

export interface OnchainPosition {
  /** pCOL locked in CreditLine as collateral. */
  collateral: number;
  /** Outstanding pUSD debt in CreditLine. */
  debt: number;
  /** Total allowed debt at the wallet's current LTV (collateral × ltvBps). */
  creditLimit: number;
  /** Headroom under the limit, also capped by pool liquidity. */
  availableToBorrow: number;
  /** Current LTV in percent: 50 (base) or 80 (Tier 2+ payment credential). */
  ltv: number;
  /** pUSD balance outside the interface. */
  loanTokenBalance: number;
  /** pCOL balance outside the protocol. */
  collateralTokenBalance: number;
  /** pUSD parked in RepaymentVault for delegated auto-repay. */
  vaultBudget: number;
  /** Null when the wallet holds no active attestation. */
  credential: OnchainCredential | null;
}

/** One multicall: 5 CreditLine reads + 2 balances + 1 vault + 1 attestation. */
export function useOnchainPosition(address: `0x${string}` | undefined): {
  position: OnchainPosition | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useReadContracts({
    allowFailure: false,
    query: {
      enabled: !!address,
      // Same policy as Web3Provider: don't hammer the public RPC.
      staleTime: 15_000,
    },
    contracts: [
      // CreditLine position
      { address: PROTOCOL_ADDRESSES.creditLine, abi: CREDIT_LINE_ABI, functionName: 'collateralOf', args: [address!] },
      { address: PROTOCOL_ADDRESSES.creditLine, abi: CREDIT_LINE_ABI, functionName: 'borrowedOf', args: [address!] },
      { address: PROTOCOL_ADDRESSES.creditLine, abi: CREDIT_LINE_ABI, functionName: 'maxBorrow', args: [address!] },
      { address: PROTOCOL_ADDRESSES.creditLine, abi: CREDIT_LINE_ABI, functionName: 'availableToBorrow', args: [address!] },
      { address: PROTOCOL_ADDRESSES.creditLine, abi: CREDIT_LINE_ABI, functionName: 'ltvBps', args: [address!] },
      // Wallet token balances
      { address: PROTOCOL_ADDRESSES.loanToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [address!] },
      { address: PROTOCOL_ADDRESSES.collateralToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [address!] },
      // RepaymentVault budget
      { address: PROTOCOL_ADDRESSES.repaymentVault, abi: REPAYMENT_VAULT_ABI, functionName: 'borrowerBalance', args: [address!] },
      {
        address: PROTOCOL_ADDRESSES.attestationRegistry,
        abi: ATTESTATION_REGISTRY_ABI,
        functionName: 'attestations',
        args: [address!],
      },
    ],
  });

  const position = useMemo(() => {
    if (!address || !data) return null;

    const [
      collateralUnits,
      borrowedUnits,
      maxBorrowUnits,
      availableUnits,
      ltvBps,
      loanBalanceUnits,
      collateralBalanceUnits,
      vaultBudgetUnits,
      attestation,
    ] = data;

    const [source, tier, issuedAt, expiresAt] = (attestation ?? [0, 0, 0n, 0n]) as unknown as readonly [
      number,
      number,
      bigint,
      bigint,
    ];

    const credential: OnchainCredential | null =
      tier > 0
        ? {
            source: DATA_SOURCE_TYPES[source] ?? 'payment-processor',
            tier: TIER_NAMES[tier] ?? 'None',
            tierLevel: tier,
            issuedAt: new Date(Number(issuedAt) * 1000),
            expiresAt: new Date(Number(expiresAt) * 1000),
            // Expiry relative to when the chain data was actually read — pure, and more
            // honest than wall-clock at render time.
            expired: dataUpdatedAt > 0 && Number(expiresAt) * 1000 < dataUpdatedAt,
          }
        : null;

    return {
      collateral: fromUnits(collateralUnits as bigint),
      debt: fromUnits(borrowedUnits as bigint),
      creditLimit: fromUnits(maxBorrowUnits as bigint),
      availableToBorrow: fromUnits(availableUnits as bigint),
      ltv: Number(ltvBps ?? 0n) / 100,
      loanTokenBalance: fromUnits(loanBalanceUnits as bigint),
      collateralTokenBalance: fromUnits(collateralBalanceUnits as bigint),
      vaultBudget: fromUnits(vaultBudgetUnits as bigint),
      credential,
    };
  }, [address, data, dataUpdatedAt]);

  return { position, isLoading, isError, refetch };
}
