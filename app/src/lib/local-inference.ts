import type { Detection, Progress } from '../../../local-inference/types.js';
export type { Detection };
export type LocalStatus = { status: 'idle' | 'running' | 'ready' | 'error'; progress?: Progress; result?: Detection; error?: string };
const API = '/api/local-inference';
async function json(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Local helper is unavailable. Open PumpCoin using its local Vite dev or preview server on the same Mac as llama-server.');
  const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Local detection failed.'); return value;
}
export async function detectModel(endpoint: string, update: (status: LocalStatus) => void, signal: AbortSignal): Promise<Detection> {
  update({ status: 'running', progress: { phase: 'inspecting', completedBytes: 0, totalBytes: 0 } });
  const request = (url: string, options: RequestInit = {}) => fetch(url, { ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
  const session = await json(await request(`${API}/status`));
  const start = await json(await request(`${API}/detect`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PumpCoin-Local-Token': session.token }, body: JSON.stringify({ endpoint }) }));
  const id = start.job.id; const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    signal.throwIfAborted(); const state = await json(await request(`${API}/status`)); const job = state.job;
    if (!job || job.id !== id) throw new Error('Another detection replaced this check. Detect again.');
    if (job.status === 'error') throw new Error(job.error || 'Local detection failed.');
    if (job.status === 'ready') { update({ status: 'ready', result: job.result }); return job.result as Detection; }
    update({ status: 'running', progress: job.progress });
    await new Promise<void>((resolve, reject) => { const stop = () => { clearTimeout(timer); reject(signal.reason); }; const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, 500); signal.addEventListener('abort', stop, { once: true }); });
  }
  throw new Error('Hashing timed out. Keep llama-server running, then retry detection.');
}
export function detectionMatches(d: { model: string; endpoint: string; weightsHash: string; runtimeHash: string; modelSource: string; localDetection?: Detection }): boolean {
  const x = d.localDetection;
  return !!x && x.evidence === 'locally-detected-not-attested' && x.model === d.model && x.endpoint === d.endpoint && x.weightsHash === d.weightsHash && x.runtimeHash === d.runtimeHash && (!x.source || x.source === d.modelSource);
}
