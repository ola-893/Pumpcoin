import { keccak256, stringToHex } from 'viem';
export const NAV_POLICY_VERSION = 'UNORA-VAULT-NAV-v1.0.0';
export const NAV_POLICY_HASH = keccak256(stringToHex(NAV_POLICY_VERSION));
export interface NavInputs {
    cash: bigint;
    positionBalance: bigint;
    priceE18: bigint;
    escrow: bigint;
    accrued: bigint;
}
export function markedValue(balance: bigint, price: bigint): bigint {
    if (balance < 0n || price <= 0n)
        throw new Error('invalid-position-or-price');
    return balance * price / 10n ** 18n;
}
export function navOf(i: NavInputs): bigint {
    if ([i.cash, i.positionBalance, i.escrow, i.accrued].some(x => x < 0n))
        throw new Error('negative-nav-input');
    const gross = i.cash + (i.positionBalance === 0n ? 0n : markedValue(i.positionBalance, i.priceE18)) + i.escrow;
    return gross <= i.accrued ? 0n : gross - i.accrued;
}
export interface FlowEvent {
    kind: 'deposit' | 'withdraw';
    amount: bigint;
}
export function netPnl(open: bigint, close: bigint, flows: FlowEvent[]): bigint {
    return flows.reduce((p, f) => { if (f.amount < 0n)
        throw new Error('negative-flow'); return p + (f.kind === 'deposit' ? -f.amount : f.amount); }, close - open);
}
// Quote base units per WHOLE share. Shares have quoteDecimals + offset (12 in this slice).
export function perShare(nav: bigint, shares: bigint, shareDecimals = 12): bigint {
    if (nav < 0n || shares <= 0n || !Number.isInteger(shareDecimals) || shareDecimals < 0 || shareDecimals > 36)
        throw new Error('invalid-share-price');
    return nav * 10n ** BigInt(shareDecimals) / shares;
}
