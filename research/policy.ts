import { recoverMessageAddress, type Hex } from 'viem';
import { digest, integer } from './encoding.js';
import type { Policy, PolicyChallenge, SignedPolicy, Strategy } from './types.js';
export const STRATEGIES: Strategy[] = ['market-news', 'multi-kol'];
export function validatePolicy(value: unknown, registrationId: Hex, commitment: Hex): Policy {
  const p = value as Policy;
  if (!p || p.version !== 'PUMPCOIN-RESEARCH-POLICY-v1' || p.registrationId !== registrationId || p.manifestCommitment !== commitment || p.engineVersion !== 'pump-research-spot-v1' || p.promptVersion !== 'pump-research-v1') throw new Error('Research policy does not match this agent or engine.');
  const fields = ['version','registrationId','manifestCommitment','strategies','symbols','voices','newsFeeds','initialCash','riskBps','positionBps','exposureBps','stopBps','targetBps','dailyLossBps','maxPositions','convergence','maxAgeSeconds','intervalSeconds','cooldownSeconds','feeBps','slippageBps','executionDelaySeconds','maxHoldingSeconds','engineVersion','promptVersion','engineDigest'];
  if(typeof p.engineDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(p.engineDigest))throw new Error('Research engine artifact commitment is required.');
  if (Object.keys(p).sort().join() !== fields.sort().join()) throw new Error('Unexpected research policy fields.');
  if (!Array.isArray(p.strategies) || !p.strategies.length || p.strategies.length > 2 || new Set(p.strategies).size !== p.strategies.length || p.strategies.some(x => !STRATEGIES.includes(x))) throw new Error('Select valid research strategies.');
  if (!Array.isArray(p.symbols) || !p.symbols.length || p.symbols.length > 10 || new Set(p.symbols).size !== p.symbols.length || p.symbols.some(x => !/^[A-Z0-9]{2,15}$/.test(x))) throw new Error('Provide one to ten unique market symbols.');
  if (!Array.isArray(p.voices) || p.voices.length > 20 || new Set(p.voices).size !== p.voices.length || p.voices.some(x => !/^\d{1,24}$/.test(x))) throw new Error('Select at most twenty unique X account IDs.');
  if (!Array.isArray(p.newsFeeds) || p.newsFeeds.length > 5 || new Set(p.newsFeeds).size !== p.newsFeeds.length || p.newsFeeds.some(x => { try { const u = new URL(x); return u.protocol !== 'https:' || !!u.username || !!u.password || !!u.hash || u.hostname === 'localhost' || /^[\d:[\]]+$/.test(u.hostname); } catch { return true; } })) throw new Error('Provide up to five HTTPS news feeds.');
  if (integer(p.initialCash) <= 0n || integer(p.initialCash) > 1000000000000000n) throw new Error('Invalid initial virtual capital.');
  for (const [key,min,max] of [['riskBps',1,1000],['positionBps',1,10000],['exposureBps',1,10000],['stopBps',1,5000],['targetBps',1,50000],['dailyLossBps',1,10000],['maxPositions',1,10],['convergence',2,20],['maxAgeSeconds',30,86400],['intervalSeconds',30,86400],['cooldownSeconds',0,86400],['feeBps',0,1000],['slippageBps',0,1000],['executionDelaySeconds',1,3600],['maxHoldingSeconds',60,2592000]] as const) {
    const n = p[key]; if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Invalid ${key} research limit.`);
  }
  if (p.positionBps > p.exposureBps) throw new Error('Position cap exceeds portfolio exposure cap.');
  if (p.executionDelaySeconds >= p.maxAgeSeconds) throw new Error('Execution delay must be shorter than the order expiry/freshness window.');
  return structuredClone(p);
}
export function policyMessage(c: PolicyChallenge, role: 'controller' | 'execution'): string {
  return ['PumpCoin research authorization v1', `Role: ${role}`, `Origin: ${c.origin}`, `Nonce: ${c.id}`, `Registration: ${c.policy.registrationId}`, `Manifest: ${c.policy.manifestCommitment}`, `Policy: ${c.hash}`, `Controller: ${c.controller}`, `Execution: ${c.executionKey}`, `Expires: ${new Date(c.expiresAt).toISOString()}`, 'Scope: practice research and signed evidence only. No token transfers, approvals, funded trading, or proof of profitability.'].join('\n');
}
export async function verifyPolicy(p: SignedPolicy) {
  validatePolicy(p.policy, p.policy.registrationId, p.policy.manifestCommitment);
  if (digest(p.policy) !== p.hash || !/^0x[a-f0-9]{64}$/.test(p.id) || !Number.isSafeInteger(p.expiresAt) || !Number.isFinite(Date.parse(p.createdAt)) || Date.parse(p.createdAt) >= p.expiresAt || Date.parse(p.createdAt) < p.expiresAt - 600000) throw new Error('Invalid signed research policy.');
  for (const role of ['controller','execution'] as const) {
    const address = await recoverMessageAddress({ message: policyMessage(p, role), signature: role === 'controller' ? p.controllerSignature : p.executionSignature });
    if (address.toLowerCase() !== (role === 'controller' ? p.controller : p.executionKey).toLowerCase()) throw new Error('Invalid research authorization signature.');
  }
}
export const receiptMessage = (hash: Hex) => `PumpCoin practice decision v1\nCommitment: ${hash}\nScope: operator assertion; practice only; no execution attestation.`;
export const checkpointMessage = (hash: Hex) => `PumpCoin practice checkpoint v1\nCommitment: ${hash}\nScope: published practice history; no funded performance or host attestation.`;
