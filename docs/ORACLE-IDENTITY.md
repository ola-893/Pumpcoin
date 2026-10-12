# Oracle service identity

This implements v2's **oracle** identity only. It does not register borrowers or claim that ERC-8004 establishes unique personhood.

`oracle-identity/register.ts` uses `agent0-sdk` 1.7.1 and the actual deployed testnet registries. The addresses supplied in the v2 brief were mainnet addresses. The corrected values are taken from the [official deployment list](https://github.com/erc-8004/erc-8004-contracts#contract-addresses); the script verifies bytecode, chain ID, and the reputation registry's identity pointer before doing anything.

The durable identity belongs to `AttestationRegistry.rootController()`. Changing the operational writer updates the same identity; it does not mint a new identity or discard its feedback. A persisted state file records the agent ID and pending mint hash. Keep this file backed up. Concurrent commands use an exclusive lock; inspect stale locks and pending receipts before manually removing them. If the process dies between broadcast and saving the returned hash, inspect the owner's registration receipts before retrying a mint.

The registration JSON is embedded in a data URI stored on-chain, avoiding an IPFS upload dependency. It includes the current `walletAddress`, registry, root, explicit privacy mode, and HTTPS status endpoint. The card describes the actual plaintext baseline, not a working ZK range proof. Revocation publishes `active: false` and a zero writer. The status endpoint is supplied configuration; this patch does not deploy a status web service or fabricate reputation feedback.

## Borrower identity stretch goal

Human-operated borrower registration is a possible application of the generic registration/ownership interfaces, not a claim that the standard verifies human identity. Oracle service identity is implemented; borrower registration, reputation feedback and transfer detection are deferred. AttestationRegistry and CreditLine remain authoritative for source eligibility and debt respectively; ERC-8004 is not a replacement SBT or borrowing entitlement.

The [ERC-8004 draft](https://eips.ethereum.org/EIPS/eip-8004) uses transferable ERC-721 identities. Transfer retains the identity handle and associated feedback; it clears `agentWallet`, requiring new-owner wallet verification. Selling the identity can therefore carry its reputation to another owner. A future borrower integration must detect transfers/ownership drift, suspend reliance on inherited credit reputation and require fresh source/wallet verification without erasing or reassigning debt. Detection mitigates reliance; it does not make the NFT nontransferable. Neither unique personhood nor resistance to feedback manipulation follows from registration.

## Wallet consent and root signing

ERC-8004's reserved `agentWallet` is a verified payment wallet, not arbitrary metadata. The [standard](https://eips.ethereum.org/EIPS/eip-8004) requires consent from a new wallet. When possible, the synchronizer binds the current EOA writer using its consent signature or local demo key. Otherwise it clears a stale verified wallet and reports `walletProofPending`, while the public card still states the actual writer. A CRE receiver contract is published as the writer but is not automatically bound as an EOA payment wallet.

The default command is read-only and prints a proposed transaction plus synchronization status:

```sh
npm run oracle
npm run oracle:watch
```

To write with a configured **testnet EOA root**, use the private-key variable in the ignored local `.env` and explicitly select broadcast mode:

```sh
npm run oracle -- --broadcast
npm run oracle:watch -- --broadcast
```

For a Mera passkey root, call the exported `synchronize()` with its authorized `walletProvider`. This interface is provided; the Mera connector has not yet been integrated or tested. Do not export a passkey's private key to run this CLI. A smart account receiving the identity NFT must support ERC-721 safe receipt. The fork test found that the standard Anvil address already had delegated code on Monad that rejected registration, so it uses a clean local EOA instead; this is not a test of Mera compatibility.

The 15-second watcher reconciles after `OracleRotated`, including revocation, and retries incomplete updates against the same ID. It also checks current state on startup to recover missed events. Updating the external identity is a separate transaction: the card can be temporarily stale after rotation. Consumers must compare its writer to the live registry. The watcher needs an authorized root signer for unattended writes; read-only mode merely reports drift. Nothing starts a background watcher automatically.

## Verification

`npm run oracle:fork-demo` tests the deployed ERC-8004 implementation on a disposable local fork: mint, pending-mint recovery, missing-consent clearing, signature-authorized wallet rotation, stable agent ID, revocation, and idempotent reconciliation. `deployments/oracle-fork.json` is a local test record, not proof of a Monad registration. Live deployment remains blocked on a funded root/deployer, deployed ProofLine addresses, and an actual status endpoint.

`npm audit` currently reports eight high findings in the SDK's transitive Helia/libp2p dependency tree. This implementation does not configure or start its embedded IPFS node; it uses data URIs. The dependency findings remain unresolved and should be reviewed before exposing this process as a service. The offered automatic fix downgrades the SDK, so it was not applied blindly.
