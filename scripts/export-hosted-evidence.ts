import {readFile,writeFile} from 'node:fs/promises';
import {verifyCheckpoint} from '../research/checkpoint.js';
import type {Checkpoint} from '../research/types.js';
import type {RegistrationRecord} from '../agent-registration/types.js';
const seed=JSON.parse(await readFile('deployments/hosted-public.json','utf8')) as {records:RegistrationRecord[]};
const checkpoints:Checkpoint[]=[];
for(const path of process.argv.slice(2)){
  const c=JSON.parse(await readFile(path,'utf8')) as Checkpoint;
  const r=seed.records.find(r=>r.id===c.session.registrationId);
  if(!r)throw new Error('Checkpoint registration is not published.');
  checkpoints.push(await verifyCheckpoint(c,r));
}
await writeFile('deployments/hosted-research.json',JSON.stringify(checkpoints)+'\n');
const names=['PumpCoinRegisteredVault','PumpCoinDemoRegisteredVault','PumpCoinSepoliaDemoRegisteredVault','SupraPythVaultTradingBundle','ChainlinkVaultTradingBundle','SepoliaChainlinkVaultTradingBundle','VaultTradingBundle','RestrictedSpotAdapter','SupraPythVaultValuationSource','ChainlinkVaultValuationSource','SepoliaChainlinkVaultValuationSource','PythVaultValuationSource','DexCheckedPythVaultValuationSource','UniswapV4VaultVenue','VaultInvestorGateway','GuardedHybridValuationSource','NativeVaultInvestorGateway','TestnetPoolFunder'];
const artifacts:Record<string,unknown>={};
for(const name of names){const path=`contracts/out/${name==='DexCheckedPythVaultValuationSource'?'PythVaultValuationSource':name}.sol/${name}.json`;const a=JSON.parse(await readFile(path,'utf8'));artifacts[path]={abi:a.abi,bytecode:a.bytecode,deployedBytecode:a.deployedBytecode};}
await writeFile('deployments/hosted-contracts.json',JSON.stringify(artifacts)+'\n');
console.log(`Exported ${checkpoints.length} signature-verified, deterministically replayed checkpoints and ${names.length} public contract artifacts.`);
