import { encodeFunctionData, type Hex, type Abi } from 'viem';

// Solidity's static ABI decoder accepts this trailing marker. It adds a decision
// commitment to the same signed trade transaction, with no separate anchor fee.
export const DECISION_MARKER = '50434431'; // ASCII PCD1
export function committedTradeData(abi: Abi, args: readonly unknown[], hash?: Hex): Hex {
  const data = encodeFunctionData({ abi, functionName: 'managerTrade', args });
  if (!hash) return data;
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid decision commitment.');
  return `${data}${DECISION_MARKER}${hash.slice(2)}` as Hex;
}
