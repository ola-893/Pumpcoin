import { verifyWeightsPublication } from './model-publication.js';
import { mkdir, readFile, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getAddress, keccak256, parseAbi, type Hex } from 'viem';
import { registrationService } from './service.js';
import { permissionStatus } from './permissions.js';
import { vaultClient, type VaultNetwork } from './vault-setup.js';
import { identityURI } from './binding.js';
import { verifyBundle, verifyDecision, replayInference, type DecisionBundle, type DecisionReceipt } from './decision-receipt.js';
import type { WorkerConfig } from './run-autonomous.js';
import type { Prepared } from './core.js';
import type { RegistrationRecord } from './types.js';
import { checkLocalWorker } from './worker.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function currentIdentityEvidence(record: RegistrationRecord, p: Prepared, c: VaultNetwork, client: any = vaultClient(c)) {
  if (!record.binding || record.binding.chainId !== c.chainId || record.binding.identityRegistry !== c.identityRegistry) throw new Error('Registration has no matching registry binding.');
  const status = await permissionStatus(p, record.binding.vault, c, client), blockNumber = BigInt(status.blockNumber);
  const block = await client.getBlock({ blockNumber });
  const registryAbi = parseAbi(['function ownerOf(uint256) view returns(address)', 'function tokenURI(uint256) view returns(string)']);
  const vaultAbi = parseAbi(['function identityRegistry() view returns(address)', 'function agentId() view returns(uint256)']);
  const id = BigInt(record.binding.agentId);
  const [owner, uri, registry, boundId, code] = await Promise.all([
    client.readContract({ address: c.identityRegistry, abi: registryAbi, functionName: 'ownerOf', args: [id], blockNumber }),
    client.readContract({ address: c.identityRegistry, abi: registryAbi, functionName: 'tokenURI', args: [id], blockNumber }),
    client.readContract({ address: record.binding.vault, abi: vaultAbi, functionName: 'identityRegistry', blockNumber }),
    client.readContract({ address: record.binding.vault, abi: vaultAbi, functionName: 'agentId', blockNumber }),
    client.getCode({ address: c.identityRegistry, blockNumber }),
  ]);
  if (getAddress(owner) !== p.manifest.controller || uri !== identityURI(p) || registry !== c.identityRegistry || boundId !== id || (await client.getBlock({ blockNumber })).hash !== block.hash) throw new Error('Current identity owner, manifest, vault binding or canonical block changed.');
  return { name: p.manifest.name, registrationId: record.id, chainId: c.chainId, registry: c.identityRegistry,
    maintainersListedMonadRegistry: c.chainId === 10143 && c.identityRegistry === '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    registryCodeHash: keccak256(code), registryImplementation: c.identityImplementation ?? null, registryImplementationCodeHash: c.identityImplementationCodeHash ?? null,
    agentId: String(id), vault: record.binding.vault, controller: p.manifest.controller, executionKey: p.manifest.executionKey,
    manifestCommitment: p.commitment, uriMatches: true, ownerMatches: true, vaultBindingMatches: true, configHash: status.configHash,
    blockNumber: String(blockNumber), blockHash: block.hash, checkedAt: new Date().toISOString(),
    scope: 'Public registry ownership, published signed manifest, reviewed vault authority and identity binding checked at this block. Configured runtime pins and RPC are trust boundaries. Does not attest model execution, profitability or investment readiness.' };
}

