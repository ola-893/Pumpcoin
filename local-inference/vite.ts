import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { detectLocalModel, inferenceEndpoint, type Detection, type Progress } from './discovery.js';
export const LOCAL_API = '/api/local-inference';
export function localError(error: unknown): string {
  if (error instanceof SyntaxError) return 'Local metadata or detection request is invalid JSON.';
  if (error instanceof Error && 'code' in error) return 'A local artifact could not be read. Check file permissions and detect again.';
  return error instanceof Error ? error.message : 'Local model detection failed.';
}
export function allowedRequest(req: Pick<IncomingMessage, 'headers' | 'socket'>): boolean {
  const address = req.socket.remoteAddress;
  if (!address || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
  const host = req.headers.host;
  if (!host || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  return !req.headers.origin || req.headers.origin === `http://${host}`;
}
type Job = { id: string; endpoint: string; status: 'running' | 'ready' | 'error'; progress?: Progress; result?: Detection; error?: string };
const send = (res: ServerResponse, code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
export function localInferencePlugin(detector = detectLocalModel) {
  const token = randomBytes(32).toString('hex'); let job: Job | undefined;
  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (!req.url?.startsWith(LOCAL_API)) { next(); return; }
    if (!allowedRequest(req)) { send(res, 403, { error: 'Local helper accepts requests only from this local PumpCoin origin.' }); return; }
    if (req.url === `${LOCAL_API}/status` && req.method === 'GET') { send(res, 200, { version: 1, token, job }); return; }
    if (req.url !== `${LOCAL_API}/detect` || req.method !== 'POST') { send(res, 404, { error: 'Local inference route not found.' }); return; }
    if (req.headers['x-pumpcoin-local-token'] !== token || req.headers['content-type'] !== 'application/json') { send(res, 403, { error: 'Refresh the page to establish a local helper session.' }); return; }
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 2048) { send(res, 413, { error: 'Detection request is too large.' }); return; } chunks.push(Buffer.from(chunk)); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body.endpoint !== 'string' || Object.keys(body).some(x => x !== 'endpoint')) throw new Error('Only a local inference endpoint may be supplied; file paths are never accepted.');
      const endpoint = inferenceEndpoint(body.endpoint).href;
      if (job?.status === 'running') { if (job.endpoint !== endpoint) { send(res, 409, { error: 'Another local model is being checked. Wait for that check to finish.' }); return; } send(res, 202, { job }); return; }
      const current: Job = { id: randomBytes(12).toString('hex'), endpoint, status: 'running' }; job = current;
      void detector(endpoint, progress => { current.progress = progress; }).then(result => { current.result = result; current.status = 'ready'; }).catch(e => { current.status = 'error'; current.error = localError(e); });
      send(res, 202, { job: current });
    } catch (e) { send(res, 400, { error: localError(e) }); }
  }
  const configure = (server: { middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => unknown } }) => {
    server.middlewares.use((req, res, next) => { void handle(req, res, next).catch(() => { if (!res.headersSent) send(res, 500, { error: 'Local helper failed. Try again.' }); }); });
  };
  return { name: 'pumpcoin-local-inference', configureServer: configure, configurePreviewServer: configure };
}
