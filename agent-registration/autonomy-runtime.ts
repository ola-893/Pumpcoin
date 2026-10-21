import { join } from 'node:path';
import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { runAutonomous, type WorkerConfig } from './run-autonomous.js';
import { autonomousDeployment } from './autonomous.js';
import type { Hex } from 'viem';

import type { RuntimeStatus } from "./types.js";
export type { RuntimeStatus } from "./types.js";
/** This controller is exposed only by the authenticated loopback helper.
 * Browser requests select a registration, never a key, path, RPC or deployment pin.
 * The existing worker retains key locks, on-chain checks and durable nonce recovery.
 */
function singleRuntime(options: { configFile?: string; run?: typeof runAutonomous; now?: () => number } = {}) {
  const now = () => new Date((options.now ?? Date.now)()).toISOString();
  let task: Promise<void> | undefined, stop: AbortController | undefined, registrationId: Hex | undefined;
  let status: RuntimeStatus = { configured: !!options.configFile, running: false, state: options.configFile ? 'stopped' : 'unconfigured', changedAt: now(), message: options.configFile ? 'Trader stopped.' : 'No reviewed trading deployment is configured on this server.' };
  const id = (value: string) => { if (!/^0x[0-9a-f]{64}$/i.test(value)) throw new Error('Invalid registration identifier.'); };
  async function config(value: string): Promise<WorkerConfig> {
    id(value);
    if (!options.configFile) throw new Error('Configure a reviewed trading deployment on the server before starting this agent.');
    const c = JSON.parse(await readFile(options.configFile, 'utf8')) as WorkerConfig;
    if (c.registrationId?.toLowerCase() !== value.toLowerCase()) throw new Error('The server trading deployment belongs to another registration.');
    if (c.deployment?.chainId !== 10143) throw new Error('Frontend trading is restricted to Monad testnet.');
    autonomousDeployment(c.deployment);
    return c;
  }
  const view = () => ({ ...status });
  return {
    async status(value: string) {
      id(value); if (!options.configFile) return view();
      if (task && registrationId?.toLowerCase() === value.toLowerCase()) return view();
      await config(value);
      // Never disclose another registration's process observations.
      if (registrationId && registrationId.toLowerCase() !== value.toLowerCase()) throw new Error('A different agent occupies this runtime.');
      return view();
    },
    async start(value: string) {
      const c = await config(value);
      if (task) {
        if (registrationId?.toLowerCase() !== value.toLowerCase()) throw new Error('A different agent occupies this runtime.');
        return view();
      }
      registrationId = c.registrationId; stop = new AbortController();
      const signal = stop.signal;
      status = { configured: true, running: true, state: 'starting', changedAt: now(), message: 'Starting the restricted trader. Current permission and deployment checks run before signing.' };
      // Assign task before calling the runner, including runners which throw synchronously.
      const current = Promise.resolve().then(() => (options.run ?? runAutonomous)(c, { signal, observe: event => {
        if (signal.aborted) return;
        status = { configured: true, running: true, state: event.state, changedAt: now(), observedAt: now(),
          ...(event.hash ? { transactionHash: event.hash } : {}), message: event.state === 'budget' ? event.budgetReason === 'cooldown' ? 'Waiting for the five-minute trade interval.' : event.budgetReason === 'daily-limit' ? 'Daily faucet gas or activity limit reached. Resumes next UTC day.' : event.budgetReason === 'gas-reserve' ? 'Preserving the execution wallet gas reserve. No new trade signed.' : 'Current transaction fee exceeds the faucet budget. Waiting for an affordable estimate.' : event.state === 'blocked'
            ? 'Trading blocked by permission, valuation, runtime or pending-transaction checks.'
            : event.state === 'hold' ? 'The current proposal produced no trade.'
            : event.state === 'success' ? 'Agent trade confirmed. Inspect its Monad receipt below.'
            : event.state === 'reverted' ? 'Agent transaction reverted. Inspect its receipt.' : 'Reconciling the agent transaction.' };
      } })).then(() => {
        status = { ...status, running: false, state: 'stopped', changedAt: now(), message: 'Trader stopped. Submitted transactions may still mine; stopping does not revoke on-chain permission.' };
      }, () => {
        // Do not send provider errors, private paths, journal bytes or model input to the browser.
        status = { ...status, running: false, state: 'error', changedAt: now(), message: 'Trader stopped after a startup or storage failure. Check the server signer, reviewed deployment and durable transaction journal.' };
      }).finally(() => { if (task === current) { task = undefined; stop = undefined; } });
      task = current;
      return view();
    },
    async stop(value: string) {
      id(value);
      if (registrationId && registrationId.toLowerCase() !== value.toLowerCase()) throw new Error('A different agent occupies this runtime.');
      // A changed or removed configuration must not disable the stop control.
      if (!registrationId) await config(value);
      if (task) { status = { ...status, state: 'stopping', changedAt: now(), message: 'Stopping after the current operation. Submitted transactions remain on-chain.' }; stop?.abort(); }
      return view();
    },
    // Vite restarts stop the worker; its journal survives and is reconciled on the next start.
    async close() { stop?.abort(); await task; },
  };
}


/** Each server-reviewed configuration owns an independent worker and journal. */
export function autonomyRuntime(options: { configFile?: string; configDirectory?: string; run?: typeof runAutonomous; now?: () => number } = {}) {
  if (!options.configDirectory) return singleRuntime(options);
  const workers = new Map<string, ReturnType<typeof singleRuntime>>();
  async function runtime(value: string) {
    if (!/^0x[a-f0-9]{64}$/i.test(value)) throw new Error('Invalid registration identifier.');
    const key = value.toLowerCase(); const existing = workers.get(key); if (existing) return existing;
    const file = join(options.configDirectory!, key.slice(2) + '.json');
    try { await access(file); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return singleRuntime(); throw e; }
    // No await between this lookup and insert: concurrent calls share one instance.
    const raced = workers.get(key); if (raced) return raced;
    const worker = singleRuntime({ configFile: file, run: options.run, now: options.now }); workers.set(key, worker); return worker;
  }
  return {
    async status(id: string) { return (await runtime(id)).status(id); },
    async start(id: string) { return (await runtime(id)).start(id); },
    async stop(id: string) { return (await runtime(id)).stop(id); },
    async close() { await Promise.all([...workers.values()].map(worker => worker.close())); },
  };
}
