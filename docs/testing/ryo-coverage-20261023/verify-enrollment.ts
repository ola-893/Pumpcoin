import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { keccak256, stringToHex } from 'viem';
import { checkAuthorizations } from '../../../agent-registration/core.js';
import type { RegistrationRecord } from '../../../agent-registration/types.js';

// Offline consistency verification only: no model call, private runtime config or chain RPC.
const root=new URL('../../../',import.meta.url);
const {registration:r}=JSON.parse(await readFile(new URL('muse-sepolia-registration.json',import.meta.url),'utf8')) as {registration:RegistrationRecord};
const c=r.authorization.challenge,w=r.worker,m=r.manifest;
assert.equal(keccak256(stringToHex(JSON.stringify(m))),r.commitment);
assert.equal(c.commitment,r.commitment);
assert.equal(c.controller,m.controller);assert.equal(c.executionKey,m.executionKey);
assert.equal(r.id,keccak256(stringToHex(c.id)));
assert.equal(r.localAgentId,keccak256(stringToHex(JSON.stringify([c.chainId,m.controller,m.name]))));
assert.equal(m.vaultPolicy?.chainId,c.chainId);
await checkAuthorizations(c,r.authorization.controllerSignature,r.authorization.executionSignature,Date.parse(r.registeredAt));
assert.equal(w.model,m.model.id);assert.equal(w.weightsDigest,m.model.weightsDigest);assert.equal(w.runtimeDigest,m.model.runtimeDigest);
assert(Date.parse(w.checkedAt)<=Date.parse(r.registeredAt));
// Independently recompute the bounded spot result from stored synthetic inputs.
function boundedAction(proposal:typeof w.rawProposal,input:typeof w.input){
  const quantity=BigInt(proposal.quoteUnits),cash=BigInt(input.cashQuoteUnits),position=BigInt(input.positionQuoteUnits);
  const acceptable=input.fresh&&input.valued&&quantity>0n&&quantity<=BigInt(m.proposedMandate.perTradeQuoteUnits)&&
    (proposal.action==='BUY'?quantity<=cash&&position+quantity<=BigInt(m.proposedMandate.maxPositionQuoteUnits):proposal.action==='SELL'&&quantity<=position);
  return acceptable?proposal:{action:'HOLD',quoteUnits:'0'};
}
assert.deepEqual(boundedAction(w.rawProposal,w.input),w.guardedProposal);
for(const s of w.scenarios??[])assert.deepEqual(boundedAction(s.rawProposal,s.input),s.guardedProposal);
for(const g of w.guardChallenges??[]){assert.deepEqual(boundedAction(g.proposal,g.input),g.result);assert.deepEqual(g.result,g.expected);}
assert.equal(w.receiptHash,keccak256(stringToHex(JSON.stringify({commitment:r.commitment,input:w.input,raw:w.rawProposal,output:w.guardedProposal,scenarios:w.scenarios,guardChallenges:w.guardChallenges}))));
const codeBytes=await readFile(new URL('muse-sepolia-code-manifest.json',import.meta.url));
assert.equal(`sha256:${createHash('sha256').update(codeBytes).digest('hex')}`,m.strategy.codeDigest);
const code=JSON.parse(codeBytes.toString('utf8'));
const changedSourceArtifacts:string[]=[];
for(const artifact of code.artifacts){assert(/^[a-zA-Z0-9_./-]+$/.test(artifact.path)&&!artifact.path.startsWith('/')&&!artifact.path.split('/').includes('..'));if(createHash('sha256').update(await readFile(new URL(artifact.path,root))).digest('hex')!==artifact.sha256)changedSourceArtifacts.push(artifact.path);}
if(process.argv.includes('--require-current-code'))assert.equal(changedSourceArtifacts.length,0,'Current checkout differs from the historical enrollment code manifest.');
console.log(JSON.stringify({verified:true,registration:r.id,chainId:c.chainId,signatures:2,recordedSyntheticInferences:1+(w.scenarios?.length??0),deterministicGuards:w.guardChallenges?.length,sourceArtifacts:code.artifacts.length,currentCheckoutMatchesEnrollment:changedSourceArtifacts.length===0,changedSourceArtifacts,scope:'Historical signatures, manifest/source commitments and stored synthetic guard/receipt consistency. Does not independently attest inference execution, provider truth, private configuration, public-chain identity or live performance.'},null,2));
