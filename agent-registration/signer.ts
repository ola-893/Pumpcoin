import { createCipheriv, createDecipheriv, randomBytes, scrypt as derive } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, link, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { getAddress, keccak256, recoverMessageAddress, stringToHex, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { authorizationMessage, type Challenge } from './core.js';

const scrypt = promisify(derive);
const VERSION = 'PUMPCOIN-ENCRYPTED-SIGNER-v1';
type Envelope = { version: string; controller: Address; name: string; address: Address; salt: string; iv: string; tag: string; ciphertext: string };

async function privateFile(path: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await handle.stat();
    if (!s.isFile() || (s.mode & 0o077) !== 0 || (process.getuid && s.uid !== process.getuid()) || s.size > maxBytes) throw new Error('Signer files must be private, owner-controlled regular files.');
    return await handle.readFile();
  } finally { await handle.close(); }
}

/** Local operator custody, not an enclave. Never imported into browser/model code. */
export class ExecutionSignerStore {
  private readonly directory: string;
  private readonly password: Buffer;
  private provisioning: Promise<unknown> = Promise.resolve();
  private constructor(directory: string, password: Buffer) { this.directory = directory; this.password = password; }
  static async load(directory: string, passwordFile: string) {
    if (!isAbsolute(directory) || !isAbsolute(passwordFile) || passwordFile.startsWith(directory + '/')) throw new Error('Use absolute paths and keep the unlock file outside the signer directory.');
    const password = await privateFile(passwordFile, 1024);
    if (password.length < 32) { password.fill(0); throw new Error('Signer unlock file must contain at least 32 random bytes.'); }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const s = await lstat(directory);
    if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o077) !== 0 || (process.getuid && s.uid !== process.getuid())) { password.fill(0); throw new Error('Signer directory must be private and owned by this operator.'); }
    return new ExecutionSignerStore(directory, password);
  }
  close() { this.password.fill(0); }
  private scope(controller: string, name: string) {
    const address = getAddress(controller);
    if (/^0x0{40}$/i.test(address) || typeof name !== 'string' || !name.trim() || name.trim().length > 64) throw new Error('Provide a controller and agent name before creating its execution wallet.');
    const normalized = name.trim();
    return { controller: address, name: normalized, path: join(this.directory, keccak256(stringToHex(JSON.stringify([address, normalized]))).slice(2) + '.json') };
  }
  private async read(controller: string, name: string) {
    if (!this.password.some(x => x !== 0)) throw new Error('Execution signer is locked.');
    const scope = this.scope(controller, name);
    const e = JSON.parse((await privateFile(scope.path, 2048)).toString('utf8')) as Envelope;
    if (e.version !== VERSION || e.controller !== scope.controller || e.name !== scope.name || !/^[a-f0-9]{64}$/.test(e.salt) || !/^[a-f0-9]{24}$/.test(e.iv) || !/^[a-f0-9]{32}$/.test(e.tag) || !/^[a-f0-9]{64}$/.test(e.ciphertext)) throw new Error('Encrypted signer metadata is invalid.');
    const key = await scrypt(this.password, Buffer.from(e.salt, 'hex'), 32) as Buffer;
    let plaintext: Buffer | undefined;
    try {
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'hex'));
      cipher.setAAD(Buffer.from(JSON.stringify([VERSION, e.controller, e.name, e.address])));
      cipher.setAuthTag(Buffer.from(e.tag, 'hex'));
      plaintext = Buffer.concat([cipher.update(Buffer.from(e.ciphertext, 'hex')), cipher.final()]);
      const account = privateKeyToAccount(`0x${plaintext.toString('hex')}`);
      if (account.address !== e.address) throw new Error('Encrypted signer address does not match.');
      return account;
    } finally { key.fill(0); plaintext?.fill(0); }
  }
  provision(controller: string, name: string): Promise<Address> {
    const pending = this.provisioning.then(() => this.provisionKey(controller, name));
    this.provisioning = pending.catch(() => undefined);
    return pending;
  }
  private async provisionKey(controller: string, name: string): Promise<Address> {
    const scope = this.scope(controller, name);
    try { return (await this.read(controller, name)).address; }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if ((await readdir(this.directory)).length >= 100) throw new Error('Execution wallet capacity reached.');
    const secret = Buffer.from(generatePrivateKey().slice(2), 'hex'), salt = randomBytes(32), iv = randomBytes(12);
    const key = await scrypt(this.password, salt, 32) as Buffer;
    try {
      const address = privateKeyToAccount(`0x${secret.toString('hex')}`).address;
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(JSON.stringify([VERSION, scope.controller, scope.name, address])));
      const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]).toString('hex');
      const e: Envelope = { version: VERSION, controller: scope.controller, name: scope.name, address, salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext };
      // Publish complete encrypted bytes atomically; a second process never reads
      // a partially written key and cannot overwrite the winning key.
      const temporary = scope.path + '.' + randomBytes(8).toString('hex') + '.tmp';
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(e)); await file.sync(); }
      finally { await file.close(); }
      try { await link(temporary, scope.path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      finally { await unlink(temporary); }
      const parent = await open(this.directory, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
      return (await this.read(controller, name)).address;
    } finally { key.fill(0); secret.fill(0); }
  }
  async registrationSignature(c: Challenge, name: string, controllerSignature: Hex, now = Date.now()): Promise<Hex> {
    if (now >= c.expiresAt) throw new Error('Registration session expired.');
    const owner = await recoverMessageAddress({ message: authorizationMessage(c, 'controller'), signature: controllerSignature });
    if (owner.toLowerCase() !== c.controller.toLowerCase()) throw new Error('Controller must authorize this exact registration before the agent signs.');
    const account = await this.read(c.controller, name);
    if (account.address !== getAddress(c.executionKey)) throw new Error('This declaration uses a different execution signer.');
    return account.signMessage({ message: authorizationMessage(c, 'execution') });
  }
  // Only the headless worker uses this; there is no HTTP generic signing endpoint.
  async account(controller: string, name: string) { return this.read(controller, name); }
}

export async function configuredSigner(): Promise<ExecutionSignerStore | undefined> {
  const passwordFile = process.env.PUMPCOIN_SIGNER_PASSWORD_FILE;
  if (!passwordFile) return undefined;
  return ExecutionSignerStore.load(process.env.PUMPCOIN_SIGNER_DIRECTORY ?? fileURLToPath(new URL('../.local/execution-signers/', import.meta.url)).replace(/\/$/, ''), passwordFile);
}
