import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

// The unlock file is a service credential. Provision it OUTSIDE the checkout and
// signer directory, then mount it read-only into the helper and worker processes.
const path = process.argv[2];
if (!path || !isAbsolute(path)) throw new Error('Usage: npm run signer:init -- /absolute/private/path/unlock');
await mkdir(dirname(path), { recursive: true, mode: 0o700 });
const password = randomBytes(48);
try { await writeFile(path, password, { mode: 0o600, flag: 'wx' }); }
finally { password.fill(0); }
console.log('Signer unlock file created with private permissions. Back it up separately; never commit or share its contents.');
