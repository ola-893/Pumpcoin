import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { encodeDeployData, getAddress, keccak256, toHex } from 'viem';
import { readClient } from './rpc.js';
import { tradingService } from './trading.js';
import { registrationService } from './service.js';
const root = fileURLToPath(new URL('../', import.meta.url));
async function main() {
  const [id, output] = process.argv.slice(2);
  if (!/^0x[0-9a-f]{64}$/.test(id ?? '') || !output) throw new Error('Select a registration and new plan output path.');
  const get = async (path: string) => JSON.parse(await readFile(join(root, path), 'utf8'));
  const network = await get('deployments/pumpcoin-vault-network.json'), market = await get('deployments/pumpcoin-trading-network.json');
  if (network.chainId !== 10143 || market.oracle !== 'supra-pyth') throw new Error('Only the reviewed hybrid testnet route is supported.');
  const records = registrationService({ directory: join(root, '.local/agent-registrations') }), client = readClient(network.rpcUrl);
  const view = await tradingService(network, market, join(root, '.local/vault-trading'), () => records.records(), client).inspect(id);
  if (!view.bundle) throw new Error('Deploy the underlying hybrid infrastructure first.');
  const blockNumber = BigInt(view.blockNumber), source = getAddress(view.bundle.source), sourceCode = await client.getCode({ address: source, blockNumber });
  if (!sourceCode) throw new Error('Missing verified source.');
  const artifact = await get('contracts/out/GuardedHybridValuationSource.sol/GuardedHybridValuationSource.json');
  const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [source, keccak256(sourceCode), market.pythCodeHash, market.stateViewCodeHash] });
  const estimated = await client.estimateGas({ account: getAddress(view.controller), data, value: 0n, gasPrice: 0n });
  const gas = estimated * 12n / 10n, fee = gas * await client.getGasPrice();
  if ((await client.getBlock({ blockNumber })).hash !== view.blockHash) throw new Error('Chain changed during plan preparation.');
  const plan = { version: 'PUMPCOIN-VALUATION-GUARD-DEPLOYMENT-PLAN-v1', registrationId: id, chainId: 10143, from: view.controller, data, value: '0x0', gas: toHex(gas), estimatedFeeWei: String(fee),
    underlyingSource: source, underlyingCodeHash: keccak256(sourceCode), blockNumber: view.blockNumber, blockHash: view.blockHash,
    policy: { maxFeedSkewSeconds: 60, sampleDelaySeconds: 60, maxCheckpointAgeSeconds: 300, maxChangeBps: 300, recoveryToleranceBps: 100 },
    scope: 'Controller-reviewable deployment only; no submission or activation. After deployment, verify exact creation input/receipt/runtime and immutable pins. Prime two advancing checkpoints, then propose/apply the new valuation source through this vault’s configuration policy. Update reviewed worker and frontend source bindings before enabling investment or trading. The existing source and its history are preserved.' };
  await writeFile(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ saved: output, estimatedFeeWei: String(fee), submitted: false }));
}
main().catch(() => { console.error('Guard deployment preparation failed. Check reviewed public bindings, compiled artifact and RPC. No transaction submitted.'); process.exitCode = 1; });
