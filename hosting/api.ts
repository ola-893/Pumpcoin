import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { liveVaultService } from '../agent-registration/live-vault.js';
import { agentStateService } from '../agent-registration/agent-state.js';
import { tradingService, type TradingNetwork } from '../agent-registration/trading.js';
import { nativeInvestmentService } from '../agent-registration/native-investment.js';
import { poolFundingService } from '../agent-registration/pool-funding.js';
import { permissionStatus, permissionPlan, executionFundingPlan } from '../agent-registration/permissions.js';
import { requireBrowserTradeAction } from '../agent-registration/browser-actions.js';
import type { RegistrationRecord, RuntimeStatus } from '../agent-registration/types.js';
import type { Prepared } from '../agent-registration/core.js';
import type { VaultNetwork } from '../agent-registration/vault-setup.js';
import { marketService } from '../market-data/service.js';
import { readDirectory } from '../app/src/lib/agent-directory.js';
import { reviewStorage } from './storage.js';
import { hostedResearchRoute } from './research-api.js';

type Seed = { records: RegistrationRecord[]; metadata: Record<string, unknown> };
const operatorMessage = 'Run npm run dev on the operator computer for local model registration, execution signing and trader controls.';
const market = marketService();
const runtime = { async status(): Promise<RuntimeStatus> { return { configured: false, running: false, state: 'unconfigured', changedAt: new Date().toISOString(), message: 'The hosted API cannot observe or control the operator’s local trading process.' }; } };
let services: ReturnType<typeof initialize> | undefined;
async function initialize() {
  const json = async (name: string) => JSON.parse(await readFile(new URL(`../deployments/${name}`, import.meta.url), 'utf8'));
  const seed = await json('hosted-public.json') as Seed;
  await readDirectory({ records: seed.records }); // Verify commitments and enrollment signatures before serving records.
  const records = async () => seed.records;
  const network = await json('pumpcoin-vault-network.json') as VaultNetwork;
  const tradingNetwork = await json('pumpcoin-trading-network.json') as TradingNetwork;
  const directory = join(tmpdir(), 'pumpcoin-hosted');
  for (const [path, value] of Object.entries(seed.metadata)) {
    if (!/^vault-(?:trading|native|liquidity)\/[0-9a-f]{64}(?:-[0-9a-f]{40})?\.json$/.test(path)) throw new Error('Invalid public infrastructure metadata.');
    await mkdir(join(directory, path.split('/')[0]), { recursive: true });
    await writeFile(join(directory, path), JSON.stringify(value));
  }
  const live = liveVaultService(network, records);
  const state = agentStateService(records, live, runtime);
  const trading = tradingService(network, tradingNetwork, join(directory, 'vault-trading'), records);
  const native = nativeInvestmentService(network, tradingNetwork, join(directory, 'vault-native'), records, trading, undefined, reviewStorage('vault-native', seed.metadata));
  const pool = poolFundingService(network, tradingNetwork, join(directory, 'vault-liquidity'), trading, undefined, reviewStorage('vault-liquidity', seed.metadata));
  const prepared = (id: string) => {
    const r = seed.records.find(x => x.id === id);
    if (!r?.binding) throw new Error('Select a bound agent registration.');
    // These readers use only the signed public declaration. No inference is called.
    const p = { manifest: r.manifest, commitment: r.commitment } as Prepared;
    return { r, p };
  };
  return { seed, records, network, live, state, trading, native, pool, prepared };
}

