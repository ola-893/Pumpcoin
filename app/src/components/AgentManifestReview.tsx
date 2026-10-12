import type { Prepared } from '../lib/agent-registration';
import { CopyValue } from './UI';

export function AgentManifestReview({ manifest }: { manifest: Prepared['manifest'] }) {
  return <section aria-label="Public declaration review" style={{ marginTop: 20 }}>
    <h3>Strategy being authorized</h3><p style={{ whiteSpace: 'pre-wrap' }}>{manifest.strategy.description}</p>
    <p className="small">Maximum slippage: {manifest.proposedMandate.slippageBps} basis points. Trading still requires a deployed compatible vault, healthy valuation, {manifest.vaultPolicy?'an immediately applied demo configuration':'a matured configuration'} and a separate expiring controller permission.</p>
    <details><summary>Review code commitment and declared dependencies</summary>
      <CopyValue value={manifest.strategy.codeDigest} label="declared strategy code digest" />
      <ul>{manifest.dependencies.map((dependency, i) => <li key={i}>{dependency}</li>)}</ul>
      <p className="small muted">The source commitment and local admission check do not attest execution on the operator-controlled host.</p>
    </details>
  </section>;
}