export async function exportDecisions(config: WorkerConfig, registrations: string, workers: string): Promise<DecisionBundle> {
  const { record, prepared } = await registrationService({ directory: registrations }).workerRegistration(config.registrationId);
  const name = `${config.deployment.chainId}-${config.deployment.vault.toLowerCase()}`;
  const journal = JSON.parse(await readFile(join(workers, `${name}.json`), 'utf8'));
  const expectedScope = JSON.stringify([config.deployment.chainId, config.deployment.vault, config.registrationId, prepared.manifest.executionKey]);
  if (journal.scope !== expectedScope || !Number.isSafeInteger(journal.decisionCount) || journal.decisionCount < 1 || journal.decisionCount > 10000) throw new Error('No valid decision checkpoint is available for this deployment.');
  const receipts: DecisionReceipt[] = []; let hash: Hex | null = journal.lastDecisionHash;
  for (let sequence = journal.decisionCount; sequence > 0; sequence--) {
    if (!hash || !/^0x[0-9a-f]{64}$/.test(hash)) throw new Error('Decision chain checkpoint is invalid.');
    const receipt: DecisionReceipt = JSON.parse(await readFile(join(workers, 'decisions', name, `${hash.slice(2)}.json`), 'utf8'));
    await verifyDecision(receipt, prepared, config.deployment, record.id);
    if (receipt.hash !== hash || receipt.body.sequence !== sequence) throw new Error('Decision chain checkpoint mismatch.');
    receipts.unshift(receipt); hash = receipt.body.previousHash;
  }
  if (hash !== null) throw new Error('Decision chain does not start at sequence one.');
  const transactions = (journal.receipts ?? []).filter((x: any) => x.decisionHash).map((x: any) => ({ decisionHash: x.decisionHash, transactionHash: x.hash }));
  if (journal.pending?.decisionHash) transactions.push({ decisionHash: journal.pending.decisionHash, transactionHash: journal.pending.hash });
  const { rpcUrl: _privateRPC, ...deployment } = config.deployment;
  const bundle: DecisionBundle = { version: 'PUMPCOIN-DECISION-BUNDLE-v1', registration: record, deployment, receipts, transactions,
    scope: 'Public receipt fields only. Private inference URLs, signer material, signed raw transactions and unlock secrets are excluded. Covers the selected journal checkpoint; completeness before/after that checkpoint and host execution are unproven.' };
  await verifyBundle(bundle);
  return bundle;
}
async function savePublic(path: string, value: unknown) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
}
export async function evidenceCLI(args: string[]) {
  const [action, input, output, extra] = args;
  if (action === 'verify' && input) {
    const bundle = JSON.parse(await readFile(input, 'utf8'));
    console.log(JSON.stringify(await verifyBundle(bundle, output), null, 2)); return;
  }
  if (action === 'export' && input && output) {
    const config = JSON.parse(await readFile(input, 'utf8'));
    await savePublic(output, await exportDecisions(config, join(root, '.local/agent-registrations'), join(root, '.local/autonomous-workers'))); return;
  }
  if (action === 'replay' && input && output && extra) {
    const bundle: DecisionBundle = JSON.parse(await readFile(input, 'utf8')); await verifyBundle(bundle);
    const receipt = bundle.receipts.find(r => r.hash === extra); if (!receipt) throw new Error('Receipt is not in the bundle.');
    const prepared = { manifest: bundle.registration.manifest, commitment: bundle.registration.commitment, privateRuntimeConfig: { inferenceBaseURL: output } };
    // Remeasure the loopback model before and after the replay; no hosted replay route.
    const { detectLocalModel } = await import('../local-inference/discovery.js'); const { matchingDetection } = await import('./worker.js');
    const first = await detectLocalModel(output, () => {}); matchingDetection(prepared, first);
    const result = await replayInference(receipt, prepared);
    const last = await detectLocalModel(output, () => {}); matchingDetection(prepared, last);
    if (JSON.stringify(first.runtimeManifest) !== JSON.stringify(last.runtimeManifest)) throw new Error('Replay runtime changed.');
    console.log(JSON.stringify(result, null, 2)); return;
  }
  if (action === 'publication' && input && output) {
    const { record, prepared } = await registrationService({ directory: join(root, '.local/agent-registrations') }).workerRegistration(input);
    const { detectLocalModel } = await import('../local-inference/discovery.js'); const { matchingDetection } = await import('./worker.js');
    const detected = await detectLocalModel(prepared.privateRuntimeConfig.inferenceBaseURL, () => {}); matchingDetection(prepared, detected);
    await savePublic(output, { registrationId: record.id, manifestCommitment: record.commitment, publication: await verifyWeightsPublication(prepared, detected.weightsBytes), localMeasurement: { checkedAt: detected.checkedAt, weightsDigest: `sha256:${detected.weightsHash}`, runtimeDigest: `sha256:${detected.runtimeHash}` } });
    console.log(JSON.stringify({ saved: output, action })); return;
  }
  if ((action === 'identity' || action === 'worker-check') && input && output) {
    const service = registrationService({ directory: join(root, '.local/agent-registrations') });
    const { record, prepared } = await service.workerRegistration(input);
    const result = action === 'identity'
      ? await currentIdentityEvidence(record, prepared, JSON.parse(await readFile(join(root, 'deployments/pumpcoin-vault-network.json'), 'utf8')))
      : { registrationId: record.id, manifestCommitment: record.commitment, check: await checkLocalWorker(prepared), scope: 'Supplemental current paper check. Historical registration is preserved. No transactions submitted.' };
    await savePublic(output, result); console.log(JSON.stringify({ saved: output, action })); return;
  }
  throw new Error('Usage: evidence identity|worker-check|publication <registration-id> <new-output.json>; export <worker-config.json> <new-bundle.json>; verify <bundle.json> [rpc-url]; replay <bundle.json> <loopback-url> <decision-hash>');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await evidenceCLI(process.argv.slice(2)); }
  catch { console.error('Evidence verification failed. Inspect public inputs, checkpoint coverage, RPC availability and artifact pins. No transaction was submitted.'); process.exitCode = 1; }
}
