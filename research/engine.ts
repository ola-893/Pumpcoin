import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files=['engine.ts','types.ts','encoding.ts','policy.ts','signals.ts','decision.ts','request.ts','inference.ts','providers.ts','ryo-contract.ts','normalization.ts','evidence.ts','service.ts','store.ts','checkpoint.ts','evaluation.ts','../practice/ledger.ts'];
export async function researchEngineDigest(){const artifacts=await Promise.all(files.map(async name=>({name,sha256:createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex')})));return `sha256:${createHash('sha256').update(JSON.stringify(artifacts)).digest('hex')}`;}
