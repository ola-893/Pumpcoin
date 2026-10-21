import { keccak256, stringToHex, type Hex } from 'viem';
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  throw new Error('Unsupported research encoding.');
}
export const digest = (value: unknown): Hex => keccak256(stringToHex(canonical(value)));
export const integer = (value: unknown): bigint => { if (typeof value !== 'string' || !/^(0|[1-9]\d{0,35})$/.test(value)) throw new Error('Invalid practice base units.'); return BigInt(value); };
export function units(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Missing provider numeric value.');
  const s = String(value); if (!/^(0|[1-9]\d{0,18})(\.\d{1,6})?$/.test(s)) throw new Error('Provider value must be a positive decimal with at most six places.');
  const [whole, fraction = ''] = s.split('.'); return String(BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0')));
}
export function time(value: string): number { const n = Date.parse(value); if (!Number.isFinite(n)) throw new Error('Invalid evidence timestamp.'); return n; }
export const fresh = (observed: string, now: number, seconds: number) => { const n = time(observed); return n <= now && now - n <= seconds * 1000; };
