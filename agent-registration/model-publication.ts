import type { Prepared } from './core.js';

export function publishedWeightsSource(source: string) {
  const url = new URL(source);
  const match = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/resolve\/([a-f0-9]{40})\/([^/]+)$/);
  if (url.origin !== 'https://huggingface.co' || url.username || url.password || url.search || url.hash || !match) throw new Error('Publication verification requires a fixed Hugging Face commit and filename.');
  const filename = decodeURIComponent(match[4]);
  if (filename === '.' || filename === '..' || /[\\/\x00-\x1f]/.test(filename) || filename.length > 255) throw new Error('Invalid published weights filename.');
  return { repository: `${match[1]}/${match[2]}`, revision: match[3], filename };
}
export async function verifyWeightsPublication(p: Prepared, measuredBytes: number, fetcher = fetch) {
  if (!Number.isSafeInteger(measuredBytes) || measuredBytes <= 0) throw new Error('A current measured weights size is required.');
  const source = publishedWeightsSource(p.manifest.model.source);
  const api = `https://huggingface.co/api/models/${source.repository}/revision/${source.revision}?blobs=true`;
  const response = await fetcher(api, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!response.ok || !response.body) throw new Error('Public weights metadata is unavailable.');
  let size = 0; const chunks: Uint8Array[] = [], reader = response.body.getReader();
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 1048576) throw new Error('Public weights metadata is too large.'); chunks.push(value); } } finally { await reader.cancel(); }
  const metadata = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (metadata.sha !== source.revision || !Array.isArray(metadata.siblings) || metadata.siblings.length > 10000) throw new Error('Publisher metadata does not identify the pinned commit.');
  const files = metadata.siblings.filter((x: any) => x.rfilename === source.filename);
  const file = files[0];
  if (files.length !== 1 || file.lfs?.sha256 !== p.manifest.model.weightsDigest.slice(7) || file.lfs?.size !== measuredBytes || file.size !== measuredBytes) throw new Error('Published weights digest or size differs from the measured declaration.');
  return { version: 'PUMPCOIN-WEIGHTS-PUBLICATION-v1', modelLabel: p.manifest.model.id, ...source, weightsDigest: p.manifest.model.weightsDigest,
    weightsBytes: measuredBytes, metadataURL: api, checkedAt: new Date().toISOString(), evidence: 'publisher-metadata-digest-matched',
    scope: 'Measured file digest and size match public Hugging Face LFS metadata at this pinned publisher commit. Trusts Hugging Face HTTPS metadata and the local measurement. Does not prove upstream model lineage, training provenance, semantic model identity or inference execution.' };
}
