import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configuredSigner } from '../agent-registration/signer.js';
import { registrationService } from '../agent-registration/service.js';
import { ResearchStore } from './store.js';
import { researchService } from './service.js';
import { verifyCheckpoint } from './checkpoint.js';
import { researchSources,sourceConfig } from './providers.js';
import { digest } from './encoding.js';
import type { Checkpoint } from './types.js';

const [command,id,sessionId,output]=process.argv.slice(2);
const registrations=registrationService({directory:resolve('.local/agent-registrations')});
if(command==='sources'){
  const sources=researchSources(await sourceConfig());console.log(JSON.stringify({configured:sources.capabilities},null,2));
  if(process.argv.includes('--discover'))console.log(JSON.stringify(await sources.discover(),null,2));
  const check=process.argv.indexOf('--check-symbol');if(check>=0){const evidence=await sources.check(process.argv[check+1]);const out=process.argv.indexOf('--output');if(out>=0){const file=process.argv[out+1];if(!file)throw new Error('Provide a new output path.');await writeFile(file,JSON.stringify({scope:'Unsigned source preflight; not an agent decision or performance record',evidence},null,2)+'\n',{flag:'wx',mode:0o600});}console.log(JSON.stringify({scope:'Unsigned source preflight; no model inference or ledger update',capturedAt:evidence.capturedAt,markets:evidence.markets.length,posts:evidence.posts.length,rawCaptures:evidence.raw.length,sources:evidence.sources},null,2));}
}else if(command==='verify'){
  const c=JSON.parse(await readFile(id,'utf8')) as Checkpoint,record=(await registrations.records()).find(r=>r.id===c.session.registrationId);
  if(!record)throw new Error('The checkpoint registration is not known to this operator.');await verifyCheckpoint(c,record);console.log(JSON.stringify({verified:true,mode:c.session.mode,decisions:c.session.sequence,head:c.session.head,checkpoint:c.hash,scope:'Stored interpretation, signal, guards, event and portfolio replay; not a fresh inference or model-execution attestation.'},null,2));
}else{
  const signer=await configuredSigner(),store=new ResearchStore(resolve('.local/research/pump.sqlite'));
  const service=researchService({store,resolve:registrationId=>registrations.researchPrepared(registrationId),signerConfigured:!!signer,sign:async(record,message)=>{if(!signer)throw new Error('Configure the execution signer.');const account=await signer.account(record.manifest.controller,record.manifest.name);if(account.address!==record.manifest.executionKey)throw new Error('Execution key mismatch.');return account.signMessage({message});}});
  try{
    if(command==='status')console.log(JSON.stringify(await service.view(id),null,2));
    else if(command==='once') {await service.run(id,sessionId);const view=await service.view(id);console.log(JSON.stringify(view,null,2));if(view.sessions.find(s=>s.id===sessionId)?.state==='error')process.exitCode=1;}
    else if(command==='watch'){
      await service.start(id,sessionId);console.log('Practice worker started. Press Ctrl-C to stop. No chain transactions are sent.');
      await new Promise<void>(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});await service.stop(id,sessionId);
    }else if(command==='export'){
      if(!output)throw new Error('Provide a new output JSON file path.');const c=await service.bundle(id,sessionId);await writeFile(output,JSON.stringify(c,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({file:output,hash:c.hash,sequence:c.session.sequence}));
    }else if(command==='publish'){
      const file=id,base=sessionId,c=JSON.parse(await readFile(file,'utf8')) as Checkpoint,record=(await registrations.records()).find(r=>r.id===c.session.registrationId);if(!record)throw new Error('Unknown agent registration.');await verifyCheckpoint(c,record);
      const u=new URL(base);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('Use the exact hosted Pump HTTPS origin.');
      const json=JSON.stringify({id:c.session.registrationId,checkpoint:c});if(Buffer.byteLength(json)>5000000)throw new Error('Checkpoint exceeds the hosted upload limit.');
      const status=await fetch(new URL('/api/agent-registration/status',u),{redirect:'error',signal:AbortSignal.timeout(20000)});if(!status.ok)throw new Error('Hosted session is unavailable.');const {token}=await status.json() as {token:string};
      const response=await fetch(new URL('/api/agent-registration/research-publish',u),{method:'POST',headers:{'Content-Type':'application/json','X-PumpCoin-Registration-Token':token,Origin:u.origin},body:json,redirect:'error',signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error('Checkpoint publication failed. No replacement history was uploaded.');console.log(JSON.stringify({published:c.hash,registration:c.session.registrationId,bytes:Buffer.byteLength(json),digest:digest(c)}));
    }else throw new Error('Usage: agent:research sources [--discover] | status <registration> | once <registration> <session> | watch <registration> <session> | export <registration> <session> <new-file.json> | verify <checkpoint.json> | publish <checkpoint.json> <https-origin>');
  }finally{await service.close();store.close();signer?.close();}
}
