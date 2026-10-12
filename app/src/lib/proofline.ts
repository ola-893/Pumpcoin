import { keccak256, stringToHex, isAddress, type Hex } from 'viem';
import type { DemoEvidence } from './evidence.js';
import { PROOFLINE_CHAIN_ID, type WalletBinding } from './wallet-core.js';

export type PerformanceScope = ReturnType<typeof performanceScope>;
export function performanceScope(data: DemoEvidence, source: string) {
  const c = data.bundle.coverage;
  return { agent: 'local-vault-demonstrator', environment: 'simulation' as const,
    evidenceChainId: c.chainId, vault: c.vault.toLowerCase(), manager: data.manager.toLowerCase(),
    configHash: data.configHash, strategyHash: data.strategyHash,
    fromBlock: c.fromBlock, toBlock: c.toBlock, bundleHash: keccak256(stringToHex(source)),
    accounting: 'archive-reconciled-not-independently-verified' as const };
}
export function createOwnershipChallenge(binding: WalletBinding, scope: PerformanceScope, origin: string, now: number, nonce: string) {
  if (binding.chainId !== PROOFLINE_CHAIN_ID || !isAddress(binding.address) || !/^[a-f\d]{64}$/i.test(nonce) || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid ownership check.');
  const url = new URL(origin); if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid application origin.');
  return JSON.stringify({ domain: 'pumpcoin:proofline:ownership-check:v1', purpose: 'Read-only evidence review. No trading, spending, registration or vault authority.',
    origin, subject: binding.address.toLowerCase(), walletChainId: PROOFLINE_CHAIN_ID,
    nonce, createdAt: now, expiresAt: now + 300, evidence: scope });
}
export function validateOwnershipChallenge(message: string, binding: WalletBinding, scope: PerformanceScope, origin: string, now: number) {
  const value = JSON.parse(message);
  if (!Number.isSafeInteger(value.createdAt) || value.createdAt > now || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now || value.expiresAt !== value.createdAt + 300 ||
    message !== createOwnershipChallenge(binding, scope, origin, value.createdAt, value.nonce)) throw new Error('Ownership check expired or its wallet/evidence binding changed.');
  return value as { expiresAt: number };
}
export type OwnershipReceipt = { version: 'PUMPCOIN-WALLET-OWNERSHIP-v1'; message: string; signature: Hex; checkedAt: number; evidenceLevel: 'signature-verified'; authority: 'none'; performanceVerification: 'archive-reconciled-not-independently-verified' };
