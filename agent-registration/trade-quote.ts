import { parseAbi, type Address, type Hex } from 'viem';
import type { TradingQuote } from './types.js';

const tradeAbi = parseAbi(['function managerTrade(address,address,uint256,uint256,uint256,address) returns(uint256)']);
export function quoteMinimum(expected: bigint, slippageBps: number, oracleFloor: bigint) {
  if (expected <= 0n || oracleFloor <= 0n || !Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 500)
    throw new Error('Invalid executable quote or slippage policy.');
  const minimum = (expected * BigInt(10000 - slippageBps) + 9999n) / 10000n;
  return minimum > oracleFloor ? minimum : oracleFloor;
}

/** Full vault swap eth_call: no balance/permission overrides and no transaction broadcast. */
export async function simulateTradeQuote(client: any, input: {
  vault: Address; manager: Address; venue: Address; tokenIn: Address; tokenOut: Address;
  amountIn: bigint; oracleFloor: bigint; slippageBps: number; deadline: bigint;
  blockNumber: bigint; blockHash: Hex;
}) {
  const { vault, manager, venue, tokenIn, tokenOut, amountIn, oracleFloor, slippageBps, deadline, blockNumber, blockHash } = input;
  const simulate = (minimum: bigint) => client.simulateContract({
    address: vault, account: manager, abi: tradeAbi, functionName: 'managerTrade',
    args: [tokenIn, tokenOut, amountIn, minimum, deadline, venue], blockNumber,
  });
  const expected = (await simulate(oracleFloor)).result;
  if (typeof expected !== 'bigint' || expected < oracleFloor) throw new Error('DEX simulation returned an invalid output.');
  const minimum = quoteMinimum(expected, slippageBps, oracleFloor);
  const args = [tokenIn, tokenOut, amountIn, minimum, deadline, venue] as const;
  // Verify the exact calldata that will be offered to the wallet, including its stricter minimum.
  if ((await simulate(minimum)).result !== expected) throw new Error('DEX quote changed during simulation. Review again.');
  if ((await client.getBlock({ blockNumber })).hash !== blockHash) throw new Error('Chain changed during quotation. Review again.');
  const checkedAt = Date.now();
  const quote: TradingQuote = {
    tokenIn, tokenOut, amountIn: amountIn.toString(), expectedOutput: expected.toString(),
    minimumOutput: minimum.toString(), oracleMinimumOutput: oracleFloor.toString(), slippageBps,
    blockNumber: blockNumber.toString(), blockHash, checkedAt: new Date(checkedAt).toISOString(),
    expiresAt: checkedAt + 30000,
  };
  return { args, quote };
}
