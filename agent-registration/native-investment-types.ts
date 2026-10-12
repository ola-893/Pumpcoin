import { parseAbi, type Address, type Hex } from 'viem';
export const nativeGatewayAbi = parseAbi([
 'function depositMON(uint256 minQuote,uint256 minShares,uint256 deadline) payable returns(uint256 assets,uint256 shares)',
 'function redeemMON(uint256 shares,uint256 minQuote,uint256 minMON,uint256 deadline) returns(uint256 assets,uint256 mon)',
 'function minimumOutput(address tokenIn,uint256 amount) view returns(uint256)',
 'function vault() view returns(address)', 'function quote() view returns(address)', 'function wrappedMON() view returns(address)',
 'function poolManager() view returns(address)', 'function source() view returns(address)', 'function fee() view returns(uint24)',
 'function tickSpacing() view returns(int24)', 'function slippageBps() view returns(uint16)', 'function poolId() view returns(bytes32)',
]);
export const nativeShareAbi = parseAbi(['function approve(address,uint256) returns(bool)', 'function allowance(address,address) view returns(uint256)', 'function previewRedeem(uint256) view returns(uint256)']);
export type NativeAction = 'deploy-native' | 'deposit-mon' | 'approve-native-exit' | 'redeem-mon';
export type NativeAuthorization = { action: Exclude<NativeAction,'deploy-native'>; gateway: Address; vault: Address; amount: string; minQuote: string; minOutput: string; deadline: number };
export type NativePlan = { id: Hex; action: NativeAction; chainId: number; from: Address; to?: Address; data: Hex; value: Hex; gas: Hex; estimatedFee: string; native?: NativeAuthorization; quote: {expiresAt:number}; quoteAssets?: string; output?: string; scope: string };
export type NativeState = { ready: boolean; blockers: string[]; vault: Address; gateway?: Address; controller: Address; blockNumber: string; checkedAt: string; nativeBalance?: string; shares?: string; maxRedeem?: string; allowance?: string; nav?: string };
