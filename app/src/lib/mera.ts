import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, createSecp256k1SigningSession, type PasskeyCredentialMetadata } from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import { passkeyAvailability } from './wallet-core.js';

const STORAGE_KEY = 'pumpcoin.mera.credential.v1';
function storedCredential(): PasskeyCredentialMetadata | undefined {
  try {
    // Preserve recovery of wallets created in the earlier Unora UI on this same host.
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('unora.mera.credential.v1');
    if (!raw) return;
    const value = JSON.parse(raw);
    if (typeof value.credentialId === 'string' && /^[A-Za-z0-9_-]+$/.test(value.credentialId)) return { credentialId: value.credentialId };
  } catch { /* Discovery still works without local metadata or available storage. */ }
}
// Keys live only during this call. Neither connect nor React state retains a signer.
// Each signature requires a fresh user-verified passkey assertion.
export async function withMeraAccount<T>(create: boolean, operation: (account: ReturnType<typeof toViemAccount>) => Promise<T>) {
  const unavailable = passkeyAvailability(); if (unavailable) throw new Error(unavailable);
  const result = create
    ? await createPasskeyWithPrfOutput({ rp: { id: location.hostname, name: 'PumpCoin' }, user: { name: 'PumpCoin wallet', displayName: 'PumpCoin wallet' } })
    : await getPasskeyPrfOutput({ rpId: location.hostname, credential: storedCredential() });
  let seed: Uint8Array | undefined;
  let root: HDKey | undefined, key: HDKey | undefined;
  let session: ReturnType<typeof createSecp256k1SigningSession> | undefined;
  try {
    seed = mnemonicToSeedSync(entropyToMnemonic(result.prfOutput, wordlist));
    root = HDKey.fromMasterSeed(seed); key = root.derive("m/44'/60'/0'/0/0");
    if (!key.privateKey) throw new Error('Passkey account derivation failed.');
    session = createSecp256k1SigningSession({ privateKey: key.privateKey });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ credentialId: result.credentialId })); } catch { /* No secrets are stored; recovery can use discoverable passkeys. */ }
    return await operation(toViemAccount(session));
  } finally {
    session?.end(); key?.wipePrivateData(); root?.wipePrivateData(); seed?.fill(0); result.prfOutput.fill(0);
  }
}
