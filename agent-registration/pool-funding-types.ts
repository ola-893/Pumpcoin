import type { Address, Hex } from 'viem';
export type PoolFundingAction = 'deploy-pool-funder' | 'approve-pool-funding' | 'seed-pool' | 'remove-pool-liquidity';
export type PoolFundingAuthorization = { funder: Address; liquidity: string; lower: number; upper: number; maxQuote: string; deadline: number };
export type PoolFundingPlan = { id: Hex; action: PoolFundingAction; chainId: number; from: Address; to?: Address; data: Hex; value: Hex; gas: Hex; estimatedFee: string; quote: {expiresAt: number}; funding?: PoolFundingAuthorization; scope: string; range?: { minimumMonPrice: number; maximumMonPrice: number }; };
export type PoolFundingState = { maximumQuoteFunding: string; maximumMonFunding: string; minimumQuoteLiquidity: string; controller: Address; funder?: Address; liquidity: string; allowance: string; quoteBalance: string; nativeBalance: string; referencePrice?: string; source?: Address; blockNumber: string; tickLower?: number; tickUpper?: number; };
