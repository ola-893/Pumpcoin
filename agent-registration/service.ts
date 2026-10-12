import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { keccak256, stringToHex, type Hex } from 'viem';
import { checkedPrepared, checkAuthorizations, runtimeConfigHash, type Challenge, type Prepared } from './core.js';
import { deployment, identityPlan, verifyBinding, type Deployment } from './binding.js';
import { checkLocalWorker, matchingDetection } from './worker.js';
import { detectLocalModel } from '../local-inference/discovery.js';
import { prepareVault, confirmVault, vaultNetwork, type VaultNetwork } from './vault-setup.js';
import type { RegistrationRecord, WorkerReceipt } from './types.js';
import { permissionStatus, permissionPlan } from './permissions.js';
import type { ExecutionSignerStore } from './signer.js';
export type { RegistrationRecord } from './types.js';
type Session = { challenge: Challenge; prepared: Prepared; job?: { status: 'running' | 'ready' | 'error'; result?: WorkerReceipt; error?: string }; checkedAt?: number; consumed: boolean };
export function registrationService(options: { directory: string; signer?: () => Promise<ExecutionSignerStore | undefined>; config?: Deployment; vaultNetwork?: VaultNetwork; now?: () => number; worker?: typeof checkLocalWorker; detect?: typeof detectLocalModel; binding?: typeof verifyBinding; plan?: typeof identityPlan }) {
  const sessions = new Map<string, Session>(), now = options.now ?? Date.now, worker = options.worker ?? checkLocalWorker, detect = options.detect ?? detectLocalModel;
  const config = options.config && deployment(options.config);
  const setup = options.vaultNetwork && vaultNetwork(options.vaultNetwork), confirming = new Set<string>();
  if (setup && config && setup.chainId !== config.chainId) throw new Error("Vault setup and binding chains differ.");
  let working = false;
  const session = (id: string, origin: string) => { const s = sessions.get(id); if (!s || s.consumed || s.challenge.origin !== origin || now() >= s.challenge.expiresAt) throw new Error('Registration session is expired, consumed or belongs to another origin. Start again.'); return s; };
  const recordPath = (id: string) => { if (!/^0x[a-f0-9]{64}$/.test(id)) throw new Error('Invalid local registration ID.'); return join(options.directory, id.slice(2) + '.json'); };
  async function save(id: Hex, value: unknown, create = false) {
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const destination = recordPath(id), temporary = destination + '.' + randomBytes(8).toString('hex') + '.tmp';
    if (create) { await writeFile(destination, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); return; }
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); await rename(temporary, destination);
  }
  async function read(id: string) {
    const path = recordPath(id);
    if ((await stat(path)).size > 131072) throw new Error('Stored registration is too large.');
    const value = JSON.parse(await readFile(path, 'utf8')) as { public: RegistrationRecord; private: Prepared['privateRuntimeConfig'] };
    const p = checkedPrepared({ manifest: value.public.manifest, commitment: value.public.commitment, privateRuntimeConfig: value.private });
    if (!!value.public.authorization.challenge.demoMode !== !!p.manifest.vaultPolicy) throw new Error('Signed demo policy differs from the registration.');
    if (value.public.id !== id || value.public.investmentEligible !== false || value.public.authorization.challenge.commitment !== p.commitment || value.public.authorization.challenge.runtimeConfigHash !== runtimeConfigHash(p) || value.public.authorization.challenge.controller !== p.manifest.controller || value.public.authorization.challenge.executionKey !== p.manifest.executionKey) throw new Error('Stored registration authorization does not match.');
    await checkAuthorizations(value.public.authorization.challenge, value.public.authorization.controllerSignature, value.public.authorization.executionSignature, value.public.authorization.challenge.expiresAt - 1);
    return { record: value.public, prepared: p };
  }
  return {
    configured: !!config,
    executionSignerConfigured: !!options.signer,
    async executionWallet(controller: string, name: string) {
      const signer = await options.signer?.();
      if (!signer) throw new Error('Configure the encrypted execution signer on the local helper first.');
      return { address: await signer.provision(controller, name), custody: 'local-operator-encrypted-keystore' };
    },
    async authorizeExecution(id: string, origin: string, controllerSignature: Hex) {
      const s = session(id, origin);
      if (s.job?.status !== 'ready' || !s.checkedAt || now() - s.checkedAt > 120000) throw new Error('Run a fresh local worker check before authorizing.');
      const signer = await options.signer?.();
      if (!signer) throw new Error('Encrypted execution signer is not configured.');
      const signature = await signer.registrationSignature(s.challenge, s.prepared.manifest.name, controllerSignature, now());
      session(id, origin);
      return signature;
    },
    vaultSetupConfigured: !!setup,
    challenge(value: unknown, origin: string) {
      const p = checkedPrepared(value); new URL(origin);
      if (p.manifest.vaultPolicy && (setup?.chainId ?? config?.chainId ?? 10143) !== 10143) throw new Error('Instant demo registration is restricted to Monad testnet.');
      for (const [id, s] of sessions) if (s.consumed || s.challenge.expiresAt <= now()) sessions.delete(id);
      if (sessions.size >= 100) throw new Error('Too many pending registration sessions. Wait for them to expire.');
      const c: Challenge = { id: randomBytes(32).toString('hex'), origin, chainId: setup?.chainId ?? config?.chainId ?? 10143, commitment: p.commitment, runtimeConfigHash: runtimeConfigHash(p), controller: p.manifest.controller, executionKey: p.manifest.executionKey, expiresAt: now() + 600000, ...(p.manifest.vaultPolicy ? { demoMode: true as const } : {}) };
      sessions.set(c.id, { challenge: c, prepared: p, consumed: false }); return c;
    },
    check(id: string, origin: string) {
      const s = session(id, origin);
      if (s.job?.status === 'running') return s.job;
      if (working) throw new Error('Another worker check is running. Wait for it to finish.');
      working = true; s.job = { status: 'running' };
      void worker(s.prepared).then(result => { session(id, origin); s.checkedAt = now(); s.job = { status: 'ready', result }; }).catch(() => { s.job = { status: 'error', error: 'Worker check failed: keep the declared local model running, detect again, and retry. No hosted fallback was used.' }; }).finally(() => { working = false; });
      return s.job;
    },
    job(id: string, origin: string) { return session(id, origin).job ?? { status: 'idle' }; },
    async commit(id: string, origin: string, controllerSignature: Hex, executionSignature: Hex) {
      const s = session(id, origin);
      await checkAuthorizations(s.challenge, controllerSignature, executionSignature, now()); session(id, origin);
      if (s.job?.status !== 'ready' || !s.job.result || !s.checkedAt || now() - s.checkedAt > 120000) throw new Error('Run a fresh local worker check before completing registration.');
      // Reserve once before asynchronous inspection/persistence. A failed attempt requires a new session.
      s.consumed = true;
      const current = await detect(s.prepared.privateRuntimeConfig.inferenceBaseURL, () => {}); matchingDetection(s.prepared, current);
      if (now() >= s.challenge.expiresAt) throw new Error('Registration expired during the final local check.');
      const record: RegistrationRecord = { version: 'PUMPCOIN-LOCAL-REGISTRATION-v1', id: keccak256(stringToHex(s.challenge.id)), localAgentId: keccak256(stringToHex(JSON.stringify([s.challenge.chainId, s.prepared.manifest.controller, s.prepared.manifest.name]))), registeredAt: new Date(now()).toISOString(), manifest: s.prepared.manifest, commitment: s.prepared.commitment, authorization: { challenge: s.challenge, controllerSignature, executionSignature }, worker: s.job.result, status: 'registered-locally-vault-pending', investmentEligible: false };
      await save(record.id, { public: record, private: s.prepared.privateRuntimeConfig }, true); return record;
    },
    workerRegistration: read,
    async autonomyStatus(id: string) {
      if (!setup) throw new Error('Vault network is not configured.');
      const { record, prepared } = await read(id);
      if (!record.binding) throw new Error('Create and verify the agent vault first.');
      return permissionStatus(prepared, record.binding.vault, setup);
    },
    async autonomyPlan(id: string, action: 'grant' | 'revoke', days: number, dailyQuoteCap: string) {
      if (!setup) throw new Error('Vault network is not configured.');
      const { record, prepared } = await read(id);
      if (!record.binding) throw new Error('Create and verify the agent vault first.');
      return permissionPlan(prepared, record.binding.vault, setup, action, { days, dailyQuoteCap });
    },
    async records() {
      let names: string[]; try { names = await readdir(options.directory); } catch (e) { if ((e as {code?: string}).code === 'ENOENT') return []; throw e; }
      const files = names.filter(n => /^[a-f0-9]{64}\.json$/.test(n));
      if (files.length > 1000) throw new Error('Too many local records to list safely.');
      return (await Promise.all(files.map(n => read('0x' + n.slice(0, -5))))).map(x => x.record).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
    },
    async vaultPlan(id: string) {
      if (!setup) throw new Error('Vault setup is not configured on this server.');
      const { record, prepared } = await read(id);
      if (record.authorization.challenge.chainId !== setup.chainId) throw new Error('Registration and vault setup chains differ.');
      if (record.binding) throw new Error('This registration already has a recorded vault.');
      const names = await readdir(options.directory);
      for (const name of names.filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
        const other = (await read('0x' + name.slice(0, -5))).record;
        if (other.localAgentId === record.localAgentId && other.binding) throw new Error('This agent already has a vault in its history. Update that vault; do not reset its identity.');
      }
      return prepareVault(prepared, setup);
    },
    async confirmVault(id: string, transactionHash: Hex) {
      if (!setup) throw new Error('Vault setup is not configured on this server.');
      const first = await read(id), group = first.record.localAgentId;
      if (confirming.has(group)) throw new Error('Vault confirmation is already running.');
      confirming.add(group);
      try {
        const { record, prepared } = await read(id);
        if (record.authorization.challenge.chainId !== setup.chainId) throw new Error('Registration and vault setup chains differ.');
        if (record.binding) {
          if (record.binding.deploymentTransaction === transactionHash) return record;
          throw new Error('This registration already has another vault.');
        }
        const names = await readdir(options.directory);
        for (const name of names.filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
          const other = (await read('0x' + name.slice(0, -5))).record;
          if (other.localAgentId === group && other.binding) throw new Error('This agent already has a vault in its history.');
        }
        const binding = await confirmVault(prepared, transactionHash, setup);
        const updated = { ...record, binding, status: 'registered-locally-binding-checked' as const };
        await save(record.id, { public: updated, private: prepared.privateRuntimeConfig });
        return updated;
      } finally { confirming.delete(group); }
    },
    async plan(id: string, agentId?: string) { if (!config) throw new Error('No reviewed identity/vault deployment is configured. Configure code pins before preparing a public registration.'); return (options.plan ?? identityPlan)((await read(id)).prepared, config, undefined, agentId); },
    async bind(id: string, agentId: string) {
      if (!config) throw new Error('No reviewed identity/vault deployment is configured.');
      const { record, prepared } = await read(id), binding = await (options.binding ?? verifyBinding)(prepared, agentId, config);
      if (binding.chainId !== record.authorization.challenge.chainId) throw new Error('Binding belongs to a different registration chain.');
      const updated = { ...record, binding, status: 'registered-locally-binding-checked' as const }; await save(record.id, { public: updated, private: prepared.privateRuntimeConfig }); return updated;
    },
  };
}
