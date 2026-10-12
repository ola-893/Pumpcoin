import { getAddress, keccak256, recoverMessageAddress, stringToHex, type Hex } from 'viem';
import { prepareManifest, validateDraft, type AgentDraft } from '../app/src/lib/registration.js';
export type Prepared = ReturnType<typeof prepareManifest>;
export type Challenge = { id: string; origin: string; chainId: number; commitment: Hex; runtimeConfigHash: Hex; controller: string; executionKey: string; expiresAt: number };
export function checkedPrepared(value: unknown): Prepared {
  const x = value as Prepared;
  if (!x || typeof x !== 'object' || Object.keys(x).sort().join(',') !== 'commitment,manifest,privateRuntimeConfig' || JSON.stringify(x).length > 65536) throw new Error('Invalid deployment declaration.');
  const m = x.manifest;
  if (!m || m.version !== 'PUMPCOIN-DEPLOYMENT-DRAFT-v1' || m.inferencePolicy !== 'PUMPCOIN-SELF-HOSTED-v1' || m.evidenceLevel !== 'operator-declared' || m.registrationStatus !== 'unpublished-draft') throw new Error('Unsupported deployment declaration.');
  if (keccak256(stringToHex(JSON.stringify(m))) !== x.commitment) throw new Error('Manifest commitment does not match its contents.');
  if (!m.model || !m.strategy || !m.proposedMandate || !Array.isArray(m.dependencies) || !m.dependencies.every(d => typeof d === 'string' && d.length <= 1000)) throw new Error('Invalid manifest fields.');
  const units = (v: string) => { if (typeof v !== 'string' || !/^[1-9]\d{0,18}$/.test(v)) throw new Error('Invalid quote units.'); const n = BigInt(v); return `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, '0')}`; };
  const digest = (v: string) => { if (typeof v !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(v)) throw new Error('Invalid artifact digest.'); return v.slice(7); };
  if (m.proposedMandate.quoteDecimals !== 6 || m.proposedMandate.leverage !== false) throw new Error('Only six-decimal, unleveraged spot declarations are supported.');
  const d: AgentDraft = { name: m.name, controller: m.controller, executionKey: m.executionKey, model: m.model.id, modelSource: m.model.source, weightsHash: digest(m.model.weightsDigest), runtimeHash: digest(m.model.runtimeDigest), endpoint: x.privateRuntimeConfig?.inferenceBaseURL, strategy: m.strategy.description, strategyCodeHash: digest(m.strategy.codeDigest), pair: m.strategy.pair, tradeCap: units(m.proposedMandate.perTradeQuoteUnits), exposureCap: units(m.proposedMandate.maxPositionQuoteUnits), slippageBps: String(m.proposedMandate.slippageBps), dependencies: m.dependencies.join('; '), selfHosted: true };
  if (Object.keys(validateDraft(d)).length) throw new Error('Complete valid deployment requirements before registration.');
  const endpoint = new URL(d.endpoint);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || !['/', '/v1', '/v1/'].includes(endpoint.pathname)) throw new Error('Registration requires a literal loopback HTTP llama-server endpoint.');
  if (getAddress(m.controller) !== m.controller || getAddress(m.executionKey) !== m.executionKey) throw new Error('Use canonical wallet addresses.');
  return structuredClone(x);
}
export function runtimeConfigHash(x: Prepared): Hex { return keccak256(stringToHex(JSON.stringify(x.privateRuntimeConfig))); }
export function authorizationMessage(c: Challenge, role: 'controller' | 'execution'): string {
  return ['PumpCoin local agent registration v1', `Role: ${role}`, `Origin: ${c.origin}`, `Chain ID: ${c.chainId}`, `Session nonce: ${c.id}`, `Manifest: ${c.commitment}`, `Private configuration commitment: ${c.runtimeConfigHash}`, `Controller: ${c.controller}`, `Execution key: ${c.executionKey}`, `Expires: ${new Date(c.expiresAt).toISOString()}`, 'Scope: register this declaration locally. No transfers, approvals, trading authority or proof of performance.'].join('\n');
}
export async function checkAuthorizations(c: Challenge, controllerSignature: Hex, executionSignature: Hex, now = Date.now()): Promise<void> {
  if (now >= c.expiresAt) throw new Error('Registration session expired. Start again.');
  for (const [role, address, signature] of [['controller', c.controller, controllerSignature], ['execution', c.executionKey, executionSignature]] as const) {
    if (typeof signature !== 'string' || !/^0x[a-f0-9]{130}$/i.test(signature)) throw new Error(`Invalid ${role} signature.`);
    const recovered = await recoverMessageAddress({ message: authorizationMessage(c, role), signature });
    if (recovered.toLowerCase() !== address.toLowerCase()) throw new Error(`The ${role} signature does not authorize this declaration.`);
  }
}
export function strategyBindingHash(x: Prepared): Hex { return keccak256(stringToHex(x.manifest.strategy.codeDigest)); }
export function riskBindingHash(x: Prepared): Hex { return keccak256(stringToHex(JSON.stringify(x.manifest.proposedMandate))); }
