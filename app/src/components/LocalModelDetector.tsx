import { useEffect, useRef, useState } from 'react';
import { Cpu, RefreshCw, Download } from 'lucide-react';
import { Badge } from './UI';
import { detectModel, type Detection, type LocalStatus } from '../lib/local-inference';
import { downloadJson } from '../lib/registration';
export function LocalModelDetector({ endpoint, onDetected, current }: { endpoint: string; onDetected: (x: Detection) => void; current: boolean }) {
  const [status, setStatus] = useState<LocalStatus>({ status: 'running' }), [attempt, setAttempt] = useState(0);
  const apply = useRef(onDetected); useEffect(() => { apply.current = onDetected; }, [onDetected]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { void detectModel(endpoint, s => { if (!controller.signal.aborted) setStatus(s); }, controller.signal).then(x => { if (!controller.signal.aborted) apply.current(x); }).catch(e => { if (!controller.signal.aborted) setStatus({ status: 'error', error: e instanceof Error ? e.message : 'Unable to detect the local model.' }); }); }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [endpoint, attempt]);
  const p = status.progress; const percentage = p?.totalBytes ? Math.min(100, Math.floor(p.completedBytes / p.totalBytes * 100)) : 0;
  const result = status.result;
  return <section className="local-detection" aria-label="Local model detection"><div className="local-detection-heading"><Cpu size={22} /><div><h3>Your running local model</h3><p>Model files stay on your computer.</p></div><Badge tone={status.status === 'ready' && current ? 'purple' : 'amber'}>{status.status === 'ready' && current ? 'Locally detected' : status.status === 'running' ? 'Checking locally' : 'Check required'}</Badge></div>
    {status.status === 'running' && <div role="status"><p>{p?.phase === 'weights' ? `Hashing the weights file · ${percentage}%` : p?.phase === 'runtime' ? 'Hashing the runtime and its mapped libraries…' : p?.phase === 'checking' ? 'Rechecking the running process and file consistency…' : 'Finding your local llama-server…'}</p>{p?.phase === 'weights' && <progress max={100} value={percentage} aria-label="Weights hashing progress" />}<small>The first checksum can take a minute. Matching files are cached for this helper session.</small></div>}
    {status.status === 'error' && <p className="form-error" role="alert">{status.error}</p>}
    {status.status === 'ready' && result && <><div className="local-model-summary"><strong>{result.model}</strong><span>{result.quantization} · {result.context.toLocaleString()} context</span><span>{result.weightsFilename} · {(result.weightsBytes / 1e9).toFixed(2)} GB</span></div><p className="small">{result.source ? 'Exact weights source recovered from a local download record matching the measured checksum.' : 'No matching download record was found. Enter the weights source below; it will remain operator-declared.'}</p>{!current && <p className="form-error" role="status">Artifact fields were changed. Detect again to restore the local measurements.</p>}<details><summary>Inspect locally measured artifacts</summary><p className="small">The runtime commitment covers the executable and mapped non-system native libraries. It excludes the OS, GPU driver and strategy.</p><div className="local-hash"><small>Weights SHA-256</small><code>{result.weightsHash}</code><small>Runtime manifest SHA-256</small><code>{result.runtimeHash}</code></div><button type="button" className="text-button" onClick={() => downloadJson('pumpcoin-local-model-measurements.json', result)}><Download size={14} /> Export local measurements</button></details><small>Checked {new Date(result.checkedAt).toLocaleTimeString()}. Hardware-backed attestation — coming soon.</small></>}
    <button type="button" className="button secondary" disabled={status.status === 'running'} onClick={() => { setStatus({ status: 'running' }); setAttempt(x => x + 1); }}><RefreshCw size={15} />{status.status === 'error' ? 'Retry local detection' : 'Detect again'}</button>
  </section>;
}
