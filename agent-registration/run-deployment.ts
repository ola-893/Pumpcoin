import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createPublicClient, http, parseEther, keccak256, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { registrationService } from './service.js';
import { tradingService } from './trading.js';
import { nativeInvestmentService } from './native-investment.js';
import { poolFundingService } from './pool-funding.js';
import { readClient } from './rpc.js';
import { deployReviewed, type DeploymentKind, type CreationPlan } from './operator-deployment.js';

const root = fileURLToPath(new URL('../', import.meta.url));
async function main() {
  const [kind, id, ...flags] = process.argv.slice(2);
  if (!['vault','trading','guard','native','native-guard','pool-funder'].includes(kind) || !/^0x[0-9a-f]{64}$/.test(id ?? '')) throw new Error('Use operator:deploy -- <vault|trading|guard|native|native-guard|pool-funder> <registration-id> [--broadcast] [--env path] [--max-cost MON].');
  let broadcast = false, envFile = join(root,'.env'), maxCost = '0.3';
  const seen = new Set<string>();
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]; if (seen.has(flag)) throw new Error('Duplicate deployment option.'); seen.add(flag);
    if (flag === '--broadcast') broadcast = true;
    else if (flag === '--env' && flags[i+1] && !flags[i+1].startsWith('--')) envFile = resolve(flags[++i]);
    else if (flag === '--max-cost' && /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(flags[i+1] ?? '')) maxCost = flags[++i];
    else throw new Error('Invalid deployment option.');
  }
  let key: string | undefined; let oracleKey: string | undefined;
  try { const env = parseEnv(await readFile(envFile,'utf8')); key = env.PRIVATE_KEY; oracleKey = env.PUMPCOIN_PYTH_API_KEY; } catch { throw new Error('Cannot read the selected local .env.'); }
  if (!key || !/^(0x)?[0-9a-f]{64}$/i.test(key)) throw new Error('The selected local .env needs a valid PRIVATE_KEY. Never paste it into chat or browser configuration.');
  let account;
  try { account = privateKeyToAccount((key.startsWith('0x') ? key : '0x'+key) as Hex); } catch { throw new Error('The local deployment key is invalid.'); }
  const get = async (path:string) => JSON.parse(await readFile(join(root,path),'utf8'));
  const network = await get('deployments/pumpcoin-vault-network.json'), market = await get('deployments/pumpcoin-trading-network.json');
  if (network.chainId !== 10143 || market.chainId !== 10143) throw new Error('This deployment command only supports the reviewed Monad testnet.');
  const service = registrationService({ directory:join(root,'.local/agent-registrations'),vaultNetwork:network });
  const record = (await service.workerRegistration(id)).record;
  if (record.manifest.controller.toLowerCase() !== account.address.toLowerCase()) throw new Error('PRIVATE_KEY does not control this registration. No authority is substituted; use its controller key.');
  const client = readClient(network.rpcUrl);
  const trading = tradingService(network,market,join(root,'.local/vault-trading'),()=>service.records(),client,()=>oracleKey);
  const native = nativeInvestmentService(network,market,join(root,'.local/vault-native'),()=>service.records(),trading,client);
  const pool = poolFundingService(network,market,join(root,'.local/vault-liquidity'),trading,client);
  const prepare = async ():Promise<CreationPlan> => {
    if (kind === 'vault') return service.vaultPlan(id);
    if ((kind === 'native' || kind === 'native-guard')) return native.plan(id,'deploy-native',account.address,'0');
    if (kind === 'pool-funder') return pool.plan(id,'deploy-pool-funder',account.address);
    return trading.plan(id,kind === 'guard' ? 'deploy-valuation-guard' : 'deploy',account.address);
  };
  const confirm = async (hash:Hex,plan:CreationPlan) => {
    if (kind === 'vault') return service.confirmVault(id,hash);
    if ((kind === 'native' || kind === 'native-guard')) return native.receipt(id,plan.id!,hash);
    if (kind === 'pool-funder') return pool.receipt(id,plan.id!,hash);
    return kind === 'guard' ? trading.confirmGuard(id,hash) : trading.confirm(id,hash);
  };
  console.log(JSON.stringify({state:'checking',kind,registrationId:id,chainId:10143,deployer:account.address,broadcast,maxCostMON:maxCost}));
  const result = await deployReviewed({directory:join(root,'.local/deployments'),id:id as Hex,kind:kind as DeploymentKind,chainId:10143,account,client,
    broadcastClient:createPublicClient({chain:monadTestnet,transport:http(network.rpcUrl,{retryCount:0,timeout:15000,methods:{include:['eth_sendRawTransaction']}})}),broadcast,maxCostWei:parseEther(maxCost),prepare,confirm});
  if (result.state === 'verified') {
    const receipt = await client.getTransactionReceipt({hash:result.hash!});
    const code = await client.getCode({address:result.address!,blockNumber:receipt.blockNumber});
    const tx = await client.getTransaction({hash:result.hash!});
    if (!code || code === '0x') throw new Error('Verified deployment runtime is unavailable.');
    const manifest = {version:'PUMPCOIN-DEPLOYMENT-RECEIPT-v1',chainId:10143,registrationId:id,kind,deployer:account.address,address:result.address,transactionHash:result.hash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash,creationCodeHash:keccak256(tx.input),runtimeCodeHash:keccak256(code),gasPaidWei:result.gasPaidWei,scope:'Verified deployment only. Configuration activation, oracle warm-up and trading permissions are separate operations.'};
    const directory = join(root,'deployments/agents'), file = join(directory,`${id.slice(2)}-${kind}.json`);
    await mkdir(directory,{recursive:true});
    try { await writeFile(file,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'}); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || JSON.stringify(JSON.parse(await readFile(file,'utf8'))) !== JSON.stringify(manifest)) throw error; }
  }
  console.log(JSON.stringify(result));
}
main().catch(error => {
  // Only our short operator errors are public. Upstream signing/RPC errors can
  // contain signed bytes or request details, so never print them or their stack.
  const message = error instanceof Error && error.constructor === Error && error.message.length < 220 && !/0x[0-9a-f]{64}|\/Users\/|\/private\//i.test(error.message) ? error.message : 'Deployment stopped. Inspect the private journal and reviewed configuration before retrying; saved transactions are never replaced automatically.';
  console.error(message); process.exitCode = 1;
});