export function sessionToken(host: string, expiry: number, secret: string) {
  return `${expiry}.${createHmac('sha256', secret).update(`${host}:${expiry}`).digest('hex')}`;
}
export function validSession(token: unknown, host: string, secret: string, now = Date.now()) {
  if (typeof token !== 'string' || !/^\d{13}\.[0-9a-f]{64}$/.test(token)) return false;
  const expiry = Number(token.split('.')[0]);
  if (expiry <= now || expiry > now + 3600000) return false;
  const expected = sessionToken(host, expiry, secret);
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
const fields: Record<string, string[]> = {
  '/research-state':['id'], '/research-history':['id','sessionId'], '/research-export':['id','sessionId'], '/research-publish':['id','checkpoint'],
  '/agent-state': ['id'], '/agent-state-refresh': ['id'], '/live-vault': ['id'], '/trading-state': ['id', 'account'], '/trading-plan': ['id', 'action', 'account', 'amount'], '/trading-receipt': ['id', 'transactionHash'],
  '/native-state': ['id', 'account'], '/native-plan': ['id', 'action', 'account', 'amount'], '/native-receipt': ['id', 'planId', 'transactionHash'],
  '/pool-state': ['id', 'account'], '/pool-plan': ['id', 'action', 'account'], '/pool-receipt': ['id', 'planId', 'transactionHash'],
  '/autonomy-status': ['id'], '/autonomy-plan': ['id', 'action', 'days', 'dailyQuoteCap'], '/execution-funding-plan': ['id'], '/trader-status': ['id'], '/request-prices': ['id'],
};
export async function hostedApi(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const send = (code: number, value: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
  try {
    const host = req.headers.host ?? '';
    if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) { send(400, { error: 'Invalid request host.' }); return; }
    if (req.headers.origin && req.headers.origin !== `https://${host}` && !(process.env.NODE_ENV !== 'production' && req.headers.origin === `http://${host}`)) { send(403, { error: 'Use this application’s own origin.' }); return; }
    const path = new URL(req.url ?? '/', `https://${host}`).pathname;
    if (path === '/api/health') {
      const s = await (services ??= initialize());
      send(200, { ok: true, chainId: s.network.chainId, records: s.seed.records.length, reviewStorageConfigured: !!process.env.BLOB_READ_WRITE_TOKEN, operatorRuntime: 'local' }); return;
    }
    if (path.startsWith('/api/local-inference/')) { send(409, { error: operatorMessage }); return; }
    if (path === '/api/market-data/monad' && req.method === 'GET') { send(200, await market.read()); return; }
    if (!path.startsWith('/api/agent-registration/')) { send(404, { error: 'API route not found.' }); return; }
    const secret = process.env.PUMPCOIN_HOSTED_SESSION_SECRET;
    if (!secret || secret.length < 32) throw new Error('Hosted session configuration is unavailable.');
    if (path === '/api/agent-registration/status' && req.method === 'GET') { send(200, { token: sessionToken(host, Date.now() + 3600000, secret), configured: false, vaultSetupConfigured: false, executionSignerConfigured: false, hosted: true }); return; }
    if (!validSession(req.headers['x-pumpcoin-registration-token'], host, secret)) { send(403, { error: 'Refresh to establish a new session.' }); return; }
    const s = await (services ??= initialize());
    if (path === '/api/agent-registration/records' && req.method === 'GET') { send(200, { records: await s.records() }); return; }
    if (req.method !== 'POST' || req.headers['content-type']?.split(';')[0] !== 'application/json') { send(405, { error: 'Use a JSON POST request.' }); return; }
    const maxBody = path.endsWith('/research-publish') ? 5000000 : 65536;
    let body = req.body;
    if (body === undefined) { const chunks: Buffer[] = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > maxBody) { send(413, { error: 'Request is too large.' }); return; } chunks.push(Buffer.from(chunk)); } body = Buffer.concat(chunks).toString('utf8'); }
    if (typeof body === 'string') { if (Buffer.byteLength(body) > maxBody) { send(413, { error: 'Request is too large.' }); return; } body = JSON.parse(body); }
    else if (Buffer.byteLength(JSON.stringify(body)) > maxBody) { send(413,{error:'Request is too large.'});return; }
    const b = body as Record<string, any>, route = path.slice('/api/agent-registration'.length);
    if (!fields[route]) { send(409, { error: operatorMessage }); return; }
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).sort().join(',') !== fields[route].slice().sort().join(',')) throw new Error('Invalid request fields.');
    if (typeof b.id !== 'string' || !/^0x[a-f0-9]{64}$/.test(b.id) || !s.seed.records.some(r => r.id === b.id)) throw new Error('Select a published agent registration.');
    if(route.startsWith('/research-')){await hostedResearchRoute(res,route,b,s.seed.records);return;}
    let result: unknown;
    switch (route) {
      case '/agent-state': case '/agent-state-refresh': result = { state: await s.state.inspect(b.id, route.endsWith('-refresh')) }; break;
      case '/live-vault': result = { observation: await s.live.inspect(b.id, { allowStale: true }) }; break;
      case '/trading-state': result = { state: await s.trading.inspect(b.id, b.account || undefined) }; break;
      case '/trading-plan': requireBrowserTradeAction(b.action); result = { plan: await s.trading.plan(b.id, b.action, b.account, b.amount) }; break;
      case '/trading-receipt': result = { receipt: await s.trading.receipt(b.id, b.transactionHash) }; break;
      case '/native-state': result = { state: await s.native.inspect(b.id, b.account || undefined) }; break;
      case '/native-plan': if (b.action === 'deploy-native') throw new Error('Use the operator CLI to deploy infrastructure.'); result = { plan: await s.native.plan(b.id, b.action, b.account, b.amount) }; break;
      case '/native-receipt': result = { receipt: await s.native.receipt(b.id, b.planId, b.transactionHash) }; break;
      case '/pool-state': result = { state: await s.pool.inspect(b.id, b.account || undefined) }; break;
      case '/pool-plan': if (b.action === 'deploy-pool-funder') throw new Error('Use the operator CLI to deploy infrastructure.'); result = { plan: await s.pool.plan(b.id, b.action, b.account) }; break;
      case '/pool-receipt': result = { receipt: await s.pool.receipt(b.id, b.planId, b.transactionHash) }; break;
      case '/autonomy-status': { const {r,p} = s.prepared(b.id); result = { status: await permissionStatus(p, r.binding!.vault, s.network) }; break; }
      case '/autonomy-plan': { const {r,p} = s.prepared(b.id); result = { plan: await permissionPlan(p, r.binding!.vault, s.network, b.action, { days: b.days, dailyQuoteCap: b.dailyQuoteCap }) }; break; }
      case '/execution-funding-plan': { const {r,p} = s.prepared(b.id); result = { plan: await executionFundingPlan(p, r.binding!.vault, s.network) }; break; }
      case '/trader-status': result = { runtime: await runtime.status() }; break;
      case '/request-prices': send(503, { error: 'The on-demand oracle keeper runs on the operator computer. Ask the operator to refresh prices before retrying.' }); return;
    }
    send(200, result);
  } catch (error) {
    const message = error instanceof Error && error.message.length < 300 && !/\/Users\/|\/private\/|https?:\/\/|token|secret|password/i.test(error.message) ? error.message : 'The hosted service could not complete this request. Retry the observation.';
    send(400, { error: message });
  }
}
