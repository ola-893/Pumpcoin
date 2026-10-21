import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getAddress, getContractAddress, keccak256, parseTransaction, recoverTransactionAddress, type Address, type Hex, type PrivateKeyAccount, type TransactionSerialized } from 'viem';

export type DeploymentKind = 'vault' | 'trading' | 'guard' | 'native' | 'native-guard' | 'pool-funder';
export type CreationPlan = { chainId: number; from: Address; to?: Address; data: Hex; value: string; gas: string; scope: string; canSubmit?: boolean; quote?: { expiresAt: number }; id?: Hex };
type Journal = { version: 'PUMPCOIN-DEPLOYMENT-v1'; registrationId: Hex; kind: DeploymentKind; plan: CreationPlan; nonce: number; maximumCostWei: string; raw: TransactionSerialized; hash: Hex };
type Result = { state: 'planned' | 'verified'; from: Address; kind: DeploymentKind; estimatedMaximumCostWei: string; hash?: Hex; address?: Address; blockNumber?: string; gasPaidWei?: string };

export function requireCreation(plan: CreationPlan, address: Address, chainId: number) {
  if (plan.chainId !== chainId || plan.from.toLowerCase() !== address.toLowerCase() || plan.to !== undefined || BigInt(plan.value) !== 0n || !/^0x[0-9a-f]+$/i.test(plan.data) || !/^0x[0-9a-f]+$/i.test(plan.gas) || BigInt(plan.gas) === 0n || plan.canSubmit === false) throw new Error('Deployment must be a funded, zero-value creation by the registered controller.');
  if (plan.quote && Date.now() >= plan.quote.expiresAt) throw new Error('Deployment review expired. Prepare it again.');
}

