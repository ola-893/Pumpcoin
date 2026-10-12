import type { Hex } from 'viem';
import type { Challenge, Prepared } from './core.js';
export type Proposal = { action: 'HOLD' | 'BUY' | 'SELL'; quoteUnits: string };
export type PaperInput = { fresh: boolean; valued: boolean; positionQuoteUnits: string; cashQuoteUnits: string };
export type WorkerReceipt = { version: string; mode: string; evidence: string; model: string; weightsDigest: string; runtimeDigest: string; checkedAt: string; input: PaperInput; rawProposal: Proposal; guardedProposal: Proposal; receiptHash: Hex; scope: string };
export type BindingReceipt = { status: string; chainId: number; mode: string; vault: string; identityRegistry: string; agentId: string; blockNumber: string; blockHash: Hex; configHash: Hex; checkedAt: string; investmentEligible: boolean; evidence: string; scope: string; deploymentTransaction?: Hex; tradingReady?: false; instantTestnetDemo?: true; configurationNoticeSeconds?: number };
export type RegistrationRecord = { version: 'PUMPCOIN-LOCAL-REGISTRATION-v1'; id: Hex; localAgentId: Hex; registeredAt: string; manifest: Prepared['manifest']; commitment: Hex; authorization: { challenge: Challenge; controllerSignature: Hex; executionSignature: Hex }; worker: WorkerReceipt; binding?: BindingReceipt; status: 'registered-locally-vault-pending' | 'registered-locally-binding-checked'; investmentEligible: false };

export type TradeAction='update-prices'|'update-mon-price'|'deploy'|'propose'|'apply'|'unpause'|'pause'|'approve-deposit'|'deposit'|'approve-redeem'|'redeem'|'buy'|'sell';

export type TradingQuote = { tokenIn: string; tokenOut: string; amountIn: string; expectedOutput: string; minimumOutput: string; oracleMinimumOutput: string; slippageBps: number; blockNumber: string; blockHash: Hex; checkedAt: string; expiresAt: number };


export type RuntimeStatus = {
  configured: boolean; running: boolean; state: 'unconfigured' | 'stopped' | 'starting' | 'stopping' | 'error' | WorkerObservationState;
  changedAt: string; observedAt?: string; transactionHash?: Hex; message: string;
};

export type LiveVaultObservation = {
  chainId: 10143; vault: string; blockNumber: string; blockHash: Hex; checkedAt: string;
  controller: string; manager: string; paused: boolean; configHash: Hex; cash: string; position: string; positionDecimals: number;
  shares: string; shareDecimals: number; nav?: string; permissionSupported: boolean;
  permission?: { active: boolean; validUntil: string; dailyQuoteCap: string; dailyQuoteTraded: string };
  history: { fromBlock: string; toBlock: string; transactionLimit: number; completePerformanceHistory: false };
  transactions: { hash: Hex; blockNumber: string; blockHash: Hex; sender: string; status: 'success' | 'reverted'; events: { name: string; values: Record<string, unknown> }[] }[];
};

export type WorkerObservationState = 'pending' | 'confirming' | 'success' | 'reverted' | 'submitted' | 'hold' | 'blocked';
export type WorkerObservation = { state: WorkerObservationState; hash?: Hex; reason?: string };
