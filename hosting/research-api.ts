import { get,list,put } from '@vercel/blob';
import type { ServerResponse } from 'node:http';
import type { RegistrationRecord } from '../agent-registration/types.js';
import type { Checkpoint,ResearchView } from '../research/types.js';
import { verifyCheckpoint,selectCheckpoint } from '../research/checkpoint.js';
import { researchEngineDigest } from '../research/engine.js';
import { evaluate } from '../research/evaluation.js';

const cache=new Map<string,{until:number;value:Checkpoint[]}>(),pending=new Map<string,Promise<Checkpoint[]>>();
async function checkpoints(id:string){
  const saved=cache.get(id);if(saved&&saved.until>Date.now())return saved.value;
  const work=pending.get(id);if(work)return work;
  const task=(async()=>{if(!process.env.BLOB_READ_WRITE_TOKEN)return [];const result=await list({prefix:`research/${id}/`,limit:1000});if(result.hasMore)throw new Error('Published practice coverage exceeds the reader limit.');const bySession=new Map<string,Checkpoint[]>();
    for(const blob of result.blobs){const response=await get(blob.pathname,{access:'private',useCache:false});if(!response||response.statusCode!==200)throw new Error('A published checkpoint is unavailable.');if(blob.size>5000000)throw new Error('Published checkpoint exceeds the reader limit.');const c=JSON.parse(await new Response(response.stream).text()) as Checkpoint;const rows=bySession.get(c.session.id)??[];rows.push(c);bySession.set(c.session.id,rows);}
    return [...bySession.values()].map(rows=>selectCheckpoint(rows)!);})();pending.set(id,task);try{const value=await task;cache.set(id,{until:Date.now()+30000,value});return value;}finally{pending.delete(id);}
}
export async function hostedResearchRoute(res:ServerResponse,route:string,body:Record<string,any>,records:RegistrationRecord[]){
  const r=records.find(x=>x.id===body.id);if(!r)throw new Error('Select a published agent registration.');
  const send=(value:unknown)=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  if(route==='/research-publish'){
    if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('Hosted practice publication storage is not configured.');
    const c=await verifyCheckpoint(body.checkpoint,r),values=await checkpoints(r.id);
    const existing=values.find(x=>x.session.id===c.session.id);if(existing)selectCheckpoint([existing,c]);
    const path=`research/${r.id}/${c.session.id}/${c.hash}.json`,data=JSON.stringify(c);if(Buffer.byteLength(data)>5000000)throw new Error('Publish a bounded practice session checkpoint.');
    // Immutable content paths: concurrent forks are detected by readers; never overwrite a head.
    try{await put(path,data,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});}catch(error){const present=await get(path,{access:'private',useCache:false});if(!present||present.statusCode!==200||await new Response(present.stream).text()!==data)throw error;}
    cache.delete(r.id);send({published:c.hash});return;
  }
  const values=await checkpoints(r.id);for(const c of values)await verifyCheckpoint(c,r);
  if(route==='/research-state'){
    const unique=new Map(values.map(c=>[c.policy.hash,c.policy]));const view:ResearchView={registrationId:r.id,hosted:true,engineDigest:await researchEngineDigest(),capabilities:{ryo:false,ryoMapping:false,x:false,news:false,signer:false},policies:[...unique.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),sessions:values.map(c=>({...c.session,state:'stopped',message:'Published historical checkpoint. The hosted app cannot observe the local runtime.'})),latest:values.flatMap(c=>{const receipt=c.receipts.at(-1),evidence=c.evidence.at(-1)?.value;return receipt&&evidence?[{sessionId:c.session.id,receipt,evidence}]:[];}),errors:process.env.BLOB_READ_WRITE_TOKEN?[]:['Hosted practice publication storage is not configured.']};const paired=view.policies.find(p=>p.policy.strategies.length===2);if(paired)view.comparison=evaluate(paired,view.sessions,id=>{const c=values.find(v=>v.session.id===id)!;return c.receipts.map((receipt,i)=>({receipt,evidence:c.evidence[i].value}));});send({research:view});return;
  }
  const c=values.find(c=>c.session.id===body.sessionId);if(!c)throw new Error('No verified checkpoint published for this practice session.');
  if(route==='/research-export'){send({checkpoint:c});return;}
  if(route==='/research-history'){send({rows:c.receipts.map((receipt,i)=>({receipt,evidence:c.evidence[i].value})),events:c.events});return;}
  throw new Error('Local practice controls run on the operator computer.');
}
