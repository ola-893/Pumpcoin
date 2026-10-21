import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const files = [];
const add = async (path, data) => { data ??= await readFile(path); files.push({ file: path, data: data.toString('base64'), encoding: 'base64' }); };
async function tree(path, filter = () => true) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) await tree(p, filter);
    else if (filter(p)) await add(p);
  }
}
for (const p of ['package.json', 'package-lock.json', 'tsconfig.json']) await add(p);
for (const p of ['api', 'hosting', 'agent-registration', 'local-inference', 'market-data', 'research', 'practice', 'vault', 'app/src/lib']) await tree(p, p => /\.(ts|tsx)$/.test(p));
await tree('app/dist');
for (const p of ['hosted-public.json', 'pumpcoin-vault-network.json', 'pumpcoin-trading-network.json']) await add('deployments/' + p);
// Only public runtime pins and ABI/bytecode are needed; omit compiler metadata.
const names = ['PumpCoinRegisteredVault', 'PumpCoinDemoRegisteredVault', 'SupraPythVaultTradingBundle', 'ChainlinkVaultTradingBundle', 'VaultTradingBundle', 'RestrictedSpotAdapter', 'SupraPythVaultValuationSource', 'ChainlinkVaultValuationSource', 'PythVaultValuationSource', 'DexCheckedPythVaultValuationSource', 'UniswapV4VaultVenue', 'VaultInvestorGateway', 'GuardedHybridValuationSource', 'NativeVaultInvestorGateway', 'TestnetPoolFunder'];
for (const name of names) {
  const source = `contracts/out/${name === 'DexCheckedPythVaultValuationSource' ? 'PythVaultValuationSource' : name}.sol/${name}.json`;
  const a = JSON.parse(await readFile(source));
  await add(source, Buffer.from(JSON.stringify({ abi: a.abi, bytecode: a.bytecode, deployedBytecode: a.deployedBytecode })));
}
const config = JSON.parse(await readFile('vercel.json'));
// Ship the frontend built and checked here; Vercel still compiles the API.
config.installCommand = 'npm ci'; config.buildCommand = ''; config.outputDirectory = 'app/dist';
await add('vercel.json', Buffer.from(JSON.stringify(config)));
if (files.some(x => /(?:^|\/)\.env|(?:^|\/)\.local\//.test(x.file))) throw new Error('Private file in deployment.');
const output = '/private/tmp/pumpcoin-vercel-files.json';
await writeFile(output, JSON.stringify(files));
console.log(JSON.stringify({ output, files: files.length, bytes: files.reduce((n,x) => n + Buffer.from(x.data, 'base64').length, 0), digest: createHash('sha256').update(JSON.stringify(files)).digest('hex') }));
