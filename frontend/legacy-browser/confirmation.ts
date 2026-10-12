import type { Hash } from 'viem';

// A submitted hash or a mined reverted receipt is never proof of success.
export async function confirmSuccessfulTransaction(
  hash: Hash,
  wait: (hash: Hash) => Promise<{ status: 'success' | 'reverted'; transactionHash: Hash }>,
): Promise<Hash> {
  const receipt = await wait(hash);
  if (receipt.status !== 'success') throw new Error('Transaction reverted. No success recorded.');
  return receipt.transactionHash;
}
