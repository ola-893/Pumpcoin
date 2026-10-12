import { parseVaultExport } from '../../../vault/chain-history.js';
import { replay } from '../../../vault/ledger.js';
import { navOf } from '../../../vault/nav.js';
import type { Address, Hex } from 'viem';

export type DemoEvidence = ReturnType<typeof readDemo>;
export function readDemo(text: string) {
  const raw = JSON.parse(text);
  if (raw.environment !== 'simulation' || raw.bundle?.coverage?.chainId !== 31337 || !Array.isArray(raw.receipts)) throw new Error('Unsupported evidence environment.');
  const bundle = parseVaultExport(text);
  const report = replay(bundle.events, bundle.coverage);
  if (report.status !== 'ok') throw new Error(`Archived accounting cannot reconcile: ${report.reason}`);
  const s = bundle.coverage.closing;
  const nav = navOf({ ...s, escrow: s.managedEscrow });
  const last = [...bundle.events].reverse().find(e => e.kind === 'config');
  if (!last?.manager || !last.strategyHash || !last.configHash) throw new Error('Missing configuration evidence.');
  return { bundle, report, nav, cash: s.cash, markedPositions: s.positionBalance * s.priceE18 / 10n ** 18n, shares: s.totalShares,
    manager: last.manager, strategyHash: last.strategyHash, configHash: last.configHash, receipts: raw.receipts as Array<{ action: string; hash: Hex; status: 'success' | 'reverted'; block: string }>,
    addresses: raw.addresses as Record<string, Address>, sourceHashes: raw.sourceHashes as Record<string, string>, policyHash: raw.navPolicyHash as Hex,
  };
}
export function units(value: bigint, digits = 2) { return (Number(value) / 1000000).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
export function short(value: string) { return `${value.slice(0, 8)}…${value.slice(-6)}`; }
// Illustrative OZ virtual-share conversion for the archived six-decimal quote.
export function simulatedShares(amount: bigint, nav: bigint, shares: bigint) {
  if (amount <= 0n || nav <= 0n || shares <= 0n) throw new Error('Unavailable share valuation.');
  return amount * (shares + 1000000n) / (nav + 1n);
}
