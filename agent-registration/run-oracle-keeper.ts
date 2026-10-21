import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredSigner } from './signer.js';
import { registrationService } from './service.js';
import { checkedKeeper, oracleKeeper, KEEPER_NAME, type KeeperConfig } from './oracle-keeper.js';
import type { Hex } from 'viem';
const root = fileURLToPath(new URL('../', import.meta.url));

async function main() {
  try { process.loadEnvFile(join(root, '.env')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const [command = 'check', ...ids] = process.argv.slice(2), file = join(root, '.local/oracle-keeper-config.json');
  const network = JSON.parse(await readFile(join(root, 'deployments/pumpcoin-vault-network.json'), 'utf8'));
  const market = JSON.parse(await readFile(join(root, 'deployments/pumpcoin-trading-network.json'), 'utf8'));
  if (command === 'init') {
    if (!ids.length) throw new Error('Select explicit registrations for the keeper.');
    const service = registrationService({ directory: join(root, '.local/agent-registrations') });
    const records = await Promise.all(ids.map(id => service.workerRegistration(id)));
    const controller = records[0].prepared.manifest.controller;
    if (records.some(r => r.prepared.manifest.controller !== controller || !r.record.binding || r.record.authorization.challenge.chainId !== 10143)) throw new Error('Select bound Monad vaults with one controller.');
    const signer = await configuredSigner(); if (!signer) throw new Error('Configure the encrypted signer first.');
    try {
      const address = await signer.provision(controller, KEEPER_NAME);
      const config: KeeperConfig = checkedKeeper({ version: 'PUMPCOIN-ORACLE-KEEPER-v1', chainId: 10143, controller, address,
        registrations: ids as Hex[], refreshAheadSeconds: 120, pollIntervalMs: 30000, maxFeePerGasWei: '500000000000', mode: 'on-demand', enabled: false, validUntil: 0,
        economy: { maxTransactionGasWei: '300000000000000000', maxDailyGasWei: '2000000000000000000', gasReserveWei: '100000000000000000', minimumTradeIntervalMs: 0, maxTradesPerDay: 24 } });
      await mkdir(join(root, '.local'), { recursive: true, mode: 0o700 });
      await writeFile(file, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ address, enabled: false, scope: 'Separate encrypted keeper provisioned. Unfunded, disabled, no oracle or trading transactions submitted. Fund only with testnet MON; enable a reviewed time window separately.' }));
    } finally { signer.close(); }
    return;
  }
  const config = checkedKeeper(JSON.parse(await readFile(file, 'utf8')));
  if (command === 'request') { const { requestOracleRefresh } = await import('./oracle-demand.js'); if (ids.length !== 1 || !await requestOracleRefresh(ids[0], root)) throw new Error('Select a configured on-demand registration.'); console.log(JSON.stringify({ state: 'requested', scope: 'Refresh request queued for ten minutes. This does not enable, fund or start the keeper.' })); return; }
  if (command === 'check') { console.log(JSON.stringify(await oracleKeeper(config, { root, network, market }).cycle(false), null, 2)); return; }
  if (command !== 'run') throw new Error('Use init <registration-ids>, check, or run.');
  // Run refuses disabled/expired configuration before unlocking the keeper key.
  if (!config.enabled || config.validUntil <= Math.floor(Date.now() / 1000) || config.validUntil > Math.floor(Date.now() / 1000) + 86400) throw new Error('Review and enable a bounded keeper window first.');
  const signer = await configuredSigner(); if (!signer) throw new Error('Configure the encrypted signer.');
  const stop = new AbortController(); process.once('SIGINT', () => stop.abort()); process.once('SIGTERM', () => stop.abort());
  try {
    const account = await signer.account(config.controller, KEEPER_NAME), keeper = oracleKeeper(config, { root, network, market, account });
    while (!stop.signal.aborted && Date.now() < config.validUntil * 1000) {
      let delay = config.pollIntervalMs;
      try { const result = await keeper.cycle(true); console.log(JSON.stringify(result)); if (result.state === 'submitted' || result.state === 'success') delay = 0; }
      catch(error) {
        const reason=error instanceof Error&&error.constructor===Error&&error.message.length<220&&!/0x[0-9a-f]{64}|\/Users\/|\/private\//i.test(error.message)?error.message:'Upstream RPC, proof or receipt check failed.';
        console.log(JSON.stringify({ state: 'blocked', reason, scope: 'Keeper blocked by budget, proof, dependency, receipt or RPC checks. No alternative price or fresh nonce substituted. Inspect the durable journal before restarting.' })); break;
      }
      await new Promise<void>(done => { const finish = () => { clearTimeout(timer); stop.signal.removeEventListener('abort', finish); done(); }; const timer = setTimeout(finish, delay); stop.signal.addEventListener('abort', finish, { once: true }); });
    }
  } finally { signer.close(); }
}
main().catch(() => { console.error('Keeper operation failed. Check reviewed configuration, signer, dependency pins, oracle access and durable journal. No secrets or upstream errors are displayed.'); process.exitCode = 1; });
