// Read-only inventory: no credentials, private registration fields, prompts or keys are exported.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { sourceConfig,researchSources } from '../../../research/providers.js';
import { researchEngineDigest } from '../../../research/engine.js';
const origin='http://127.0.0.1:5173',counts:Record<string,number>={};
if(existsSync('.local/research/pump.sqlite')){const db=new DatabaseSync('.local/research/pump.sqlite',{readOnly:true});try{for(const table of ['policies','sessions','evidence','decisions','events'])counts[table]=(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;}finally{db.close();}}
const status=await fetch(origin+'/api/agent-registration/status').then(r=>r.json()) as {token:string};
const headers={'X-PumpCoin-Registration-Token':status.token,'Content-Type':'application/json',Origin:origin};
const records=await fetch(origin+'/api/agent-registration/records',{headers}).then(r=>r.json()) as {records:any[]};
const record=records.records.find(r=>r.manifest.name==='Gemma Demo');if(!record)throw new Error('Existing Gemma Demo registration not found.');
const response=await fetch(origin+'/api/agent-registration/research-state',{method:'POST',headers,body:JSON.stringify({id:record.id})});if(!response.ok)throw new Error('Research API did not provide state.');
const {research}=await response.json() as {research:any};
const output={collectedAt:new Date().toISOString(),classification:'AUTHENTIC LOCAL STATE INVENTORY — NO LIVE RESEARCH RESULTS',engineDigest:await researchEngineDigest(),configured:researchSources(await sourceConfig()).capabilities,counts,agent:{name:record.manifest.name,registrationId:record.id,manifestCommitment:record.commitment},api:{hosted:research.hosted,capabilities:research.capabilities,policies:research.policies.length,sessions:research.sessions.length,latest:research.latest.length,comparison:research.comparison??null,errors:research.errors}};
await writeFile(new URL('./observed-state.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
