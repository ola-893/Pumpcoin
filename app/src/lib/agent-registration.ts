import type { Challenge, Prepared } from '../../../agent-registration/core.js';
import type { RegistrationRecord } from '../../../agent-registration/types.js';
export { authorizationMessage } from '../../../agent-registration/core.js';
export type { Challenge, Prepared, RegistrationRecord };
const API = '/api/agent-registration';
async function json(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Open the local PumpCoin dev or preview server to register your agent.');
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Registration failed.'); return result;
}
export const registrationSession = (signal?: AbortSignal): Promise<{token: string; configured: boolean; vaultSetupConfigured?: boolean}> => fetch(API + '/status', { signal }).then(json);
export const registrationRequest = async (token: string, route: string, body?: unknown, signal?: AbortSignal) => json(await fetch(API + route, { method: body ? 'POST' : 'GET', headers: { 'X-PumpCoin-Registration-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) }));
export async function checkWorker(token: string, id: string, update: (value: string) => void, signal: AbortSignal) {
  await registrationRequest(token, '/worker-check', { id }, signal); update('Checking your local model and its paper-action guard…');
  const deadline = Date.now() + 5 * 60000;
  while (Date.now() < deadline) {
    const { job } = await registrationRequest(token, '/job', { id }, signal);
    if (job.status === 'error') throw new Error(job.error);
    if (job.status === 'ready') return job.result as RegistrationRecord['worker'];
    await new Promise<void>((resolve, reject) => { const stop = () => { clearTimeout(timer); reject(signal.reason); }; const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, 500); signal.addEventListener('abort', stop, { once: true }); });
  }
  throw new Error('The worker check timed out. Retry with the local model running.');
}

export type VaultPlan = { chainId: number; from: `0x${string}`; data: `0x${string}`; value: '0x0'; gas: `0x${string}`; balance: string; estimatedFee: string; canSubmit: boolean; commitment: `0x${string}`; scope: string; blockers: string[] };
