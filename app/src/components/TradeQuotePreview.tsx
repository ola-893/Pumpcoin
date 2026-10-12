import { formatUnits } from 'viem';
import type { TradingQuote } from '../../../agent-registration/types';

export function TradeQuotePreview({ quote, buy, now }: { quote: TradingQuote; buy: boolean; now: number }) {
  const expired = now >= quote.expiresAt;
  const output = (value: string) => `${formatUnits(BigInt(value), buy ? 18 : 6)} ${buy ? 'WMON' : 'test-USDC'}`;
  return <section aria-label="Executable DEX quote">
    <h3>Simulated DEX quote</h3>
    <div className="definition-grid">
      <div><small>Expected output · includes DEX fees and price impact</small><strong>{output(quote.expectedOutput)}</strong></div>
      <div><small>Minimum received · enforced onchain</small><strong>{output(quote.minimumOutput)}</strong></div>
    </div>
    <p className="small muted">Quoted input: {formatUnits(BigInt(quote.amountIn), buy ? 6 : 18)} {buy ? 'test-USDC' : 'WMON'} · maximum slippage {quote.slippageBps / 100}%.</p>
    <p className="small muted">Full vault trade simulated at block {quote.blockNumber} · {new Date(quote.checkedAt).toLocaleTimeString()}. This is a snapshot; the mined output can change within the enforced minimum.</p>
    <p className={expired ? 'form-error' : 'small'} role="status">{expired ? 'Quote expired. Review & simulate again.' : `Quote expires in ${Math.ceil((quote.expiresAt - now) / 1000)} seconds.`}</p>
  </section>;
}
