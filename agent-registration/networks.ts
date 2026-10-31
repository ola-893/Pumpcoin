/** Execution identities are explicit; a chain choice never changes a signed record. */
export const ACTIVE_CHAIN_ID = 11155111;
export const testnets = {
  11155111: {id:11155111,name:'Ethereum Sepolia',nativeSymbol:'ETH',wrappedSymbol:'WETH',mode:'ethereum-sepolia',rpcUrl:'https://ethereum-sepolia-rpc.publicnode.com',explorer:'https://sepolia.etherscan.io'},
  10143: {id:10143,name:'Monad testnet',nativeSymbol:'MON',wrappedSymbol:'WMON',mode:'monad-testnet',rpcUrl:'https://testnet-rpc.monad.xyz',explorer:'https://testnet.monadexplorer.com'},
  31337: {id:31337,name:'Local simulation',nativeSymbol:'ETH',wrappedSymbol:'WETH',mode:'local-simulation',rpcUrl:'http://127.0.0.1:8545',explorer:''},
} as const;
export type ExecutionChainId = keyof typeof testnets;
export function executionNetwork(id:number){if(!(id in testnets))throw new Error('Unsupported execution testnet.');return testnets[id as ExecutionChainId];}
export function publicTestnet(id:number){return id===11155111||id===10143;}
