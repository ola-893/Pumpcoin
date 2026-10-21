import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registrationService } from '../agent-registration/service.js';
import { readDirectory } from '../app/src/lib/agent-directory.js';

const records = (await registrationService({ directory: '.local/agent-registrations' }).records()).filter(r => r.authorization.challenge.chainId === 10143);
await readDirectory({ records });
const metadata: Record<string, unknown> = {};
for (const kind of ['vault-native', 'vault-trading', 'vault-liquidity']) {
  const directory = join('.local', kind);
  for (const file of await readdir(directory).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e; })) {
    if (!/^[0-9a-f]{64}(?:-[0-9a-f]{40})?\.json$/.test(file)) continue;
    const value = JSON.parse(await readFile(join(directory, file), 'utf8'));
    if (Object.keys(value).some(key => !['address', 'transactionHash', 'source', 'guard'].includes(key))) throw new Error(`Unexpected public metadata in ${kind}/${file}.`);
    metadata[`${kind}/${file}`] = value;
  }
}
await writeFile('deployments/hosted-public.json', JSON.stringify({ records, metadata }, null, 2) + '\n');
console.log(`Exported ${records.length} signed public registrations; no private runtime configuration or signing material.`);
