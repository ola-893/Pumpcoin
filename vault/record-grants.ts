import { parseAbi, type PublicClient, type Address } from 'viem';
import type { RecordGrant } from './records.js';
const abi = parseAbi(['function manager() view returns(address)', 'function admin() view returns(address)']);
// Resolve current roles from the vault on each authenticated request. No user
// role parameter or identity NFT ownership can grant private-record access.
export function onchainGrantResolver(client: PublicClient) {
    return async (chainId: number, vault: Address): Promise<RecordGrant | undefined> => {
        if (await client.getChainId() !== chainId)
            return undefined;
        const block = await client.getBlock();
        if (!block.hash || block.number === null)
            throw new Error('pending-role-checkpoint');
        const [manager, admin] = await Promise.all([
            client.readContract({ address: vault, abi, functionName: 'manager', blockNumber: block.number }),
            client.readContract({ address: vault, abi, functionName: 'admin', blockNumber: block.number }),
        ]);
        if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash)
            throw new Error('role-check-reorg');
        return { chainId, vault, manager, admin };
    };
}
