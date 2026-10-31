import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {keccak256,parseTransaction,recoverTransactionAddress,type Address,type Hex,type PrivateKeyAccount} from 'viem';

export type SepoliaRequest={to?:Address;data:Hex;value?:bigint};
/** Operator-only, bounded testnet validation. Persist signed bytes before sending;
 * restart follows the same hash, including after an ambiguous RPC response. */
export async function sepoliaStep(o:{directory:string;step:string;account:PrivateKeyAccount;client:any;build:()=>Promise<SepoliaRequest>;remainingGasWei:bigint}){
 if(!/^[a-z][a-z0-9-]{0,50}$/.test(o.step)||await o.client.getChainId()!==11155111)throw new Error('Invalid Sepolia validation scope.');
 await mkdir(o.directory,{recursive:true,mode:0o700});
 const file=join(o.directory,o.step+'.json'),lockFile=join(o.directory,'sender.lock');
 const lock=await open(lockFile,'wx',0o600);
 try{
  let saved:any;
  try{saved=JSON.parse(await readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(!saved){
   const request=await o.build(),value=request.value??0n;
   if(value<0n||value>100000000000000n)throw new Error('Sepolia step exceeds its native-value limit.');
   let estimated:bigint;
   try{estimated=await o.client.estimateGas({account:o.account.address,...request});}
   catch(error){const e=error as any;const decoded=e.walk?.((x:any)=>x.name==='ContractFunctionRevertedError');const code=decoded?.data?.errorName;
    // These fields exclude calldata, URLs and RPC request bodies. Preserve local
    // diagnostics without exposing signing material in operator output.
    const detail={name:e.name,shortMessage:typeof e.shortMessage==='string'?e.shortMessage.slice(0,300):undefined,causes:[] as {name:string;code?:number;shortMessage?:string;message?:string}[]};
    for(let c=e.cause;c&&detail.causes.length<5;c=c.cause)detail.causes.push({name:c.name,code:typeof c.code==='number'?c.code:undefined,shortMessage:typeof c.shortMessage==='string'?c.shortMessage.slice(0,300):undefined,message:typeof c.message==='string'?c.message.replace(/0x[a-f0-9]{64,}/gi,'[hex omitted]').slice(0,300):undefined});
    const out=await open(join(o.directory,'simulation-error.json'),'w',0o600);try{await out.writeFile(JSON.stringify(detail));}finally{await out.close();}
    throw new Error(`Sepolia simulation failed (${typeof code==='string'&&/^[a-zA-Z0-9_]+$/.test(code)?code:'RPC estimation'}).`);}
   const gas=estimated*125n/100n;
   const fees=await o.client.estimateFeesPerGas(),maxFeePerGas=fees.maxFeePerGas as bigint,maxPriorityFeePerGas=fees.maxPriorityFeePerGas as bigint;
   if(maxFeePerGas<=0n||maxPriorityFeePerGas<0n||maxPriorityFeePerGas>maxFeePerGas||gas*maxFeePerGas>o.remainingGasWei)throw new Error('Sepolia validation would exceed its cumulative gas ceiling.');
   if(await o.client.getBalance({address:o.account.address})<value+gas*maxFeePerGas)throw new Error('Insufficient test ETH for this bounded step.');
   const nonce=await o.client.getTransactionCount({address:o.account.address,blockTag:'pending'});
   if(nonce!==await o.client.getTransactionCount({address:o.account.address,blockTag:'latest'}))throw new Error('Resolve the sender pending transaction before continuing.');
   const raw=await o.account.signTransaction({chainId:11155111,nonce,gas,maxFeePerGas,maxPriorityFeePerGas,type:'eip1559',...request,value});
   saved={step:o.step,from:o.account.address,request:{...request,value:String(value)},maximumGasWei:String(gas*maxFeePerGas),raw,hash:keccak256(raw)};
   const out=await open(file+'.tmp','wx',0o600);try{await out.writeFile(JSON.stringify(saved));await out.sync();}finally{await out.close();}
   await rename(file+'.tmp',file);const dir=await open(o.directory,'r');try{await dir.sync();}finally{await dir.close();}
  }
  const tx=parseTransaction(saved.raw),from=await recoverTransactionAddress({serializedTransaction:saved.raw});
  if(saved.step!==o.step||saved.from!==o.account.address||from!==o.account.address||keccak256(saved.raw)!==saved.hash||tx.chainId!==11155111||tx.type!=='eip1559'||(tx.data??'0x')!==saved.request.data||(tx.to??'').toLowerCase()!==(saved.request.to??'').toLowerCase()||(tx.value??0n)!==BigInt(saved.request.value)||(tx.value??0n)>100000000000000n||tx.gas!*tx.maxFeePerGas! !==BigInt(saved.maximumGasWei)||BigInt(saved.maximumGasWei)>o.remainingGasWei)throw new Error('Saved Sepolia step differs from its signed scope.');
  let receipt;
  try{receipt=await o.client.getTransactionReceipt({hash:saved.hash});}catch(e){if((e as Error).name!=='TransactionReceiptNotFoundError')throw e;}
  if(!receipt){
   if(await o.client.getTransactionCount({address:o.account.address,blockTag:'latest'})>tx.nonce!)throw new Error('Saved nonce was consumed without its receipt. Do not replace it.');
   try{const hash=await o.client.sendRawTransaction({serializedTransaction:saved.raw});if(hash!==saved.hash)throw new Error('Unexpected submission hash.');}catch{/* Reconcile the exact saved hash, never sign a replacement. */}
   receipt=await o.client.waitForTransactionReceipt({hash:saved.hash,timeout:120000,pollingInterval:1500});
  }
  const mined=await o.client.getTransaction({hash:saved.hash});
  if(receipt.status!=='success'||receipt.transactionHash!==saved.hash||mined.from.toLowerCase()!==o.account.address.toLowerCase()||(mined.to??'').toLowerCase()!==(saved.request.to??'').toLowerCase()||mined.input!==saved.request.data||mined.value!==BigInt(saved.request.value)||(await o.client.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw new Error('Sepolia receipt failed canonical verification. Journal retained.');
  return {step:o.step,hash:saved.hash as Hex,address:receipt.contractAddress as Address|undefined,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash as Hex,gasPaidWei:String(receipt.gasUsed*receipt.effectiveGasPrice),valueWei:saved.request.value as string};
 }finally{await lock.close();await unlink(lockFile);}
}
