# Oracle control and recovery

The v2 registry exposes `rootController()`, `oracle()`, `rotateOracle(address)`, `revokeOracle()`, and `OracleRotated(previousOracle, newOracle)`. The root address is fixed at deployment. Supply the Mera-derived EOA in `ROOT_CONTROLLER_ADDRESS` once onboarding is available; the current local demo uses an unlocked Anvil account and does not claim passkey integration.

Only the root can rotate/revoke. The writer cannot appoint its replacement. Revocation sets the writer to zero, disabling both credential issuance and credential revocation until the root selects a writer again. Existing attestations retain their tier and expiry; oracle revocation does not revoke them automatically. Borrower debt is untouched.

## Rotation sequence

1. Read the network chain ID, registry `rootController()` and `oracle()` from chain. Confirm that the root signer is available and the replacement is the intended writer.
2. Pause outgoing attestation submissions and drain/reconcile pending writes. Rejected stale writes must not be marked successful by the application.
3. Submit `rotateOracle(newWriter)` from the root. Wait for a successful mined receipt and read `oracle()` back. Verify the `OracleRotated` event.
4. Update the existing oracle service identity (same ERC-8004 agent ID) to describe the new writer; do not mint a new identity for each rotation. Until synchronization is confirmed, the status endpoint should expose the identity mismatch and the on-chain writer as the source of truth.
5. Confirm that the old writer can no longer submit or revoke, and that the new writer can make an expected test attestation. Resume submissions only after verification.

For CRE, distinguish the transaction sender from the authorized contract caller. CRE's signed reports are delivered through a forwarder into an `onReport` receiver. The registry writer should normally be the receiver adapter, whose own forwarder/workflow checks must also be configured. Changing only a relayer private key is not necessarily a registry-writer change. Never claim a generic forwarder is authorized to write directly without the receiver checks.

## Emergency revocation

From the root, call `revokeOracle()`, verify the receipt and zero `oracle()`, stop the writer, and mark the service inactive. Previously issued credentials remain valid until explicitly revoked or expired. After investigating, authorize the replacement via `rotateOracle()` and follow the rotation sequence. Root recovery itself depends on access to the configured passkey-derived account; this contract does not add another root-recovery authority.

## Verification so far

Contract tests cover root-only control, old-writer rejection, total write suspension, existing-credential preservation, and reauthorization. `contracts/script/local-demo.py` also exercises rotation, revocation, and recovery with mined local transactions. ERC-8004 synchronization has passed a local-fork integration test; see [identity operations](ORACLE-IDENTITY.md). Live Mera/CRE coordination and testnet deployment remain pending.
