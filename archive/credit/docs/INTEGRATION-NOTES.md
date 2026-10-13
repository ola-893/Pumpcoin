# Integration notes checked 2026-09-18

These correct assumptions in the supplied brief without starting later milestones.

## CRE

- [Supported networks](https://docs.chain.link/cre/supported-networks-ts): Monad Testnet currently requires CLI **v1.30.0+** and TypeScript SDK **v1.19.0+**. Confirm tenant-enabled chain/forwarder configuration with `cre workflow supported-chains --output json` when credentials are available.
- [Consumer contracts](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts): CRE writes a signed report through KeystoneForwarder to an `onReport` receiver. The brief's direct `writeContract` pseudocode and a bare authorized signer are not the final integration. Use a receiver adapter with forwarder/workflow checks and rotate the registry writer in milestone 3.
- [Simulation](https://docs.chain.link/cre/guides/operations/simulating-workflows): writes are dry-run by default; `--broadcast` is required to send them. Simulation runs locally on one node, with no real DON consensus. The demo must not describe local execution as decentralized verification. Live deployment/access requirements must be checked for the actual tenant.

## Reclaim

[Current JS SDK documentation](https://docs.reclaimprotocol.org/manual/js-sdk/usage) describes `verifyProof` returning an object containing `isVerified` and verified data, and supports pinning the provider version/hash. Do not treat the entire result object as a boolean or blindly extract data from an unverified incoming proof. SDK execution inside CRE's WASM runtime also needs a compatibility test; successful Node.js execution alone does not establish that compatibility.

Use off-chain verification for the requested baseline. An on-chain Reclaim verifier and Semaphore are not prerequisites for these contracts. A ZK threshold circuit remains a later milestone and must bind its private value to authentic source evidence, not just to an arbitrary witness.

## Monad and sponsor eligibility

The supplied public RPC returned `eth_chainId = 0x279f` (10143). [Monad developer portal](https://developers.monad.xyz/) and [Alchemy's Monad Testnet page](https://www.alchemy.com/rpc/monad-testnet) also identify chain 10143. Alchemy usage is **not** demonstrated by using the public Monad RPC.

[Metropolis organizer information](https://www.risein.com/monad/monad-metropolis-hackathon) lists the September 1–October 13 window and the Trust/Identity & AI Infrastructure track. [The official hackathon site](https://hackathon.monad.xyz/) is the submission source of truth.

**No sponsor bounty qualification is claimed.** Exact Chainlink, Envio, Alchemy, and Category Labs/Mera judging/submission requirements are not yet confirmed for this project. Record the official criteria and integration evidence before claiming each bounty; package installation alone is insufficient. The generic event page does not establish individual eligibility.

## v2 ERC-8004 preflight

The [official contract deployment list](https://github.com/erc-8004/erc-8004-contracts#contract-addresses) distinguishes Monad mainnet from testnet. On chain 10143, the two mainnet addresses in the v2 brief returned empty `eth_getCode`. The listed testnet addresses both returned nonempty proxy bytecode:

- Identity: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Reputation: `0x8004B663056A597Dffe9eCcC1965A193B7388713`

These are configuration/preflight findings only, not a completed registration. The actual SDK is [`agent0-sdk`](https://github.com/agent0lab/agent0-ts), exporting `SDK`, rather than the illustrative `AgentRegistry` import. The [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004) distinguishes the identity owner, the registration document, and `agentWallet` (a verified payment wallet). Updating the latter requires control of the new wallet; it is not an arbitrary metadata assignment. Preserve the same oracle agent ID across rotations and ensure the root retains control after the old operational key is revoked.
