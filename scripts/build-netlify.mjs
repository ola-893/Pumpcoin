import {mkdir,readFile,writeFile,readdir,copyFile,unlink} from 'node:fs/promises';
import {relative,resolve,dirname,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../app/package.json',import.meta.url));
const {build}=require('esbuild');
const root=process.cwd(),output='.netlify/v1/functions/pump-api';
await mkdir(output,{recursive:true});
// Preserve each source module's asset base after bundling. This is also required
// for hashing the exact research source files committed by the signed policy.
await build({entryPoints:['hosting/netlify.ts'],outfile:join(output,'pump-api.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',
  banner:{js:'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'},
  footer:{js:`export const config = {nodeBundler:"none",includedFiles:["${output}/**"],nodeVersion:"22"};`},
  plugins:[{name:'module-assets',setup(b){b.onLoad({filter:/\.ts$/},async args=>{
    if(!args.path.startsWith(root+'/')||args.path.includes('/node_modules/'))return;
    const path=relative(root,args.path).replaceAll('\\','/');
    const contents=(await readFile(args.path,'utf8')).replaceAll('import.meta.url',`new URL(${JSON.stringify('./'+path)}, import.meta.url).href`);
    return {contents,loader:'ts',resolveDir:dirname(args.path)};
  });}}]});
async function copy(path){const dest=join(output,path);await mkdir(dirname(dest),{recursive:true});await copyFile(path,dest);}
for(const name of ['hosted-public.json','hosted-research.json','pumpcoin-vault-network.json','pumpcoin-trading-network.json','pumpcoin-sepolia-vault-network.json','pumpcoin-sepolia-trading-network.json'])await copy('deployments/'+name);
for(const dir of ['research','practice'])for(const name of await readdir(dir))if(name.endsWith('.ts'))await copy(join(dir,name));
const artifacts=JSON.parse(await readFile('deployments/hosted-contracts.json','utf8'));
for(const [path,value] of Object.entries(artifacts)){
  if(!/^contracts\/out\/[A-Za-z0-9]+\.sol\/[A-Za-z0-9]+\.json$/.test(path))throw new Error('Invalid public contract artifact path.');
  const dest=join(output,path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,JSON.stringify(value));
}
await unlink(join(output,'config.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});
console.log('Netlify API packaged with verified public records, original research source and public contract artifacts.');
