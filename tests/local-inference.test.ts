import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type IncomingMessage } from 'node:http';
import { ArtifactHasher, inferenceEndpoint, mappedNames, runtimeNames, sourceFromRecord, oneListener, mappedWeights } from '../local-inference/discovery.js';
import { allowedRequest, localInferencePlugin, LOCAL_API, localError } from '../local-inference/vite.js';
import { detectionMatches } from '../app/src/lib/local-inference.js';
import { initialDraft, prepareManifest } from '../app/src/lib/registration.js';
import type { Detection } from '../local-inference/types.js';
const sha = (x: string) => createHash('sha256').update(x).digest('hex');
const result: Detection = { model: 'test-local', endpoint: 'http://127.0.0.1:8080/v1', quantization: 'IQ4_XS', context: 16384, build: 'test', weightsHash: 'a'.repeat(64), runtimeHash: 'b'.repeat(64), weightsFilename: 'weights.gguf', weightsBytes: 123, runtimeManifest: { version: 'PUMPCOIN-MAPPED-RUNTIME-v1', scope: 'mapped runtime', build: 'test', artifacts: [] }, source: 'https://example.com/exact.gguf', sourceStatus: 'local-download-record-matched', checkedAt: '2026-10-11T00:00:00.000Z', evidence: 'locally-detected-not-attested' };
test('Discovery accepts only literal loopback HTTP inference endpoints and fixed paths', () => {
  for (const x of ['http://localhost:8080/v1','http://[::1]:8080/v1/']) assert.ok(inferenceEndpoint(x));
  for (const x of ['https://api.example.com/v1','http://localhost.evil.test/v1','http://127.0.0.1@evil.test/v1','http://127.0.0.1/admin','http://127.0.0.1/v1?file=/etc/passwd','http://user:pass@localhost/v1','file:///tmp/a']) assert.throws(() => inferenceEndpoint(x));
});
test('Process discovery rejects multiple listeners and ambiguous runtime artifacts', () => {
  assert.equal(oneListener('p123\nf3\np123\n'),123);assert.throws(() => oneListener('p1\np2\n'));
  const names=mappedNames('p123\nftxt\nn/opt/bin/llama-server\nn/opt/lib/libllama.dylib\nn/System/lib/os.dylib\nn/data/weights.gguf\n');
  assert.deepEqual(runtimeNames(names),['/opt/bin/llama-server','/opt/lib/libllama.dylib']);
  assert.throws(() => runtimeNames(['/opt/bin/other-server']));assert.throws(() => runtimeNames(['/a/llama-server','/b/llama-server']));
  mappedWeights(['/data/model.gguf','/opt/bin/llama-server'],'/data/model.gguf');
  assert.throws(() => mappedWeights(['/data/model-1.gguf','/data/model-2.gguf'],'/data/model-1.gguf'));
  assert.throws(() => mappedWeights(['/data/other.gguf'],'/data/model.gguf'));
});
test('Download source is recovered only for exact filename, bytes, revision and measured digest', () => {
  const r={repository:'unsloth/Qwen3.8-27B-GGUF',revision:'c'.repeat(40),filename:'weights.gguf',size_bytes:100,sha256:'a'.repeat(64)};
  assert.match(sourceFromRecord(r,'weights.gguf','a'.repeat(64),100)!,/resolve\/c{40}\/weights.gguf$/);
  for (const changed of [{sha256:'b'.repeat(64)},{size_bytes:99},{filename:'other.gguf'},{revision:'main'},{repository:'https://evil.test'}]) assert.equal(sourceFromRecord({...r,...changed},'weights.gguf','a'.repeat(64),100),undefined);
});
test('Hasher reads actual bytes, rejects non-GGUF, and invalidates its cache after changes', async () => {
  const dir=await mkdtemp(join(tmpdir(),'pumpcoin-hash-'));try {
    const path=join(dir,'model.gguf');const h=new ArtifactHasher();await writeFile(path,'GGUFabc');assert.equal((await h.hash(path,()=>{},true)).sha256,sha('GGUFabc'));
    await writeFile(path,'GGUFxyz');assert.equal((await h.hash(path,()=>{},true)).sha256,sha('GGUFxyz'));
    await writeFile(path,'NOPEabc');await assert.rejects(h.hash(path,()=>{},true),/GGUF/);
    await writeFile(path,'GGUF'+ 'x'.repeat(8*1024*1024));let changed=false;
    await assert.rejects(h.hash(path,()=>{if(!changed){changed=true;writeFileSync(path,'GGUFchanged');}},true),/changed/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('Local helper rejects DNS rebinding, non-loopback peers and cross-origin callers', () => {
  const req=(host:string,origin?:string,remoteAddress='127.0.0.1')=>({headers:{host,origin},socket:{remoteAddress}} as Pick<IncomingMessage,'headers'|'socket'>);
  assert.equal(allowedRequest(req('127.0.0.1:5189','http://127.0.0.1:5189')),true);
  assert.equal(allowedRequest(req('evil.test:5189')),false);assert.equal(allowedRequest(req('localhost:5189','https://evil.test')),false);assert.equal(allowedRequest(req('127.0.0.1:5189',undefined,'192.168.1.5')),false);
});
test('Local API requires its session token, refuses paths and hosted URLs, deduplicates work and returns failures honestly', async () => {
  let calls=0;let finish!: (x:Detection)=>void;
  const plugin=localInferencePlugin(async () => {calls++;return new Promise<Detection>(resolve=>{finish=resolve;});});
  let handler!: (req:IncomingMessage,res:any,next:()=>void)=>void;
  plugin.configureServer({middlewares:{use(h){handler=h;}}});
  const server=createServer((req,res)=>handler(req,res,()=>{res.statusCode=404;res.end();}));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try{
    const port=(server.address() as {port:number}).port;const base=`http://127.0.0.1:${port}`;
    const session=await (await fetch(base+LOCAL_API+'/status')).json() as {token:string};
    const post=(body:unknown,token=session.token,origin=base)=>fetch(base+LOCAL_API+'/detect',{method:'POST',headers:{'Content-Type':'application/json','X-PumpCoin-Local-Token':token,Origin:origin},body:JSON.stringify(body)});
    assert.equal((await post({endpoint:result.endpoint},'bad')).status,403);
    assert.equal((await post({endpoint:result.endpoint},session.token,'https://evil.test')).status,403);
    assert.equal((await post({endpoint:result.endpoint,path:'/etc/passwd'})).status,400);
    assert.equal((await post({endpoint:'https://api.example.com/v1'})).status,400);
    const a=await (await post({endpoint:result.endpoint})).json() as any;const b=await (await post({endpoint:result.endpoint})).json() as any;assert.equal(a.job.id,b.job.id);assert.equal(calls,1);
    assert.equal((await post({endpoint:'http://127.0.0.1:8081/v1'})).status,409);
    finish(result);await new Promise(r=>setTimeout(r,0));const ready=await (await fetch(base+LOCAL_API+'/status')).json() as any;assert.equal(ready.job.status,'ready');assert.equal(ready.job.result.evidence,'locally-detected-not-attested');
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('Editing detected fields drops measurements from the public declaration without upgrading evidence', () => {
  const draft={...initialDraft,name:'Local agent',controller:'0x1111111111111111111111111111111111111111',executionKey:'0x2222222222222222222222222222222222222222',model:result.model,endpoint:result.endpoint,weightsHash:result.weightsHash,runtimeHash:result.runtimeHash,modelSource:result.source!,localDetection:result,strategy:'Trade one spot pair under bounded exposure.',strategyCodeHash:'c'.repeat(64),selfHosted:true};
  assert.equal(detectionMatches(draft),true);const m=prepareManifest(draft).manifest;assert.equal(m.evidenceLevel,'operator-declared');assert.equal(m.model.localMeasurements?.evidence,'locally-detected-not-attested');assert.ok(!JSON.stringify(m).includes('127.0.0.1'));
  const edited={...draft,weightsHash:'d'.repeat(64)};assert.equal(detectionMatches(edited),false);assert.equal(prepareManifest(edited).manifest.model.localMeasurements,undefined);
});
test('A failed inspector becomes an explicit error job rather than a successful detected result', async () => {
  assert.ok(!localError(Object.assign(new Error('ENOENT /Users/private/model.gguf'),{code:'ENOENT'})).includes('/Users/'));
  const plugin=localInferencePlugin(async () => {throw Object.assign(new Error('ENOENT /Users/private/model.gguf'),{code:'ENOENT'});});let handler!: (req:IncomingMessage,res:any,next:()=>void)=>void;
  plugin.configureServer({middlewares:{use(h){handler=h;}}});const server=createServer((req,res)=>handler(req,res,()=>res.end()));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try { const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;const {token}=await (await fetch(base+LOCAL_API+'/status')).json() as {token:string};await fetch(base+LOCAL_API+'/detect',{method:'POST',headers:{'Content-Type':'application/json','X-PumpCoin-Local-Token':token},body:JSON.stringify({endpoint:result.endpoint})});await new Promise(r=>setTimeout(r,0));const {job}=await (await fetch(base+LOCAL_API+'/status')).json() as any;assert.equal(job.status,'error');assert.match(job.error,/could not be read/);assert.ok(!job.error.includes('/Users/'));assert.equal(job.result,undefined);
  } finally {await new Promise<void>(r=>server.close(()=>r()));}
});
