import { readFile, mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
export async function requestOracleRefresh(id: string, root = defaultRoot, now = Date.now()) {
  if (!/^0x[0-9a-f]{64}$/.test(id)) throw new Error('Invalid oracle refresh registration.');
  let config;
  try { config = JSON.parse(await readFile(join(root, '.local/oracle-keeper-config.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  if (config.mode !== 'on-demand' || !Array.isArray(config.registrations) || !config.registrations.includes(id)) return false;
  const directory = join(root, '.local/oracle-keeper-demand'), file = join(directory, `${id.slice(2)}.json`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { const prior = JSON.parse(await readFile(file, 'utf8')); if (prior.id === id && prior.expiresAt > now && prior.expiresAt <= now + 600000) return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temp = `${file}.${process.pid}.${now}.tmp`, handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify({ id, requestedAt: now, expiresAt: now + 600000 })); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, file); return true;
}
export async function activeOracleDemand(ids: string[], root = defaultRoot, now = Date.now()) {
  const active = new Set<string>();
  for (const id of ids) {
    if (!/^0x[0-9a-f]{64}$/.test(id)) throw new Error('Invalid keeper demand scope.');
    try {
      const request = JSON.parse(await readFile(join(root, '.local/oracle-keeper-demand', `${id.slice(2)}.json`), 'utf8'));
      if (request.id !== id || !Number.isSafeInteger(request.requestedAt) || !Number.isSafeInteger(request.expiresAt) || request.requestedAt > now || request.expiresAt - request.requestedAt !== 600000) throw new Error('Invalid keeper demand request.');
      if (request.expiresAt > now) active.add(id);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return active;
}
