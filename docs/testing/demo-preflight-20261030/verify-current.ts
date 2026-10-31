import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readDirectory} from '../../../app/src/lib/agent-directory.js';
import {verifyCheckpoint} from '../../../research/checkpoint.js';
import {verifyPolicy} from '../../../research/policy.js';
import {researchEngineDigest} from '../../../research/engine.js';
const json=async(name:string)=>JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));
const registration=await json('fresh-registration.json'),checkpoint=await json('fresh-checkpoint.json'),inventory=await json('strategy-artifacts.json');
await readDirectory({records:[registration]});
await verifyPolicy(checkpoint.policy);
assert.equal(await researchEngineDigest(),inventory.engineDigest);
for(const artifact of inventory.artifacts){
 const bytes=await readFile(new URL('../../../'+artifact.path,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256,artifact.path);
}
await verifyCheckpoint(checkpoint,registration);
console.log(JSON.stringify({verified:true,registration:registration.id,policy:checkpoint.policy.hash,checkpoint:checkpoint.hash,cycles:checkpoint.receipts.length,errors:checkpoint.session.errors,proposals:checkpoint.receipts.filter((r:any)=>r.body.trace).length,cash:checkpoint.session.portfolio.cash,positions:checkpoint.session.portfolio.positions.length,pending:checkpoint.session.portfolio.pending.length,scope:'Signature, source normalization, exact prompt and deterministic ledger replay. Does not independently prove provider truth, collection completeness, actual model execution or funded performance.'},null,2));
