import type { IncomingMessage, ServerResponse } from 'node:http';
import { allowedRequest } from '../local-inference/vite.js';
import { marketService } from './service.js';
export function marketDataPlugin() {
  const service = marketService();
  function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (!req.url?.startsWith('/api/market-data/')) { next(); return; }
    const send = (code: number, value: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    if (!allowedRequest(req)) { send(403, { error: 'Local PumpCoin requests only.' }); return; }
    if (req.method !== 'GET') { send(405, { error: 'Read-only endpoint.' }); return; }
    if (req.url !== '/api/market-data/monad') { send(404, { error: 'Market route not found.' }); return; }
    void service.read().then(value => send(200, value)).catch(e => send(503, { error: e instanceof Error ? e.message : 'Market data unavailable.' }));
  }
  const configure = (server: { middlewares: { use: (fn: typeof handle) => unknown } }) => { server.middlewares.use(handle); };
  return { name: 'pumpcoin-market-data', configureServer: configure, configurePreviewServer: configure };
}
