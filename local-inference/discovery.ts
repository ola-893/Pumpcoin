import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
const exec = promisify(execFile);
import type { Detection, Progress } from './types.js';
export type { Detection, Progress } from './types.js';
export function inferenceEndpoint(value: string): URL {
  const u = new URL(value);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || !['/v1', '/v1/', '/'].includes(u.pathname)) throw new Error('Use a local HTTP llama-server endpoint, such as http://127.0.0.1:8080/v1.');
  u.hostname = u.hostname === '[::1]' ? '[::1]' : '127.0.0.1'; u.pathname = '/v1';
  return u;
}
async function command(file: string, args: string[]): Promise<string> {
  try { return (await exec(file, args, { timeout: 5000, maxBuffer: 1024 * 1024 })).stdout; }
  catch { throw new Error('Cannot inspect the local llama-server process. Start it locally and run PumpCoin on the same Mac.'); }
}
export function oneListener(output: string): number {
  const ids = [...new Set(output.split('\n').filter(x => /^p\d+$/.test(x)).map(x => Number(x.slice(1))))];
  if (ids.length !== 1) throw new Error('Expected exactly one local inference process on this port.');
  return ids[0];
}
export function mappedNames(output: string): string[] {
  return [...new Set(output.split('\n').filter(x => x.startsWith('n/')).map(x => x.slice(1)))];
}
export function mappedWeights(names: string[], path: string): void {
  const gguf = names.filter(p => p.endsWith('.gguf'));
  if (gguf.length !== 1 || gguf[0] !== path) throw new Error('Automatic detection requires exactly one mapped GGUF. Split weights and projectors need a complete manual manifest.');
}
export function runtimeNames(names: string[]): string[] {
  const binaries = names.filter(p => basename(p) === 'llama-server');
  if (binaries.length !== 1) throw new Error('The listening process is not an inspectable llama-server runtime.');
  const libraries = names.filter(p => /\.(dylib|so|metallib)$/.test(p) && !p.startsWith('/System/') && !p.startsWith('/usr/lib/'));
  const result = [...new Set([...binaries, ...libraries])].sort();
  if (result.length > 64 || new Set(result.map(p => basename(p))).size !== result.length) throw new Error('Runtime artifact list is ambiguous or too large.');
  return result;
}
async function localJson(base: URL, path: string): Promise<Record<string, any>> {
  const u = new URL(path, base); const r = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('Local llama-server is unavailable or still loading.');
  const reader = r.body?.getReader(); if (!reader) throw new Error('Local server returned an empty response.');
  let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1024 * 1024) throw new Error('Local server response is too large.'); chunks.push(value); } }
  finally { await reader.cancel(); }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Local server returned invalid metadata.'); return data;
}
type Snapshot = { pid: number; start: string; model: string; path: string; names: string[]; runtime: string[]; props: Record<string, any> };
async function inspect(base: URL): Promise<Snapshot> {
  if (process.platform !== 'darwin') throw new Error('Automatic process inspection currently supports macOS llama-server.');
  const pid = oneListener(await command('/usr/sbin/lsof', ['-nP', `-iTCP:${base.port || '80'}`, '-sTCP:LISTEN', '-Fp']));
  const start = (await command('/bin/ps', ['-p', String(pid), '-o', 'lstart='])).trim();
  const [models, props, files] = await Promise.all([localJson(base, '/v1/models'), localJson(base, '/props'), command('/usr/sbin/lsof', ['-n', '-a', '-p', String(pid), '-d', 'txt', '-Fn'])]);
  const selected = mappedNames(files).filter(p => p.endsWith('.gguf') || basename(p) === 'llama-server' || /\.(dylib|so|metallib)$/.test(p));
  const names = await Promise.all(selected.map(p => realpath(p))); const runtime = runtimeNames(names);
  if (typeof props.model_path !== 'string' || !props.model_path.endsWith('.gguf')) throw new Error('The server must report the GGUF file it loaded.');
  const executable = await realpath((await command('/bin/ps', ['-p', String(pid), '-o', 'comm='])).trim());
  if (!runtime.includes(executable) || basename(executable) !== 'llama-server') throw new Error('The listening process executable is not llama-server.');
  const path = await realpath(props.model_path);
  mappedWeights(names, path);
  const model = props.model_alias;
  if (typeof model !== 'string' || model.length > 100 || !model.trim() || !Array.isArray(models.data) || !models.data.some((x: any) => x.id === model)) throw new Error('Model identity is inconsistent between local server endpoints.');
  if (props.default_generation_settings?.params?.lora?.length || props.modalities?.vision || props.modalities?.audio) throw new Error('Automatic hashing currently supports one text-only GGUF without LoRA or multimodal projectors.');
  return { pid, start, path, model, names: names.sort(), runtime, props };
}
function identity(x: Snapshot) { return JSON.stringify([x.pid, x.start, x.path, x.model, x.runtime, x.props.build_info, x.props.default_generation_settings]); }
function fingerprint(s: { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }) { return [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(':'); }
export class ArtifactHasher {
  private cache = new Map<string, { stamp: string; digest: string }>();
  async hash(path: string, onBytes: (bytes: number) => void = () => {}, gguf = false): Promise<{ sha256: string; bytes: number }> {
    const resolved = await realpath(path); const handle = await open(resolved, 'r');
    try {
      const before = await handle.stat(); if (!before.isFile()) throw new Error('Artifact is not a regular file.');
      if (gguf) { const header = Buffer.alloc(4); await handle.read(header, 0, 4, 0); if (header.toString() !== 'GGUF') throw new Error('Reported weights are not a GGUF file.'); }
      const stamp = fingerprint(before), cached = this.cache.get(resolved); let digest = cached?.stamp === stamp ? cached.digest : '';
      if (!digest) {
        const sha = createHash('sha256'); let read = 0;
        for await (const chunk of handle.createReadStream({ start: 0, autoClose: false, highWaterMark: 4 * 1024 * 1024 })) { sha.update(chunk); read += chunk.length; onBytes(read); }
        digest = sha.digest('hex');
      } else onBytes(before.size);
      const after = await handle.stat(), current = await stat(path);
      if (fingerprint(after) !== stamp || fingerprint(current) !== stamp || await realpath(path) !== resolved) throw new Error('Artifact changed during hashing. Detect it again.');
      if (this.cache.size >= 128) this.cache.clear(); this.cache.set(resolved, { stamp, digest });
      return { sha256: digest, bytes: before.size };
    } finally { await handle.close(); }
  }
  async check(path: string, hash: string) { if ((await this.hash(path)).sha256 !== hash) throw new Error('Artifact changed before detection finished.'); }
}
export function sourceFromRecord(record: unknown, filename: string, sha256: string, bytes: number): string | undefined {
  const r = record as Record<string, unknown> | null;
  if (!r || typeof r.repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(r.repository) || typeof r.revision !== 'string' || !/^[a-f\d]{40}$/.test(r.revision) || r.filename !== filename || r.sha256 !== sha256 || r.size_bytes !== bytes) return undefined;
  return `https://huggingface.co/${r.repository}/resolve/${r.revision}/${encodeURIComponent(filename)}`;
}
async function readSource(path: string, sha: string, bytes: number) {
  try { const f = await open(join(dirname(path), 'model-source.json'), 'r'); try { if ((await f.stat()).size > 16384) return undefined; return sourceFromRecord(JSON.parse(await f.readFile('utf8')), basename(path), sha, bytes); } finally { await f.close(); } }
  catch { return undefined; }
}
const hasher = new ArtifactHasher();
export async function detectLocalModel(endpoint: string, progress: (value: Progress) => void): Promise<Detection> {
  const base = inferenceEndpoint(endpoint); progress({ phase: 'inspecting', completedBytes: 0, totalBytes: 0 }); const first = await inspect(base);
  const size = (await stat(first.path)).size; progress({ phase: 'weights', completedBytes: 0, totalBytes: size });
  const weights = await hasher.hash(first.path, completedBytes => progress({ phase: 'weights', completedBytes, totalBytes: size }), true);
  progress({ phase: 'runtime', completedBytes: 0, totalBytes: first.runtime.length });
  const artifacts: Detection['runtimeManifest']['artifacts'] = []; let completedBytes = 0;
  for (const file of first.runtime) { const h = await hasher.hash(file); artifacts.push({ name: basename(file), sha256: h.sha256, bytes: h.bytes }); progress({ phase: 'runtime', completedBytes: ++completedBytes, totalBytes: first.runtime.length }); }
  artifacts.sort((a, b) => a.name.localeCompare(b.name));
  const runtimeManifest = { version: 'PUMPCOIN-MAPPED-RUNTIME-v1', scope: 'llama-server executable and mapped non-system native libraries; excludes OS, GPU driver, strategy and proof of execution', build: String(first.props.build_info ?? ''), artifacts };
  const runtimeHash = createHash('sha256').update(JSON.stringify(runtimeManifest)).digest('hex');
  progress({ phase: 'checking', completedBytes: 0, totalBytes: 0 });
  const last = await inspect(base); if (identity(last) !== identity(first)) throw new Error('Inference process or configuration changed during detection. Try again.');
  await hasher.check(first.path, weights.sha256); for (let i = 0; i < first.runtime.length; i++) { const record = artifacts.find(x => x.name === basename(first.runtime[i]))!; await hasher.check(first.runtime[i], record.sha256); }
  const source = await readSource(first.path, weights.sha256, weights.bytes);
  return { model: first.model, endpoint: base.href, quantization: String(first.props.model_ftype ?? 'Unknown'), context: Number(first.props.default_generation_settings?.n_ctx ?? 0), build: runtimeManifest.build, weightsHash: weights.sha256, weightsBytes: weights.bytes, weightsFilename: basename(first.path), runtimeHash, runtimeManifest, source, sourceStatus: source ? 'local-download-record-matched' : 'unavailable', checkedAt: new Date().toISOString(), evidence: 'locally-detected-not-attested' };
}