/** The CLI owns this signer. No HTTP handler imports or invokes this module. */
export async function deployReviewed(options: {
  directory: string; id: Hex; kind: DeploymentKind; chainId: 10143 | 31337;
  account: PrivateKeyAccount; client: any; broadcastClient: any; broadcast: boolean;
  maxCostWei: bigint; prepare: () => Promise<CreationPlan>; confirm: (hash: Hex, plan: CreationPlan) => Promise<unknown>;
}): Promise<Result> {
  const { account, client, id, kind, chainId, maxCostWei } = options;
  if (!/^0x[0-9a-f]{64}$/.test(id) || !['vault', 'trading', 'guard', 'native', 'native-guard', 'pool-funder'].includes(kind) || ![10143,31337].includes(chainId) || maxCostWei <= 0n) throw new Error('Invalid deployment scope.');
  if (await client.getChainId() !== chainId) throw new Error('Deployment RPC is on the wrong chain.');
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const file = join(options.directory, `${id.slice(2)}-${kind}.json`);
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  const lockFile = join(options.directory, `${account.address.toLowerCase()}.lock`);
  // Every creation from this controller shares one nonce lock. Never steal stale locks.
  if (options.broadcast) { lock = await open(lockFile, 'wx', 0o600); }
  try {
    let saved: Journal | undefined;
    try { saved = JSON.parse(await readFile(file, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (!saved) {
      const plan = await options.prepare(); requireCreation(plan, account.address, chainId);
      const gas = BigInt(plan.gas), fees = await client.estimateFeesPerGas();
      const maxFeePerGas: bigint = fees.maxFeePerGas, maxPriorityFeePerGas: bigint = fees.maxPriorityFeePerGas;
      if (maxFeePerGas <= 0n || maxPriorityFeePerGas < 0n || maxPriorityFeePerGas > maxFeePerGas || gas * maxFeePerGas + BigInt(plan.value) > maxCostWei) throw new Error('Deployment exceeds the maximum gas cost.');
      const balance = await client.getBalance({ address: account.address });
      if (balance < gas * maxFeePerGas + BigInt(plan.value)) throw new Error('Deployer has insufficient test-MON for the maximum gas cost.');
      if (!options.broadcast) return { state: 'planned', from: account.address, kind, estimatedMaximumCostWei: String(gas * maxFeePerGas + BigInt(plan.value)) };
      const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' });
      if (nonce !== await client.getTransactionCount({ address: account.address, blockTag: 'latest' })) throw new Error('Resolve the controller’s pending transaction before deploying.');
      requireCreation(plan, account.address, chainId);
      const raw = await account.signTransaction({ chainId, nonce, data: plan.data, ...(plan.to ? { to: plan.to } : {}), value: BigInt(plan.value), gas, maxFeePerGas, maxPriorityFeePerGas, type: 'eip1559' }) as TransactionSerialized;
      saved = { version: 'PUMPCOIN-DEPLOYMENT-v1', registrationId: id, kind, plan, nonce, maximumCostWei: String(gas * maxFeePerGas + BigInt(plan.value)), raw, hash: keccak256(raw) };
      // Exclusive, durable publication before network submission. An ambiguous send
      // can only retry these signed bytes, never prepare a replacement deployment.
      const temporary = `${file}.tmp`, out = await open(temporary, 'wx', 0o600);
      try { await out.writeFile(JSON.stringify(saved)); await out.sync(); } finally { await out.close(); }
      await rename(temporary, file); const parent = await open(options.directory, 'r'); try { await parent.sync(); } finally { await parent.close(); }
    }
    if (!saved) throw new Error('Deployment journal is unavailable.');
    const tx = parseTransaction(saved.raw), recovered = await recoverTransactionAddress({ serializedTransaction: saved.raw });
    if (saved.version !== 'PUMPCOIN-DEPLOYMENT-v1' || saved.registrationId !== id || saved.kind !== kind || saved.hash !== keccak256(saved.raw) || recovered !== account.address || tx.chainId !== chainId || (tx.to ?? '').toLowerCase() !== (saved.plan.to ?? '').toLowerCase() || (tx.value ?? 0n) !== BigInt(saved.plan.value) || tx.nonce !== saved.nonce || saved.plan.from.toLowerCase() !== account.address.toLowerCase() || saved.plan.chainId !== chainId || saved.plan.to !== undefined || BigInt(saved.plan.value) !== 0n || tx.data !== saved.plan.data || tx.gas !== BigInt(saved.plan.gas) || tx.type !== 'eip1559' || tx.gas! * tx.maxFeePerGas! + BigInt(saved.plan.value) !== BigInt(saved.maximumCostWei) || BigInt(saved.maximumCostWei) > maxCostWei) throw new Error('Saved deployment differs from its reviewed scope.');
    let receipt;
    try { receipt = await client.getTransactionReceipt({ hash: saved.hash }); }
    catch (error) { if ((error as Error).name !== 'TransactionReceiptNotFoundError') throw error; }
    if (!receipt && !options.broadcast) return { state: 'planned', from: account.address, kind, estimatedMaximumCostWei: saved.maximumCostWei, hash: saved.hash };
    if (!receipt) {
      if (await client.getTransactionCount({ address: account.address, blockTag: 'latest' }) > saved.nonce) throw new Error('Saved nonce was consumed without its receipt. Resolve the journal; do not create a fresh transaction.');
      try { const hash = await options.broadcastClient.sendRawTransaction({ serializedTransaction: saved.raw }); if (hash !== saved.hash) throw new Error('Unexpected deployment hash.'); }
      catch { /* A timeout or already-known response is ambiguous; follow the saved hash. */ }
      receipt = await client.waitForTransactionReceipt({ hash: saved.hash, confirmations: 2, timeout: 120000, pollingInterval: 1000 });
    } else {
      receipt = await client.waitForTransactionReceipt({ hash: saved.hash, confirmations: 2, timeout: 120000, pollingInterval: 1000 });
    }
    const mined = await client.getTransaction({ hash: saved.hash });
    const address = getContractAddress({ from: account.address, nonce: BigInt(saved.nonce) });
    if (receipt.status !== 'success' || receipt.transactionHash !== saved.hash || receipt.contractAddress?.toLowerCase() !== address.toLowerCase() || mined.from.toLowerCase() !== account.address.toLowerCase() || (mined.to ?? '').toLowerCase() !== (saved.plan.to ?? '').toLowerCase() || mined.input !== saved.plan.data || mined.value !== BigInt(saved.plan.value) || (await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) throw new Error('Deployment receipt failed canonical creation verification. The journal is retained.');
    await options.confirm(saved.hash, saved.plan); // Existing receipt/runtime/immutable checks publish the address.
    return { state: 'verified', from: account.address, kind, estimatedMaximumCostWei: saved.maximumCostWei, hash: saved.hash, address: getAddress(receipt.contractAddress), blockNumber: String(receipt.blockNumber), gasPaidWei: String(receipt.gasUsed * receipt.effectiveGasPrice) };
  } finally { if (lock) { await lock.close(); await unlink(lockFile); } }
}
