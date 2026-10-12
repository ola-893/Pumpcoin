import { parseAbi, type Address, type Hex } from 'viem';

export type ChainlinkFeedPin = { proxy: Address; aggregator: Address; proxyCodeHash: Hex; aggregatorCodeHash: Hex; decimals: number };
export const chainlinkAbi = parseAbi([
  'function decimals() view returns(uint8)',
  'function description() view returns(string)',
  'function aggregator() view returns(address)',
  'function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)',
]);
export type PriceObservation = { price: bigint; conf: bigint; expo: number; publishTime: bigint };
export function chainlinkObservation(round: readonly [bigint, bigint, bigint, bigint, bigint], decimals: number): PriceObservation {
  const [id, answer, started, updated, answered] = round;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 || id === 0n || answered < id || answer <= 0n
    || started === 0n || started > updated || updated === 0n || answer > ((1n << 256n) - 1n) / 10n ** BigInt(18 - decimals))
    throw new Error('Invalid Chainlink round.');
  return { price: answer, conf: 0n, expo: -decimals, publishTime: updated };
}
export async function readChainlinkFeed(
  feed: ChainlinkFeedPin | null | undefined, asset: 'MON' | 'USDC',
  read: (address: Address, name: string, args: unknown[], abi: typeof chainlinkAbi) => Promise<any>,
  pin: (address: Address, hash: Hex) => Promise<void>,
) {
  const empty: PriceObservation = { price: 0n, conf: 0n, expo: 0, publishTime: 0n };
  if (!feed) return { observation: empty, blockers: [`A verified Chainlink ${asset}/USD feed is not configured for this network.`] };
  await pin(feed.proxy, feed.proxyCodeHash);
  await pin(feed.aggregator, feed.aggregatorCodeHash);
  const [decimals, description, aggregator, round] = await Promise.all(
    ['decimals', 'description', 'aggregator', 'latestRoundData'].map(name => read(feed.proxy, name, [], chainlinkAbi)),
  );
  if (decimals !== feed.decimals || description !== `${asset} / USD` || aggregator.toLowerCase() !== feed.aggregator.toLowerCase())
    throw new Error(`Chainlink ${asset}/USD identity or aggregator changed. Trading is blocked.`);
  try { return { observation: chainlinkObservation(round, decimals), blockers: [] as string[] }; }
  catch { return { observation: empty, blockers: [`Chainlink ${asset}/USD returned an invalid round.`] }; }
}
