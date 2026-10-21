import { inferenceEndpoint, detectLocalModel } from '../local-inference/discovery.js';
import { matchingDetection } from '../agent-registration/worker.js';
import type { Prepared } from '../agent-registration/core.js';
import { validateInterpretation } from './signals.js';
import { researchRequest,interpretationEvidence } from './request.js';
import type { Evidence, Policy, Strategy, Trace } from './types.js';

const queues=new Map<string,Promise<unknown>>();
export async function serialized<T>(endpoint:string,run:()=>Promise<T>):Promise<T>{const previous=queues.get(endpoint)??Promise.resolve();const current=previous.catch(()=>{}).then(run);queues.set(endpoint,current);try{return await current;}finally{if(queues.get(endpoint)===current)queues.delete(endpoint);}}
export async function researchInference(prepared:Prepared,policy:Policy,strategy:Strategy,evidence:Evidence):Promise<Trace>{
  const endpoint=inferenceEndpoint(prepared.privateRuntimeConfig.inferenceBaseURL).href;
  return serialized(endpoint,async()=>{
    matchingDetection(prepared,await detectLocalModel(endpoint,()=>{}));
    const request=researchRequest(prepared.manifest.model.id,policy,strategy,evidence);
    const startedAt=new Date().toISOString();
    const response=await fetch(new URL('/v1/chat/completions',endpoint),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),redirect:'error',signal:AbortSignal.timeout(90000)});
    if(!response.ok||!response.body)throw new Error('Local research inference is unavailable.');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072)throw new Error('Local research output is too large.');chunks.push(value);}}finally{await reader.cancel();}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8')),choice=result.choices?.[0];
    if(result.model!==prepared.manifest.model.id||result.choices.length!==1||choice.finish_reason!=='stop'||choice.message.tool_calls?.length||typeof choice.message.content!=='string')throw new Error('Local research output is incomplete or inconsistent.');
    const rawContent=choice.message.content,interpretation=validateInterpretation(JSON.parse(rawContent),interpretationEvidence(evidence,policy,strategy));
    matchingDetection(prepared,await detectLocalModel(endpoint,()=>{}));
    return {request,response:result,rawContent,interpretation,model:result.model,startedAt,finishedAt:new Date().toISOString()};
  });
}
