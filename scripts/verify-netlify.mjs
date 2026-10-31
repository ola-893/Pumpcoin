import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base=(process.argv[2]??'https://pump-ryo.netlify.app').replace(/\/$/,'');
async function get(path,options){const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(60000)});const text=await r.text();assert.equal(r.status,200,`${path}: ${r.status} ${text.slice(0,250)}`);return JSON.parse(text);}
const health=await get('/api/health');assert.equal(health.ok,true);assert.equal(health.chainId,11155111);
const session=await get('/api/agent-registration/status');assert.equal(session.readOnly,true);assert.equal(session.configured,false);
const headers={'content-type':'application/json','x-pumpcoin-registration-token':session.token};
const published=await get('/api/agent-registration/records',{headers});
const expected=JSON.parse(await readFile('deployments/hosted-public.json','utf8'));assert.deepEqual(published.records,expected.records);
const [checkpoint]=JSON.parse(await readFile('deployments/hosted-research.json','utf8'));
const post=(route,body)=>get('/api/agent-registration/'+route,{method:'POST',headers,body:JSON.stringify(body)});
const {research}=await post('research-state',{id:checkpoint.session.registrationId});assert.equal(research.sessions[0].head,checkpoint.session.head);assert.equal(research.sessions[0].cycles,8);assert.equal(research.latest[0].receipt.hash,checkpoint.receipts.at(-1).hash);assert.equal(research.hosted,true);assert.equal(research.sessions[0].state,'stopped');
const history=await post('research-history',{id:checkpoint.session.registrationId,sessionId:checkpoint.session.id});assert.equal(history.rows.length,8);assert.deepEqual(history.events,checkpoint.events);
const exported=await post('research-export',{id:checkpoint.session.registrationId,sessionId:checkpoint.session.id});assert.deepEqual(exported.checkpoint,checkpoint);
const denied=await fetch(base+'/api/agent-registration/native-plan',{method:'POST',headers,body:JSON.stringify({id:checkpoint.session.registrationId,account:'',amount:'1',action:'deposit-mon'})});assert.equal(denied.status,409);
const pages=[];
for(const path of ['/','/agents','/agents/'+expected.records.find(r=>r.id===checkpoint.session.registrationId).localAgentId,'/evidence','/register']){const r=await fetch(base+path);assert.equal(r.status,200);const html=await r.text();assert.match(html,/<div id="root">/);pages.push(path);}
const report={checkedAt:new Date().toISOString(),url:base,health,signedRegistrationVersions:published.records.length,research:{registrationId:checkpoint.session.registrationId,checkpointHash:checkpoint.hash,head:research.sessions[0].head,cycles:8,historyMatches:true,exportMatches:true,hosted:true,runtime:'published historical checkpoint'},routesVerified:pages,transactionReviewsDisabled:denied.status===409};
await mkdir('.local',{recursive:true});await writeFile('.local/netlify-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
