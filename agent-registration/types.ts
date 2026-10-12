import type { Hex } from 'viem';
import type { Challenge, Prepared } from './core.js';
export type Proposal = { action: 'HOLD' | 'BUY' | 'SELL'; quoteUnits: string };
export type PaperInput = { fresh: boolean; valued: boolean; positionQuoteUnits: string; cashQuoteUnits: string };
export type WorkerReceipt = { version: string; mode: string; evidence: string; model: string; weightsDigest: string; runtimeDigest: string; checkedAt: string; input: PaperInput; rawProposal: Proposal; guardedProposal: Proposal; receiptHash: Hex; scope: string };
export type BindingReceipt = { status: string; chainId: number; mode: string; vault: string; identityRegistry: string; agentId: string; blockNumber: string; blockHash: Hex; configHash: Hex; checkedAt: string; investmentEligible: boolean; evidence: string; scope: string; deploymentTransaction?: Hex; tradingReady?: false };
export type RegistrationRecord = { version: 'PUMPCOIN-LOCAL-REGISTRATION-v1'; id: Hex; localAgentId: Hex; registeredAt: string; manifest: Prepared['manifest']; commitment: Hex; authorization: { challenge: Challenge; controllerSignature: Hex; executionSignature: Hex }; worker: WorkerReceipt; binding?: BindingReceipt; status: 'registered-locally-vault-pending' | 'registered-locally-binding-checked'; investmentEligible: false };

export type TradeAction='update-prices'|'deploy'|'propose'|'apply'|'unpause'|'pause'|'approve-deposit'|'deposit'|'approve-redeem'|'redeem'|'buy'|'sell';
