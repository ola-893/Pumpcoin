import { useState } from 'react';
import { Droplets, Check, Loader2 } from 'lucide-react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useTheme } from '@/contexts/ThemeContext';
import { DEMO_TOKEN_ABI, FAUCET_AMOUNT, PROTOCOL_ADDRESSES, toUnits } from '@/lib/onchain';

const TOKENS = [
  { label: 'pCOL', address: PROTOCOL_ADDRESSES.collateralToken },
  { label: 'pUSD', address: PROTOCOL_ADDRESSES.loanToken },
] as const;

/**
 * Mints the demo tokens the deployed contracts accept.
 *
 * Without this, a fresh wallet hits the honest empty state and then has no path forward —
 * the contracts only accept pCOL/pUSD, and nowhere mints them. DemoToken.mint() is the
 * deployed faucet; two writes (one per token), each confirmed before the balance refetches.
 */
export default function FaucetButton({ onDone }: { onDone?: () => void }) {
  const colors = useTheme();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [pending, setPending] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>(undefined);

  useWaitForTransactionReceipt({
    hash: lastHash,
    query: { enabled: !!lastHash },
  });

  async function mint(symbol: string, tokenAddress: `0x${string}`) {
    if (!address) return;
    setPending(symbol);
    setError(undefined);
    try {
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: DEMO_TOKEN_ABI,
        functionName: 'mint',
        args: [address, toUnits(FAUCET_AMOUNT)],
      });
      setLastHash(hash);
      setDone((prev) => [...prev, symbol]);
      if (done.length + 1 === TOKENS.length) onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 100) : 'Mint failed');
    } finally {
      setPending(null);
    }
  }

  const allDone = done.length >= TOKENS.length;

  return (
    <div
      className="rounded-2xl border shadow-sm p-4 flex items-center justify-between gap-4 flex-wrap mb-4"
      style={{ borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.6)' }}
    >
      <div className="min-w-0">
        <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: colors.textMuted }}>
          Demo tokens
        </div>
        <div className="font-mono text-[10px] leading-relaxed" style={{ color: colors.textMuted }}>
          {allDone
            ? `Minted ${FAUCET_AMOUNT.toLocaleString()} pCOL + ${FAUCET_AMOUNT.toLocaleString()} pUSD to your wallet`
            : 'The deployed contracts accept freely-mintable test tokens (pCOL, pUSD)'}
        </div>
        {error && (
          <div className="font-mono text-[9px] mt-1" style={{ color: '#BA7517' }}>
            {error}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {TOKENS.map((token) => {
          const isDone = done.includes(token.label);
          const isPending = pending === token.label;
          return (
            <button
              key={token.label}
              onClick={() => mint(token.label, token.address)}
              disabled={isPending || isDone}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-[10px] font-medium transition-all"
              style={{
                backgroundColor: isDone ? 'rgba(99,153,34,0.12)' : 'rgba(124,58,237,0.08)',
                color: isDone ? '#639922' : '#7C3AED',
                cursor: isPending || isDone ? 'default' : 'pointer',
              }}
            >
              {isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
              ) : isDone ? (
                <Check className="w-3 h-3" strokeWidth={2.5} />
              ) : (
                <Droplets className="w-3 h-3" strokeWidth={1.5} />
              )}
              {isDone ? `${token.label} minted` : `Mint ${token.label}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
