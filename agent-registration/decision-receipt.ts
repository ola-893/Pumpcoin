import { getAddress, keccak256, recoverMessageAddress, stringToHex, type Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { checkedPrepared, checkAuthorizations, type Prepared } from './core.js';
import { autonomousAbi, autonomousDeployment, tradeArguments, tradingSnapshot, type AutonomousDeployment, type TradeSnapshot } from './autonomous.js';
import { guardedProposal, inferenceRequest, inferTrace, LIVE_PURPOSE, type InferenceTrace } from './worker.js';
import { identityURI } from './binding.js';
import { parseAbi } from 'viem';
import { committedTradeData } from './trade-commitment.js';
import type { RegistrationRecord, Proposal } from './types.js';

export type DecisionBody = {
  version: 'PUMPCOIN-DECISION-v1'; guardVersion: 'PUMPCOIN-SPOT-GUARD-v1'; tradeBuilderVersion: 'PUMPCOIN-SPOT-TRADE-v1'; evidence: 'operator-signed-not-attested' | 'injected-test-proposal';
  registrationId: Hex; manifestCommitment: Hex; chainId: number; vault: string; executionKey: string;
  sequence: number; previousHash: Hex | null; model: Prepared['manifest']['model']; strategyDigest: string;
  snapshot: { blockNumber: string; blockHash: Hex; timestamp: string; price: string; configHash: Hex;
    input: TradeSnapshot['input']; cash: string; positions: string; permission: [string, number, string, string, string]; spent: string };
  inference: InferenceTrace; guardedProposal: Proposal; tradeData: Hex | null;
};
export type DecisionReceipt = { body: DecisionBody; hash: Hex; signature: Hex };
export type DecisionBundle = { version: 'PUMPCOIN-DECISION-BUNDLE-v1'; registration: RegistrationRecord;
  deployment: Omit<AutonomousDeployment, 'rpcUrl'>; receipts: DecisionReceipt[];
  transactions: { decisionHash: Hex; transactionHash: Hex }[]; scope: string };

/** A deliberately narrow canonical encoding: JSON primitives, arrays and sorted object keys. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  throw new Error('Unsupported decision encoding.');
}
export const decisionHash = (body: DecisionBody): Hex => keccak256(stringToHex(canonical(body)));
const message = (hash: Hex) => `PumpCoin decision receipt v1\nCommitment: ${hash}\nScope: operator assertion; no host attestation or trading permission.`;
export function encodeSnapshot(s: TradeSnapshot): DecisionBody['snapshot'] {
  return { blockNumber: String(s.blockNumber), blockHash: s.blockHash, timestamp: String(s.timestamp), price: String(s.price), configHash: s.configHash,
    input: s.input, cash: String(s.cash), positions: String(s.positions), permission: [String(s.permission[0]), s.permission[1], String(s.permission[2]), String(s.permission[3]), String(s.permission[4])], spent: String(s.spent) };
}
export function decodeSnapshot(s: DecisionBody['snapshot']): TradeSnapshot {
  const integers = [s.blockNumber, s.timestamp, s.price, s.cash, s.positions, s.spent, ...s.permission.filter((_, i) => i !== 1)];
  if (integers.some(x => typeof x !== 'string' || !/^(0|[1-9]\d{0,77})$/.test(x)) || s.price === '0' || s.permission.length !== 5 || !Number.isInteger(s.permission[1]) || s.permission[1] < 0 || s.permission[1] > 1000
    || !/^0x[0-9a-f]{64}$/.test(s.blockHash) || !/^0x[0-9a-f]{64}$/.test(s.configHash) || s.input.fresh !== true || s.input.valued !== true || s.input.cashQuoteUnits !== s.cash || !/^(0|[1-9]\d{0,18})$/.test(s.input.positionQuoteUnits)) throw new Error('Invalid decision snapshot.');
  return { ...s, blockNumber: BigInt(s.blockNumber), timestamp: BigInt(s.timestamp), price: BigInt(s.price), cash: BigInt(s.cash), positions: BigInt(s.positions), spent: BigInt(s.spent),
    permission: [BigInt(s.permission[0]), s.permission[1], BigInt(s.permission[2]), BigInt(s.permission[3]), BigInt(s.permission[4])] };
}
export async function signDecision(p: Prepared, c: AutonomousDeployment, registrationId: Hex, snapshot: TradeSnapshot,
  inference: InferenceTrace, account: PrivateKeyAccount, sequence: number, previousHash: Hex | null, injected = false): Promise<DecisionReceipt> {
  const args = tradeArguments(p, c, snapshot, inference.rawProposal);
  const body: DecisionBody = { version: 'PUMPCOIN-DECISION-v1', guardVersion: 'PUMPCOIN-SPOT-GUARD-v1', tradeBuilderVersion: 'PUMPCOIN-SPOT-TRADE-v1', evidence: injected ? 'injected-test-proposal' : 'operator-signed-not-attested',
    registrationId, manifestCommitment: p.commitment, chainId: c.chainId, vault: c.vault, executionKey: p.manifest.executionKey,
    sequence, previousHash, model: p.manifest.model, strategyDigest: p.manifest.strategy.codeDigest, snapshot: encodeSnapshot(snapshot), inference,
    guardedProposal: guardedProposal(inference.rawProposal, snapshot.input, p), tradeData: args ? committedTradeData(autonomousAbi, args) : null };
  const hash = decisionHash(body);
  return { body, hash, signature: await account.signMessage({ message: message(hash) }) };
}
export async function verifyDecision(receipt: DecisionReceipt, p: Prepared, c: AutonomousDeployment, registrationId: Hex) {
  const b = receipt.body;
  if (canonical(receipt).length > 65536 || b.version !== 'PUMPCOIN-DECISION-v1' || b.guardVersion !== 'PUMPCOIN-SPOT-GUARD-v1' || b.tradeBuilderVersion !== 'PUMPCOIN-SPOT-TRADE-v1' || !['operator-signed-not-attested', 'injected-test-proposal'].includes(b.evidence) || b.registrationId !== registrationId || b.manifestCommitment !== p.commitment || b.chainId !== c.chainId || b.vault !== c.vault || b.executionKey !== p.manifest.executionKey || canonical(b.model) !== canonical(p.manifest.model) || b.strategyDigest !== p.manifest.strategy.codeDigest
      || !Number.isSafeInteger(b.sequence) || b.sequence < 1 || (b.previousHash !== null && !/^0x[0-9a-f]{64}$/.test(b.previousHash)) || decisionHash(b) !== receipt.hash) throw new Error('Decision commitment or registration mismatch.');
  if ((await recoverMessageAddress({ message: message(receipt.hash), signature: receipt.signature })).toLowerCase() !== p.manifest.executionKey.toLowerCase()) throw new Error('Decision signer mismatch.');
  const snapshot = decodeSnapshot(b.snapshot);
  if (canonical(b.inference.request) !== canonical(inferenceRequest(p, snapshot.input, LIVE_PURPOSE)) || canonical(JSON.parse(b.inference.rawContent)) !== canonical(b.inference.rawProposal)
      || canonical(guardedProposal(b.inference.rawProposal, snapshot.input, p)) !== canonical(b.guardedProposal)) throw new Error('Inference request, output or guard replay mismatch.');
  const args = tradeArguments(p, c, snapshot, b.inference.rawProposal);
  if (b.tradeData !== (args ? committedTradeData(autonomousAbi, args) : null)) throw new Error('Trade construction replay mismatch.');
  return snapshot;
}
export async function verifyBundle(bundle: DecisionBundle, rpcUrl?: string, client?: any) {
  if (bundle.version !== 'PUMPCOIN-DECISION-BUNDLE-v1' || !Array.isArray(bundle.receipts) || bundle.receipts.length > 10000 || !Array.isArray(bundle.transactions) || bundle.transactions.length > bundle.receipts.length) throw new Error('Invalid decision bundle.');
  const r = bundle.registration;
  const p = checkedPrepared({ manifest: r.manifest, commitment: r.commitment, privateRuntimeConfig: { inferenceBaseURL: 'http://127.0.0.1:8080' } });
  if (r.commitment !== r.authorization.challenge.commitment || r.manifest.controller !== r.authorization.challenge.controller || r.manifest.executionKey !== r.authorization.challenge.executionKey || r.id !== keccak256(stringToHex(r.authorization.challenge.id))) throw new Error('Invalid registration binding.');
  await checkAuthorizations(r.authorization.challenge, r.authorization.controllerSignature, r.authorization.executionSignature, r.authorization.challenge.expiresAt - 1);
  const c = autonomousDeployment({ ...bundle.deployment, rpcUrl: rpcUrl ?? (bundle.deployment.chainId === 31337 ? 'http://127.0.0.1:8545' : 'https://testnet-rpc.monad.xyz') });
  if (r.authorization.challenge.chainId !== c.chainId || r.binding?.vault !== c.vault || r.binding.identityRegistry !== c.identityRegistry) throw new Error('Bundle deployment differs from the registration.');
  if (c.chainId === 10143 && c.identityRegistry !== '0x8004A818BFB912233c491871b3d84c89A494BD9e') throw new Error('Monad identity is not the maintainers-listed testnet registry.');
  if (rpcUrl && !client) { const { autonomousClient } = await import('./autonomous.js'); client = autonomousClient(c); }
  let previous: Hex | null = null, next = 1;
  const byHash = new Map<Hex, DecisionReceipt>();
  for (const receipt of bundle.receipts) {
    if (receipt.body.sequence !== next++ || receipt.body.previousHash !== previous || byHash.has(receipt.hash)) throw new Error('Decision chain gap, duplicate or reordered receipt.');
    const snapshot = await verifyDecision(receipt, p, c, r.id);
    if (client) {
      // Reuse production checks, but force every read to the receipt's historical block.
      const historical = new Proxy(client, { get(target, key) { if (key === 'getBlock') return (args?: any) => target.getBlock(args?.blockNumber !== undefined ? args : { blockNumber: snapshot.blockNumber }); return Reflect.get(target, key); } });
      const actual = await tradingSnapshot(p, c, historical);
      const registryABI = parseAbi(['function tokenURI(uint256) view returns(string)']);
      const identityABI = parseAbi(['function agentId() view returns(uint256)']);
      const [agentId, uri] = await Promise.all([
        client.readContract({address:c.vault,abi:identityABI,functionName:'agentId',blockNumber:snapshot.blockNumber}),
        client.readContract({address:c.identityRegistry,abi:registryABI,functionName:'tokenURI',args:[BigInt(r.binding!.agentId)],blockNumber:snapshot.blockNumber}),
      ]);
      if (agentId !== BigInt(r.binding!.agentId) || uri !== identityURI(p)) throw new Error('Historical identity binding differs from the published manifest.');

      if (canonical(encodeSnapshot(actual)) !== canonical(receipt.body.snapshot)) throw new Error('Recorded snapshot differs from canonical chain state.');
    }
    previous = receipt.hash; byHash.set(receipt.hash, receipt);
  }
  const seen = new Set<Hex>();
  for (const link of bundle.transactions) {
    const receipt = byHash.get(link.decisionHash);
    if (!receipt?.body.tradeData || seen.has(link.decisionHash) || !/^0x[0-9a-f]{64}$/.test(link.transactionHash)) throw new Error('Invalid decision transaction link.');
    seen.add(link.decisionHash);
    if (client) {
      const [tx, mined] = await Promise.all([client.getTransaction({ hash: link.transactionHash }), client.getTransactionReceipt({ hash: link.transactionHash })]);
      const expectedData = `${receipt.body.tradeData}50434431${receipt.hash.slice(2)}`;
      if (tx.hash !== link.transactionHash || tx.chainId !== c.chainId || mined.transactionHash !== tx.hash || tx.from.toLowerCase() !== cased(receipt.body.executionKey) || tx.to?.toLowerCase() !== cased(c.vault) || (tx.value ?? 0n) !== 0n || tx.input !== expectedData || mined.blockNumber < BigInt(receipt.body.snapshot.blockNumber) || (await client.getBlock({ blockNumber: mined.blockNumber })).hash !== mined.blockHash) throw new Error('Trade transaction does not anchor this decision on the canonical chain.');
    }
  }
  return { decisions: bundle.receipts.length, linkedTransactions: bundle.transactions.length, chainChecked: !!client, tip: previous,
    scope: client ? 'Signatures, guard/trade replay, historical chain snapshots and linked transaction commitments checked against the supplied RPC. Model execution and completeness remain unproven.' : 'Signatures and deterministic guard/trade replay checked offline. Chain state, publication, model execution and completeness remain unproven.' };
}
const cased = (value: string) => getAddress(value).toLowerCase();

export async function replayInference(receipt: DecisionReceipt, p: Prepared, fetcher = fetch) {
  if (receipt.body.evidence !== 'operator-signed-not-attested') throw new Error('Injected proposals cannot be replayed as model inference.');
  const trace = await inferTrace(p, receipt.body.snapshot.input, fetcher, LIVE_PURPOSE);
  return { matches: canonical(trace.rawProposal) === canonical(receipt.body.inference.rawProposal), proposal: trace.rawProposal,
    scope: 'Re-execution comparison, not proof of the original host execution. Hardware/runtime differences may change model output.' };
}
