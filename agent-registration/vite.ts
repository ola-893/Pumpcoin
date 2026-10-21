import { requireBrowserTradeAction } from './browser-actions.js';
import { requestOracleRefresh } from './oracle-demand.js';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { allowedRequest } from '../local-inference/vite.js';
import { registrationService } from './service.js';
import { configuredSigner } from './signer.js';
import { autonomyRuntime } from './autonomy-runtime.js';
import { agentStateService } from './agent-state.js';
import { liveVaultService } from './live-vault.js';
let signer: ReturnType<typeof configuredSigner> | undefined;
import { tradingService } from './trading.js';
import { nativeInvestmentService } from './native-investment.js';
import { poolFundingService } from './pool-funding.js';
import { researchService } from '../research/service.js';
import { ResearchStore } from '../research/store.js';
export const REGISTRATION_API = '/api/agent-registration';
const defaultNetwork = fileURLToPath(new URL('../deployments/pumpcoin-vault-network.json', import.meta.url));
export function registrationPlugin(service = registrationService({ signer: process.env.PUMPCOIN_SIGNER_PASSWORD_FILE ? () => signer ??= configuredSigner() : undefined, vaultNetwork: JSON.parse(readFileSync(process.env.PUMPCOIN_VAULT_NETWORK_CONFIG ?? defaultNetwork, 'utf8')), directory: fileURLToPath(new URL('../.local/agent-registrations/', import.meta.url)), config: process.env.PUMPCOIN_BINDING_CONFIG ? JSON.parse(readFileSync(process.env.PUMPCOIN_BINDING_CONFIG, 'utf8')) : undefined }), pythApiKey?: string) {
  const token = randomBytes(32).toString('hex');
  const research = researchService({ store: new ResearchStore(fileURLToPath(new URL('../.local/research/pump.sqlite', import.meta.url))),
    resolve: id => service.researchPrepared(id), signerConfigured: service.executionSignerConfigured,
    sign: async (record, message) => { const store = await (signer ??= configuredSigner()); if (!store) throw new Error('Configure the local execution signer.'); const account = await store.account(record.manifest.controller, record.manifest.name); if (account.address !== record.manifest.executionKey) throw new Error('Research signer differs from the registered agent.'); return account.signMessage({message}); } });
  const runtime = autonomyRuntime({ configFile: process.env.PUMPCOIN_AUTONOMY_CONFIG, configDirectory: process.env.PUMPCOIN_AUTONOMY_DIRECTORY });
  const live = liveVaultService(JSON.parse(readFileSync(process.env.PUMPCOIN_VAULT_NETWORK_CONFIG ?? defaultNetwork, 'utf8')), () => service.records());
  const agentState = agentStateService(() => service.records(), live, runtime);
  const trading = tradingService(JSON.parse(readFileSync(process.env.PUMPCOIN_VAULT_NETWORK_CONFIG ?? defaultNetwork, 'utf8')), JSON.parse(readFileSync(new URL('../deployments/pumpcoin-trading-network.json', import.meta.url), 'utf8')), fileURLToPath(new URL('../.local/vault-trading/', import.meta.url)), () => service.records(), undefined, () => pythApiKey ?? process.env.PUMPCOIN_PYTH_API_KEY);
  const native = nativeInvestmentService(JSON.parse(readFileSync(process.env.PUMPCOIN_VAULT_NETWORK_CONFIG ?? defaultNetwork, 'utf8')), JSON.parse(readFileSync(new URL('../deployments/pumpcoin-trading-network.json', import.meta.url), 'utf8')), fileURLToPath(new URL('../.local/vault-native/', import.meta.url)), () => service.records(), trading);
  const pool = poolFundingService(JSON.parse(readFileSync(process.env.PUMPCOIN_VAULT_NETWORK_CONFIG ?? defaultNetwork, 'utf8')), JSON.parse(readFileSync(new URL('../deployments/pumpcoin-trading-network.json', import.meta.url), 'utf8')), fileURLToPath(new URL('../.local/vault-liquidity/', import.meta.url)), trading);
  const send = (res: ServerResponse, code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (!req.url?.startsWith(REGISTRATION_API)) { next(); return; }
    if (!allowedRequest(req)) { send(res, 403, { error: 'Registration helper accepts only this local PumpCoin origin.' }); return; }
    const origin = `http://${req.headers.host}`;
    if (req.url === REGISTRATION_API + '/status' && req.method === 'GET') { send(res, 200, { token, configured: service.configured, vaultSetupConfigured: service.vaultSetupConfigured, executionSignerConfigured: service.executionSignerConfigured }); return; }
    if (req.headers['x-pumpcoin-registration-token'] !== token) { send(res, 403, { error: 'Refresh to establish a local registration session.' }); return; }
    try {
      if (req.url === REGISTRATION_API + '/records' && req.method === 'GET') { send(res, 200, { records: await service.records() }); return; }
      if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') { send(res, 404, { error: 'Registration route not found.' }); return; }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 65536) { send(res, 413, { error: 'Registration request is too large.' }); return; } chunks.push(Buffer.from(chunk)); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid registration request.');
      const route = req.url.slice(REGISTRATION_API.length);
      const researchFields: Record<string,string[]> = { '/research-state':['id'], '/research-sources':['id','symbol'], '/research-challenge':['id','policy'], '/research-authorize':['id','challengeId','controllerSignature'], '/research-run':['id','sessionId'], '/research-start':['id','sessionId'], '/research-stop':['id','sessionId'], '/research-history':['id','sessionId'], '/research-export':['id','sessionId'] };
      if (researchFields[route]) {
        if (Object.keys(body).sort().join() !== researchFields[route].slice().sort().join()) throw new Error('Invalid research request fields.');
        let result: unknown;
        if (route === '/research-state') result = {research:await research.view(body.id)};
        if (route === '/research-sources') result = {evidence:await research.sourceCheck(body.id,body.symbol)};
        if (route === '/research-challenge') result = {challenge:await research.challenge(body.id,body.policy,origin)};
        if (route === '/research-authorize') result = {policy:await research.authorize(body.id,body.challengeId,body.controllerSignature,origin)};
        if (route === '/research-run') { await research.kickoff(body.id,body.sessionId); result={started:true}; }
        if (route === '/research-start') { await research.start(body.id,body.sessionId); result={started:true}; }
        if (route === '/research-stop') { await research.stop(body.id,body.sessionId); result={stopped:true}; }
        if (route === '/research-history') result=await research.history(body.id,body.sessionId);
        if (route === '/research-export') result={checkpoint:await research.bundle(body.id,body.sessionId)};
        send(res,200,result);return;
      }
      const fields: Record<string, string[]> = { '/agent-state-refresh': ['id'], '/agent-state': ['id'], '/request-prices': ['id'], '/pool-state': ['id', 'account'], '/pool-plan': ['id', 'action', 'account'], '/pool-receipt': ['id', 'planId', 'transactionHash'], '/native-state': ['id', 'account'], '/native-plan': ['id', 'action', 'account', 'amount'], '/native-receipt': ['id', 'planId', 'transactionHash'], '/live-vault': ['id'], '/trader-status': ['id'], '/trader-start': ['id'], '/trader-stop': ['id'], '/execution-funding-plan': ['id'], '/autonomy-status': ['id'], '/autonomy-plan': ['id', 'action', 'days', 'dailyQuoteCap'], '/execution-wallet': ['controller', 'name'], '/authorize-execution': ['id', 'controllerSignature'], '/trading-receipt': ['id', 'transactionHash'], '/trading-state': ['id', 'account'], '/trading-plan': ['id', 'action', 'account', 'amount'], '/confirm-valuation-guard': ['id', 'transactionHash'], '/confirm-trading': ['id', 'transactionHash'], '/challenge': ['prepared'], '/worker-check': ['id'], '/job': ['id'], '/commit': ['id', 'controllerSignature', 'executionSignature'], '/vault-plan': ['id'], '/confirm-vault': ['id', 'transactionHash'], '/identity-plan': ['id', 'agentId'], '/verify-binding': ['id', 'agentId'] };
      if (!fields[route] || Object.keys(body).sort().join(',') !== fields[route].sort().join(',')) throw new Error('Invalid registration request fields.');
      let result: unknown;
      if (route === '/request-prices') { if (!(await service.records()).some(r => r.id === body.id && r.binding)) throw new Error('Select a bound registration.'); result = { requested: await requestOracleRefresh(body.id) }; }
      if (route === '/pool-state') result = { state: await pool.inspect(body.id, body.account || undefined) };
      if (route === '/pool-plan') { if (body.action === 'deploy-pool-funder') throw new Error('Infrastructure deployment uses the operator CLI.'); result = { plan: await pool.plan(body.id, body.action, body.account) }; }
      if (route === '/pool-receipt') result = { receipt: await pool.receipt(body.id, body.planId, body.transactionHash) };
      if (route === '/native-state') result = { state: await native.inspect(body.id, body.account || undefined) };
      if (route === '/native-plan') { if (body.action === 'deploy-native') throw new Error('Infrastructure deployment uses the operator CLI.'); result = { plan: await native.plan(body.id, body.action, body.account, body.amount) }; }
      if (route === '/native-receipt') result = { receipt: await native.receipt(body.id, body.planId, body.transactionHash) };
      if (route === '/agent-state-refresh') result = { state: await agentState.inspect(body.id, true) };
      if (route === '/agent-state') result = { state: await agentState.inspect(body.id) };
      if (route === '/live-vault') result = { observation: await live.inspect(body.id, { allowStale: true }) };
      if (route === '/trader-status') result = { runtime: await runtime.status(body.id) };
      if (route === '/trader-start') result = { runtime: await runtime.start(body.id) };
      if (route === '/trader-stop') result = { runtime: await runtime.stop(body.id) };
      if (route === '/execution-funding-plan') result = { plan: await service.executionFundingPlan(body.id) };
      if (route === '/autonomy-status') result = { status: await service.autonomyStatus(body.id) };
      if (route === '/autonomy-plan') result = { plan: await service.autonomyPlan(body.id, body.action, body.days, body.dailyQuoteCap) };
      if (route === '/execution-wallet') result = await service.executionWallet(body.controller, body.name);
      if (route === '/authorize-execution') result = { signature: await service.authorizeExecution(body.id, origin, body.controllerSignature) };
      if (route === '/trading-receipt') result = { receipt: await trading.receipt(body.id, body.transactionHash) };
      if (route === '/trading-state') result = { state: await trading.inspect(body.id, body.account || undefined) };
      if (route === '/trading-plan') { requireBrowserTradeAction(body.action); result = { plan: await trading.plan(body.id, body.action, body.account, body.amount) }; }
      if (route === '/confirm-valuation-guard') result = { state: await trading.confirmGuard(body.id, body.transactionHash) };
      if (route === '/confirm-trading') result = { state: await trading.confirm(body.id, body.transactionHash) };
      if (route === '/challenge') result = { challenge: service.challenge(body.prepared, origin) };
      if (route === '/worker-check') result = { job: service.check(body.id, origin) };
      if (route === '/job') result = { job: service.job(body.id, origin) };
      if (route === '/commit') result = { record: await service.commit(body.id, origin, body.controllerSignature, body.executionSignature) };
      if (route === '/vault-plan') result = { plan: await service.vaultPlan(body.id) };
      if (route === '/confirm-vault') result = { record: await service.confirmVault(body.id, body.transactionHash) };
      if (route === '/identity-plan') result = { plan: await service.plan(body.id, body.agentId || undefined) };
      if (route === '/verify-binding') result = { record: await service.bind(body.id, body.agentId) };
      send(res, route === '/worker-check' ? 202 : 200, result);
    } catch (e) {
      const text = e instanceof Error && !('code' in e) && !e.message.includes('/Users/') && !e.message.includes('/private/') && e.message.length < 300 ? e.message : 'Local registration check failed. Check the helper configuration and retry.';
      send(res, 400, { error: text });
    }
  }
  const configure = (server: { httpServer?: { once: (event: string, callback: () => void) => unknown } | null; middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => unknown } }) => {
    server.httpServer?.once('close', () => { void runtime.close(); void research.close(); });
    server.middlewares.use((req, res, next) => { void handle(req, res, next).catch(() => { if (!res.headersSent) send(res, 500, { error: 'Local registration helper failed.' }); }); });
  };
  return { name: 'pumpcoin-agent-registration', configureServer: configure, configurePreviewServer: configure };
}
