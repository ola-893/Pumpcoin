# ProofLine wallets and agent-performance evidence

PumpCoin's `/proofline` screen concerns agent trading/performance evidence. The legacy Reclaim verifier in `eligibility/server.ts` extracts Stripe income; it has not been reused or relabeled as a trading-performance verifier.

## What works

- Mera 0.2.0 creates or recovers an EOA using passkey PRF and the documented BIP39/BIP32 Ethereum account path `m/44'/60'/0'/0/0`.
- Browser EOAs are discovered with EIP-6963 and a `window.ethereum` fallback. Connection asks only for account access. No signature, chain switch or transaction happens automatically.
- Browser wallets must explicitly switch to Monad testnet, chain 10143, to perform the ownership check. An unknown network requires manual wallet configuration; no network is silently added.
- The read-only ownership check uses EIP-191 message signing, followed by local EOA recovery. It binds the selected wallet, application origin, 256-bit random nonce, five-minute lifetime, exact evidence bundle digest, evidence chain/vault, historical manager, configuration, strategy, and block interval.
- Account/network/provider disconnect events invalidate pending checks. Pre/post-prompt provider reads catch silent changes; a revision counter catches changing away and back. The UI checks expiry again after signing. Stale signatures do not produce a successful receipt.
- Export is a public signature receipt, with `authority: none`. It establishes only control of the signing EOA, not control of an agent, server authentication, registration, investment eligibility, transaction permission, or independently verified trading performance.
- Public evidence is readable without connecting. The existing archive is reconciled locally using vault accounting, retaining deposits, withdrawals and the loss. It remains a scripted Anvil simulation on chain 31337, regardless of the wallet's network.

## Passkey boundaries

Mera PRF output, BIP39 seed, derived private-key nodes and the signing session are used inside a single operation. The session is ended and mutable secret buffers are cleared in `finally`, on success or failure. Connect releases the session immediately; each ownership signature requests a fresh passkey assertion. No signing account is retained in React state. JavaScript strings/intermediate allocations cannot be guaranteed erased; application scripts and the host remain part of the trust boundary.

Only public credential ID metadata is written to browser storage. The earlier `unora.mera.credential.v1` metadata is accepted for recovery on the same host. If browser storage is unavailable, discoverable passkey recovery remains possible. Selecting a different passkey during signing fails the address check.

Passkeys require HTTPS or localhost. The IP-address preview explains the limitation and links to the same page on `localhost`. This changes the origin; drafts stored on `127.0.0.1` are not silently transferred. Passkeys are tied to their relying-party hostname: deploying on a different hostname must be a deliberate recovery/migration decision, not an invisible UI change.

PRF support cannot be inferred from `PublicKeyCredential` availability. Actual creation/recovery must succeed. `PRF_UNAVAILABLE` leaves browser-wallet fallback available and explains that a passkey may still have been created. Create-new and recover-existing are separate actions.

Official support guidance checked on 2026-10-11:

- [Mera authenticator support](https://mera.category.xyz/authenticator-support/): includes iCloud Keychain on macOS Safari/Chrome, signed-in Google Password Manager on desktop Chrome, and other tested authenticators. Chrome local-profile storage is listed as unsupported. The prose about “only Google Password Manager” is narrower than the table; do not turn it into a blanket ban on iCloud/third-party authenticators.
- [Mera derivation recipe](https://mera.category.xyz/recipes/create-passkey-accounts/).
- [Mera security model](https://mera.category.xyz/concepts/security-model/).

## Explicitly unavailable

No transaction/approval/deposit UI is enabled, and no wallet funds are required for the ownership signature. A Mera account is an ordinary viem-compatible EOA, but live ProofLine transaction submission is not configured here. No agent trading provider, independently pinned public vault/identity deployment, server-side challenge consumption or trading-performance attestation pipeline has been configured. The browser-generated challenge is a read-only ownership demonstration, not a server login/replay-prevention protocol.

To accept a real performance submission, separately configure the trusted chain/vault/deployment block, bind its registered agent/controller and strategy periods, collect complete canonical receipts and valuation checkpoints from the required evidence source, and verify them independently. A server authorization workflow needs issued, expiring, single-use challenges and consumption. An operator signature cannot substitute for any of these. The existing `vault/chain-history.ts` verifier offers the RPC accounting foundation; a lying RPC remains a disclosed trust boundary.

## Validation

`tests/proofline-wallet.test.ts` covers recovered signer checks, malformed wallet/signature data, wrong chain, silent changes, pending prompt invalidation, changes away and back, scope/expiry tampering, exact archive byte binding, and Mera session termination on both success and failure.

Browser evidence in `docs/testing/proofline-wallet-20261011/` uses a mocked EIP-1193 provider and mocked WebAuthn PRF with the actual Mera SDK/cryptography. It is not a real-device passkey acceptance test. No transactions were broadcast. Before a public demo, test create → reconnect → sign on the intended physical device/browser/password manager and final hostname, plus browser-wallet fallback.
