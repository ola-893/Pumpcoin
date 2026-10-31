import type { Prepared } from './core.js';
export type Proposal = { action: 'HOLD' | 'BUY' | 'SELL'; quoteUnits: string };
export type PaperInput = { fresh: boolean; valued: boolean; positionQuoteUnits: string; cashQuoteUnits: string };
export function guardedProposal(value: unknown, input: PaperInput, prepared: Prepared): Proposal {
  const p = value as Proposal;
  if (!p || typeof p !== 'object' || Object.keys(p).sort().join(',') !== 'action,quoteUnits' || !['HOLD', 'BUY', 'SELL'].includes(p.action) || typeof p.quoteUnits !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(p.quoteUnits)) throw new Error('The local model did not return a valid paper proposal.');
  const hold = { action: 'HOLD', quoteUnits: '0' } as const;
  const amount = BigInt(p.quoteUnits), position = BigInt(input.positionQuoteUnits), cash = BigInt(input.cashQuoteUnits), m = prepared.manifest.proposedMandate;
  if (!input.fresh || !input.valued || p.action === 'HOLD') return hold;
  if (amount === 0n || amount > BigInt(m.perTradeQuoteUnits)) return hold;
  if (p.action === 'BUY' && (amount > cash || position + amount > BigInt(m.maxPositionQuoteUnits))) return hold;
  if (p.action === 'SELL' && amount > position) return hold;
  return { action: p.action, quoteUnits: p.quoteUnits };
}

export function workerGuardChallenges(p: Prepared) {
  const cap = p.manifest.proposedMandate.perTradeQuoteUnits;
  const challengeInput = { fresh: true, valued: true, positionQuoteUnits: '0', cashQuoteUnits: cap };
  return [
    { id: 'allowed-buy', input: challengeInput, proposal: { action: 'BUY', quoteUnits: cap }, expected: { action: 'BUY', quoteUnits: cap } },
    { id: 'allowed-sell', input: { ...challengeInput, cashQuoteUnits: '0', positionQuoteUnits: cap }, proposal: { action: 'SELL', quoteUnits: cap }, expected: { action: 'SELL', quoteUnits: cap } },
    { id: 'stale-buy', input: { ...challengeInput, fresh: false }, proposal: { action: 'BUY', quoteUnits: cap }, expected: { action: 'HOLD', quoteUnits: '0' } },
    { id: 'unvalued-buy', input: { ...challengeInput, valued: false }, proposal: { action: 'BUY', quoteUnits: cap }, expected: { action: 'HOLD', quoteUnits: '0' } },
    { id: cap === '9999999999999999999' ? 'zero-buy' : 'oversized-buy', input: challengeInput, proposal: { action: 'BUY', quoteUnits: cap === '9999999999999999999' ? '0' : (BigInt(cap) + 1n).toString() }, expected: { action: 'HOLD', quoteUnits: '0' } },
    { id: 'overexposed-buy', input: { ...challengeInput, positionQuoteUnits: p.manifest.proposedMandate.maxPositionQuoteUnits }, proposal: { action: 'BUY', quoteUnits: cap }, expected: { action: 'HOLD', quoteUnits: '0' } },
    { id: 'cashless-buy', input: { ...challengeInput, cashQuoteUnits: '0' }, proposal: { action: 'BUY', quoteUnits: cap }, expected: { action: 'HOLD', quoteUnits: '0' } },
    { id: 'positionless-sell', input: challengeInput, proposal: { action: 'SELL', quoteUnits: cap }, expected: { action: 'HOLD', quoteUnits: '0' } },
  ].map(x => ({ ...x, proposal: x.proposal as Proposal, expected: x.expected as Proposal, result: guardedProposal(x.proposal, x.input, p) }));
}
