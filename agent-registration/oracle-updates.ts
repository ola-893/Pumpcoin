import type { Hex } from 'viem';

async function json(response: Response) {
  if (!response.ok) {
    if (response.status === 403) throw new Error('Oracle feed access was denied (403). Check the API key’s feed entitlements in Pyth Terminal.');
    if (response.status === 401) throw new Error('Oracle API key was rejected (401). Check the server configuration.');
    throw new Error('Oracle service did not return a price update. Retry later.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty oracle response.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 262144) throw new Error('Oracle response is too large.'); chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('Invalid oracle response.'); }
  } finally { await reader.cancel().catch(() => undefined); }
}

export async function pythUpdates(ids: Hex[], key: string | undefined, request = fetch): Promise<Hex[]> {
  if (!key) throw new Error('Set PUMPCOIN_PYTH_API_KEY in the project root .env and restart the local server.');
  const url = new URL('https://pyth.dourolabs.app/hermes/v2/updates/price/latest');
  for (const id of ids) url.searchParams.append('ids[]', id);
  url.searchParams.set('encoding', 'hex');
  let response: Response;
  try { response = await request(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000), redirect: 'error' }); }
  catch { throw new Error('Pyth price update request failed. Retry later.'); }
  const result = await json(response);
  const data = result.binary?.data;
  if (result.binary?.encoding !== 'hex' || !Array.isArray(data) || data.length === 0 || data.length > 8 || data.some((x: unknown) => typeof x !== 'string' || !/^(?:[a-f0-9]{2})+$/i.test(x) || x.length > 131072)) throw new Error('Invalid Pyth update response.');
  return data.map((x: string) => `0x${x}` as Hex);
}

export async function supraMonProof(request = fetch): Promise<Hex> {
  let response: Response;
  try {
    response = await request('https://rpc-testnet-dora-2.supra.com/get_proof', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pair_indexes: [569, 48], chain_type: 'evm' }),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
  } catch { throw new Error('Supra MON proof request failed. Retry later.'); }
  const result = await json(response);
  const data = result.proof_bytes;
  if (typeof data !== 'string' || !/^(?:0x)?(?:[a-f0-9]{2})+$/i.test(data) || data.length > 131074) throw new Error('Invalid Supra proof response.');
  return (data.startsWith('0x') ? data : `0x${data}`) as Hex;
}
