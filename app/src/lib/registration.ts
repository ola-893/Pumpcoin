import { detectionMatches, type Detection } from './local-inference.js';
import { getAddress, isAddress, keccak256, stringToHex } from 'viem';

export const LOCAL_POLICY = 'PUMPCOIN-SELF-HOSTED-v1' as const;
export type AgentDraft = {
  name: string; controller: string; executionKey: string; model: string;
  modelSource: string; weightsHash: string; runtimeHash: string; endpoint: string;
  strategy: string; strategyCodeHash: string; pair: string;
  tradeCap: string; exposureCap: string; slippageBps: string; dependencies: string;
  selfHosted: boolean; localDetection?: Detection;
};
export const initialDraft: AgentDraft = {
  name: '', controller: '', executionKey: '', model: '',
  modelSource: '', weightsHash: '', runtimeHash: '',
  endpoint: 'http://127.0.0.1:8080/v1', strategy: '', strategyCodeHash: '',
  pair: 'MON / USDC', tradeCap: '100', exposureCap: '500', slippageBps: '50', dependencies: 'GeckoTerminal; Monad RPC; Uniswap', selfHosted: false,
};
const nonzeroHash = (x: string) => /^(?:0x)?[a-fA-F0-9]{64}$/.test(x) && !/^(?:0x)?0{64}$/.test(x);
const sha = (x: string) => `sha256:${x.replace(/^0x/, '').toLowerCase()}`;
export function localEndpoint(value: string): string {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash)
    throw new Error('Inference must use a loopback endpoint with no credentials, query or fragment.');
  return u.href;
}
export function quoteUnits(value: string): bigint {
  if (!/^(0|[1-9]\d{0,12})(\.\d{1,6})?$/.test(value)) throw new Error('Use a positive amount with at most six decimals.');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (units <= 0n) throw new Error('Amount must be positive.');
  return units;
}
export function validateDraft(d: AgentDraft, step = 3): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim() || d.name.length > 64) errors.name = 'Enter an agent name (1–64 characters).';
  for (const key of ['controller', 'executionKey'] as const) if (!isAddress(d[key]) || /^0x0{40}$/i.test(d[key])) errors[key] = 'Enter a nonzero EVM address.';
  if (!errors.controller && !errors.executionKey && d.controller.toLowerCase() === d.executionKey.toLowerCase()) errors.executionKey = 'Use a dedicated execution key, separate from the controller.';
  if (!d.model.trim() || d.model.length > 100) errors.model = 'Enter the exact model identifier.';
  try { const u = new URL(d.modelSource); if (u.protocol !== 'https:' || u.username || u.password) throw new Error(); } catch { errors.modelSource = 'Enter an HTTPS weights source.'; }
  if (!nonzeroHash(d.weightsHash)) errors.weightsHash = 'Enter the SHA-256 of the exact weights file or weights manifest.';
  if (!nonzeroHash(d.runtimeHash)) errors.runtimeHash = 'Enter the SHA-256 of the runtime artifact or runtime manifest.';
  try { localEndpoint(d.endpoint); } catch { errors.endpoint = 'Hosted inference is not permitted. Use localhost, 127.0.0.1 or ::1.'; }
  if (!d.selfHosted) errors.selfHosted = 'Confirm that inference uses downloaded weights under your control.';
  if (step > 1) {
    if (d.strategy.trim().length < 20 || d.strategy.length > 2000) errors.strategy = 'Describe the public strategy in 20–2,000 characters.';
    if (!nonzeroHash(d.strategyCodeHash)) errors.strategyCodeHash = 'Enter the SHA-256 of the strategy code manifest.';
    if (!['MON / USDC', 'WMON / USDC'].includes(d.pair)) errors.pair = 'Choose one supported proposed spot pair.';
    for (const key of ['tradeCap', 'exposureCap'] as const) try { quoteUnits(d[key]); } catch { errors[key] = 'Enter a positive quote amount, up to six decimals.'; }
    if (!errors.tradeCap && !errors.exposureCap && quoteUnits(d.tradeCap) > quoteUnits(d.exposureCap)) errors.tradeCap = 'The trade cap must not exceed the exposure cap.';
    if (!/^\d{1,3}$/.test(d.slippageBps) || Number(d.slippageBps) < 1 || Number(d.slippageBps) > 500) errors.slippageBps = 'Choose 1–500 basis points.';
    if (!d.dependencies.trim() || d.dependencies.length > 1000) errors.dependencies = 'Declare the external data, RPC and execution services.';
  }
  return errors;
}
// Local measurements are evidence about operator-controlled files, not admission or runtime attestation.
export function prepareManifest(d: AgentDraft) {
  if (Object.keys(validateDraft(d)).length) throw new Error('Complete the local-only deployment requirements.');
  const manifest = {
    version: 'PUMPCOIN-DEPLOYMENT-DRAFT-v1', inferencePolicy: LOCAL_POLICY,
    evidenceLevel: 'operator-declared', registrationStatus: 'unpublished-draft',
    name: d.name.trim(), controller: getAddress(d.controller), executionKey: getAddress(d.executionKey),
    model: { id: d.model.trim(), source: new URL(d.modelSource).href, weightsDigest: sha(d.weightsHash), runtimeDigest: sha(d.runtimeHash), ...(detectionMatches(d) ? { localMeasurements: { evidence: 'locally-detected-not-attested', checkedAt: d.localDetection!.checkedAt, quantization: d.localDetection!.quantization, context: d.localDetection!.context, weightsBytes: d.localDetection!.weightsBytes, sourceStatus: d.localDetection!.sourceStatus, runtimeManifest: d.localDetection!.runtimeManifest } } : {}) },
    strategy: { description: d.strategy.trim(), codeDigest: sha(d.strategyCodeHash), pair: d.pair },
    proposedMandate: { quoteDecimals: 6, perTradeQuoteUnits: quoteUnits(d.tradeCap).toString(), maxPositionQuoteUnits: quoteUnits(d.exposureCap).toString(), slippageBps: Number(d.slippageBps), leverage: false },
    dependencies: d.dependencies.split(/[;\n]/).map(x => x.trim()).filter(Boolean),
  };
  return { manifest, commitment: keccak256(stringToHex(JSON.stringify(manifest))), privateRuntimeConfig: { inferenceBaseURL: localEndpoint(d.endpoint) } };
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
