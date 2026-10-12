import { getAddress, keccak256, stringToHex } from 'viem';
import { checkAuthorizations } from '../../../agent-registration/core.js';
import { registrationRequest, registrationSession, type RegistrationRecord } from './agent-registration.js';

export type DirectoryAgent = { id: string; latest: RegistrationRecord; versions: RegistrationRecord[] };
export type AgentFilter = 'all' | 'pending' | 'binding';
const hash = (x: unknown) => typeof x === 'string' && /^0x[a-f0-9]{64}$/.test(x);
const digest = (x: unknown) => typeof x === 'string' && /^sha256:[a-f0-9]{64}$/.test(x) && x !== `sha256:${'0'.repeat(64)}`;
const text = (x: unknown, max: number) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const units = (x: unknown) => typeof x === 'string' && /^[1-9]\d{0,18}$/.test(x);
const date = (x: unknown) => typeof x === 'string' && Number.isFinite(Date.parse(x));
const address = (x: unknown) => typeof x === 'string' && !/^0x0{40}$/i.test(x) && getAddress(x) === x;
const invalid = () => { throw new Error('Registration data failed verification. No agents were displayed; refresh or inspect the local registration store.'); };

// Untrusted JSON must not become a trusted badge merely because TypeScript has a type.
export async function readDirectory(value: unknown): Promise<DirectoryAgent[]> {
  const records = (value as { records?: unknown })?.records;
  if (!Array.isArray(records) || records.length > 1000) invalid();
  const ids = new Set<string>(), groups = new Map<string, RegistrationRecord[]>();
  try {
    for (const r of records as RegistrationRecord[]) {
      const m = r?.manifest, c = r?.authorization?.challenge, w = r?.worker;
      if (r.version !== 'PUMPCOIN-LOCAL-REGISTRATION-v1' || !hash(r.id) || !hash(r.localAgentId) || ids.has(r.id) || r.investmentEligible !== false || !date(r.registeredAt)) invalid();
      if (!m || m.version !== 'PUMPCOIN-DEPLOYMENT-DRAFT-v1' || m.inferencePolicy !== 'PUMPCOIN-SELF-HOSTED-v1' || m.evidenceLevel !== 'operator-declared' || m.registrationStatus !== 'unpublished-draft') invalid();
      if (!text(m.name, 64) || !address(m.controller) || !address(m.executionKey) || m.controller === m.executionKey || !text(m.model?.id, 100) || !digest(m.model.weightsDigest) || !digest(m.model.runtimeDigest)) invalid();
      const source = new URL(m.model.source); if (source.protocol !== 'https:' || source.username || source.password) invalid();
      if (!text(m.strategy?.description, 2000) || !digest(m.strategy.codeDigest) || !['MON / USDC', 'WMON / USDC'].includes(m.strategy.pair) || !Array.isArray(m.dependencies) || !m.dependencies.every(d => text(d, 1000))) invalid();
      const mandate = m.proposedMandate;
      if (mandate?.quoteDecimals !== 6 || mandate.leverage !== false || !units(mandate.perTradeQuoteUnits) || !units(mandate.maxPositionQuoteUnits) || BigInt(mandate.perTradeQuoteUnits) > BigInt(mandate.maxPositionQuoteUnits) || !Number.isInteger(mandate.slippageBps) || mandate.slippageBps < 1 || mandate.slippageBps > 500) invalid();
      if (!hash(r.commitment) || keccak256(stringToHex(JSON.stringify(m))) !== r.commitment || !c || c.commitment !== r.commitment || c.controller !== m.controller || c.executionKey !== m.executionKey || !hash(c.runtimeConfigHash) || !/^[a-f0-9]{64}$/.test(c.id) || ![10143, 31337].includes(c.chainId) || !Number.isSafeInteger(c.expiresAt)) invalid();
      const origin = new URL(c.origin); if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.origin !== c.origin) invalid();
      if (r.id !== keccak256(stringToHex(c.id)) || r.localAgentId !== keccak256(stringToHex(JSON.stringify([c.chainId, m.controller, m.name])))) invalid();
      const registered = Date.parse(r.registeredAt);
      if (registered < c.expiresAt - 600000 || registered >= c.expiresAt) invalid();
      // Verify historical consent at its recorded validity time, not against today's clock.
      await checkAuthorizations(c, r.authorization.controllerSignature, r.authorization.executionSignature, c.expiresAt - 1);
      if (!w || w.version !== 'PUMPCOIN-LOCAL-WORKER-CHECK-v1' || w.mode !== 'synthetic-paper-only' || w.evidence !== 'locally-observed-not-attested' || w.model !== m.model.id || w.weightsDigest !== m.model.weightsDigest || w.runtimeDigest !== m.model.runtimeDigest || !date(w.checkedAt)) invalid();
      if (Date.parse(w.checkedAt) > registered || registered - Date.parse(w.checkedAt) > 120000) invalid();
      const input = w.input, raw = w.rawProposal, output = w.guardedProposal;
      if (!input || input.fresh !== false || input.valued !== false || input.cashQuoteUnits !== '0' || input.positionQuoteUnits !== '0' || !raw || !['HOLD', 'BUY', 'SELL'].includes(raw.action) || !/^(0|[1-9]\d{0,18})$/.test(raw.quoteUnits) || output?.action !== 'HOLD' || output.quoteUnits !== '0') invalid();
      if (w.receiptHash !== keccak256(stringToHex(JSON.stringify({ commitment: r.commitment, input, raw, output })))) invalid();
      if (r.binding) {
        const b = r.binding;
        if (r.status !== 'registered-locally-binding-checked' || b.status !== 'binding-checked-at-block' || b.investmentEligible !== false || b.chainId !== c.chainId || b.mode !== (b.chainId === 10143 ? 'monad-testnet' : 'local-simulation') || !address(b.vault) || !address(b.identityRegistry) || !/^(0|[1-9]\d*)$/.test(b.agentId) || !/^(0|[1-9]\d*)$/.test(b.blockNumber) || !hash(b.blockHash) || !hash(b.configHash) || !date(b.checkedAt)) invalid();
      } else if (r.status !== 'registered-locally-vault-pending') invalid();
      ids.add(r.id);
      const versions = groups.get(r.localAgentId) ?? []; versions.push(r); groups.set(r.localAgentId, versions);
    }
  } catch { invalid(); }
  return [...groups].map(([id, versions]) => {
    versions.sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt) || b.id.localeCompare(a.id));
    return { id, latest: versions[0], versions };
  }).sort((a, b) => Date.parse(b.latest.registeredAt) - Date.parse(a.latest.registeredAt) || a.id.localeCompare(b.id));
}
export async function loadDirectory(signal: AbortSignal) {
  const session = await registrationSession(signal);
  const data = await registrationRequest(session.token, '/records', undefined, signal);
  const agents = await readDirectory(data); signal.throwIfAborted();
  return { agents, configured: session.configured, token: session.token };
}
export function filterAgents(agents: DirectoryAgent[], query: string, filter: AgentFilter) {
  const search = query.trim().toLowerCase();
  return agents.filter(({ latest: r }) => (filter === 'all' || (filter === 'binding' ? !!r.binding : !r.binding)) && [r.manifest.name, r.manifest.model.id, r.manifest.strategy.description, r.manifest.strategy.pair, r.manifest.controller, r.manifest.executionKey].some(s => s.toLowerCase().includes(search)));
}
export function quoteAmount(value: string) {
  const n = BigInt(value), fraction = (n % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${n / 1000000n}${fraction ? `.${fraction}` : ''}`;
}
