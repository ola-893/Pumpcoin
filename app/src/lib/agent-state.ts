import { strategyBindingHash, riskBindingHash } from '../../../agent-registration/core.js';
import type { AgentState, LiveVaultObservation, RegistrationRecord } from '../../../agent-registration/types.js';
export type { AgentState };
const units = (x: unknown) => typeof x === 'string' && /^(0|[1-9]\d*)$/.test(x);
const hash = (x: unknown) => typeof x === 'string' && /^0x[0-9a-f]{64}$/i.test(x);
const address = (x: unknown) => typeof x === 'string' && /^0x[0-9a-f]{40}$/i.test(x);
const date = (x: unknown) => typeof x === 'string' && Number.isFinite(Date.parse(x));
const decimals = (x: unknown) => Number.isInteger(x) && Number(x) >= 0 && Number(x) <= 36;
const count = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
// Never attach another registration's state to a signed declaration, even when
// a response arrives after navigation. This is validation, not an RPC quorum.
export function readAgentState(value: unknown, record: RegistrationRecord): AgentState {
  const s = value as AgentState;
  const fail = () => { throw new Error('Agent state failed source and schema checks. No state was substituted.'); };
  if (!s || s.registrationId !== record.id || s.manifestCommitment !== record.commitment || s.vault?.toLowerCase() !== record.binding?.vault.toLowerCase() || !date(s.checkedAt)) fail();
  if (s.cache && (typeof s.cache.refreshing !== 'boolean' || s.cache.refreshError !== undefined && typeof s.cache.refreshError !== 'string')) fail();
  const o = s.observation;
  if (o) {
    if (o.chainId !== record.binding?.chainId || o.vault.toLowerCase() !== record.binding?.vault.toLowerCase() || !units(o.blockNumber) || !hash(o.blockHash) || !date(o.checkedAt)
      || !address(o.controller) || !address(o.manager) || !hash(o.configHash) || typeof o.paused !== 'boolean' || !units(o.cash) || !units(o.position) || !units(o.shares) || !decimals(o.shareDecimals)
      || (o.nav !== undefined && !units(o.nav)) || !address(o.quote?.address) || !decimals(o.quote?.decimals) || typeof o.quote?.symbol !== 'string'
      || !address(o.positionToken?.address) || !decimals(o.positionToken?.decimals) || typeof o.positionToken?.symbol !== 'string' || !address(o.valuation?.source) || typeof o.valuation?.available !== 'boolean'
      || !hash(o.identity?.strategyHash) || !hash(o.identity?.riskHash) || typeof o.identity?.publishedManifestURI !== 'string' || !address(o.identity?.registry) || !units(o.identity?.agentId) || !address(o.identity?.owner)
      || !['strategyMatchesDeclaration','riskMatchesDeclaration','mandateMatchesDeclaration','ownerMatchesDeclaration','manifestMatchesDeclaration','bindingMatchesRecord','controllerMatchesDeclaration','managerMatchesDeclaration'].every(k => typeof o.identity[k as keyof typeof o.identity] === 'boolean')
      || !['perTradeQuoteUnits','maxPositionQuoteUnits','expenseBudget','configurationNoticeSeconds'].every(k => units(o.mandate?.[k as keyof typeof o.mandate]))
      || !count(o.activity?.trades) || !count(o.activity?.deposits) || !count(o.activity?.withdrawals) || !units(o.activity?.depositedQuoteUnits) || !units(o.activity?.withdrawnQuoteUnits)
      || !units(o.history?.fromBlock) || !units(o.history?.toBlock) || BigInt(o.history.toBlock) < BigInt(o.history.fromBlock) || o.history.toBlock !== o.blockNumber
      || !count(o.history?.transactionLimit) || typeof o.history?.completePerformanceHistory !== 'boolean' || !Array.isArray(o.transactions)) fail();
    if (o.valuation.available && o.nav === undefined || o.valuation.reason !== undefined && typeof o.valuation.reason !== 'string') fail();
    const prepared = { manifest: record.manifest, commitment: record.commitment, privateRuntimeConfig: { inferenceBaseURL: '' } };
    if (o.identity.strategyMatchesDeclaration !== (o.identity.strategyHash === strategyBindingHash(prepared))
      || o.identity.riskMatchesDeclaration !== (o.identity.riskHash === riskBindingHash(prepared))
      || o.identity.mandateMatchesDeclaration !== (o.mandate.perTradeQuoteUnits === record.manifest.proposedMandate.perTradeQuoteUnits && o.mandate.maxPositionQuoteUnits === record.manifest.proposedMandate.maxPositionQuoteUnits)) fail();
    if (o.identity.controllerMatchesDeclaration !== (o.controller.toLowerCase() === record.manifest.controller.toLowerCase())
      || o.identity.managerMatchesDeclaration !== (o.manager.toLowerCase() === record.manifest.executionKey.toLowerCase())
      || o.identity.ownerMatchesDeclaration !== (o.identity.owner.toLowerCase() === record.manifest.controller.toLowerCase())
      || o.identity.bindingMatchesRecord !== (o.identity.registry.toLowerCase() === record.binding?.identityRegistry.toLowerCase() && o.identity.agentId === record.binding?.agentId)) fail();
    if (o.permissionSupported !== true && o.permissionSupported !== false) fail();
    if (o.permission && (typeof o.permission.active !== 'boolean' || !units(o.permission.validUntil) || !units(o.permission.dailyQuoteCap) || !units(o.permission.dailyQuoteTraded))) fail();
  } else if (typeof s.chainError !== 'string' || !s.chainError) fail();
  if (s.runtime) {
    if (typeof s.runtime.running !== 'boolean' || typeof s.runtime.configured !== 'boolean' || !date(s.runtime.changedAt) || typeof s.runtime.message !== 'string'
      || s.runtime.observedAt !== undefined && !date(s.runtime.observedAt) || s.runtime.transactionHash !== undefined && !hash(s.runtime.transactionHash)
      || !['unconfigured','stopped','starting','stopping','error','pending','confirming','success','reverted','submitted','hold','blocked','budget'].includes(s.runtime.state)) fail();
  } else if (typeof s.runtimeError !== 'string' || !s.runtimeError) fail();
  return s;
}
export function identityMatches(o: LiveVaultObservation) {
  return o.identity.strategyMatchesDeclaration && o.identity.riskMatchesDeclaration && o.identity.mandateMatchesDeclaration && o.identity.ownerMatchesDeclaration && o.identity.manifestMatchesDeclaration && o.identity.bindingMatchesRecord && o.identity.controllerMatchesDeclaration && o.identity.managerMatchesDeclaration;
}
export function chainLabel(s?: AgentState, stale = false) {
  if (!s) return 'Checking chain state';
  if (!s.observation) return 'Chain check unavailable';
  if (stale) return 'Earlier chain snapshot';
  if (!identityMatches(s.observation)) return 'Identity/configuration changed';
  return s.observation.paused ? 'Vault paused' : 'Vault enabled';
}
export function activityLabel(s?: AgentState, stale = false) {
  if (!s) return 'Checking vault activity';
  if (!s.observation) return 'Activity check unavailable';
  const { activity, history } = s.observation;
  return `${activity.trades} observed trade${activity.trades === 1 ? '' : 's'}${stale ? ' · earlier snapshot' : ''} · blocks ${history.fromBlock}–${history.toBlock}`;
}
export function runtimeLabel(s?: AgentState) {
  if (!s) return 'Checking local runtime';
  if (!s.runtime) return 'Runtime check unavailable';
  return `${s.runtime.running ? 'Running' : s.runtime.configured ? 'Stopped' : 'Unconfigured'} · ${s.runtime.state}`;
}
