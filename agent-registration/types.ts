import type { Hex } from 'viem';
import type { Challenge, Prepared } from './core.js';
export type Proposal = { action: 'HOLD' | 'BUY' | 'SELL'; quoteUnits: string };
export type PaperInput = { fresh: boolean; valued: boolean; positionQuoteUnits: string; cashQuoteUnits: string };
export type WorkerReceipt = { version: string; mode: string; evidence: string; model: string; weightsDigest: string; runtimeDigest: string; checkedAt: string; input: PaperInput; rawProposal: Proposal; guardedProposal: Proposal; receiptHash: Hex; scope: string; scenarios?: { id: string; input: PaperInput; rawProposal: Proposal; guardedProposal: Proposal }[]; guardChallenges?: { id: string; input: PaperInput; proposal: Proposal; expected: Proposal; result: Proposal }[] };
export type BindingReceipt = { status: string; chainId: number; mode: string; vault: string; identityRegistry: string; agentId: string; blockNumber: string; blockHash: Hex; configHash: Hex; checkedAt: string; investmentEligible: boolean; evidence: string; scope: string; deploymentTransaction?: Hex; tradingReady?: false; instantTestnetDemo?: true; configurationNoticeSeconds?: number };
export type RegistrationRecord = { version: 'PUMPCOIN-LOCAL-REGISTRATION-v1'; id: Hex; localAgentId: Hex; registeredAt: string; manifest: Prepared['manifest']; commitment: Hex; authorization: { challenge: Challenge; controllerSignature: Hex; executionSignature: Hex }; worker: WorkerReceipt; binding?: BindingReceipt; status: 'registered-locally-vault-pending' | 'registered-locally-binding-checked'; investmentEligible: false };

export type TradeAction='deploy-valuation-guard'|'checkpoint-valuation'|'update-prices'|'update-mon-price'|'deploy'|'propose'|'apply'|'unpause'|'pause'|'approve-deposit'|'deposit'|'approve-redeem'|'redeem'|'buy'|'sell';

export type TradingQuote = { tokenIn: string; tokenOut: string; amountIn: string; expectedOutput: string; minimumOutput: string; oracleMinimumOutput: string; slippageBps: number; blockNumber: string; blockHash: Hex; checkedAt: string; expiresAt: number };


export type RuntimeStatus = {
  configured: boolean; running: boolean; state: 'unconfigured' | 'stopped' | 'starting' | 'stopping' | 'error' | WorkerObservationState;
  changedAt: string; observedAt?: string; transactionHash?: Hex; message: string;
};

export type LiveVaultObservation = {
  chainId: 10143; vault: string; blockNumber: string; blockHash: Hex; checkedAt: string;
  controller: string; manager: string; paused: boolean; configHash: Hex; cash: string; position: string; positionDecimals: number;
  shares: string; shareDecimals: number; nav?: string; permissionSupported: boolean;
  quote: { address: string; decimals: number; symbol: string }; positionToken: { address: string; decimals: number; symbol: string };
  valuation: { source: string; available: boolean; reason?: string };
  mandate: { perTradeQuoteUnits: string; maxPositionQuoteUnits: string; expenseBudget: string; configurationNoticeSeconds: string };
  identity: { strategyHash: Hex; riskHash: Hex; strategyMatchesDeclaration: boolean; riskMatchesDeclaration: boolean; mandateMatchesDeclaration: boolean; publishedManifestURI: string; registry: string; agentId: string; owner: string; ownerMatchesDeclaration: boolean; manifestMatchesDeclaration: boolean; bindingMatchesRecord: boolean; controllerMatchesDeclaration: boolean; managerMatchesDeclaration: boolean };
  activity: { trades: number; deposits: number; withdrawals: number; depositedQuoteUnits: string; withdrawnQuoteUnits: string };
  permission?: { active: boolean; validUntil: string; dailyQuoteCap: string; dailyQuoteTraded: string };
  history: { fromBlock: string; toBlock: string; transactionLimit: number; deploymentBlock?: string; completePerformanceHistory: boolean };
  transactions: { hash: Hex; blockNumber: string; blockHash: Hex; sender: string; status: 'success' | 'reverted'; events: { name: string; values: Record<string, unknown> }[] }[];
};

export type WorkerObservationState = 'pending' | 'confirming' | 'success' | 'reverted' | 'submitted' | 'hold' | 'blocked' | 'budget';
export type WorkerObservation = { state: WorkerObservationState; hash?: Hex; reason?: string; budgetReason?: 'cooldown' | 'daily-limit' | 'gas-reserve' | 'fee-cap' };

export type AgentState = {
  registrationId: Hex; manifestCommitment: Hex; vault?: string; checkedAt: string;
  cache?: { refreshing: boolean; refreshError?: string }; observation?: LiveVaultObservation; chainError?: string; runtime?: RuntimeStatus; runtimeError?: string;
};
