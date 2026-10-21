import { useQuery } from '@tanstack/react-query';
import type { NativeState } from '../../../agent-registration/native-investment-types';
import { registrationRequest, registrationSession, type RegistrationRecord } from './agent-registration';
export function useNativeState(record: RegistrationRecord, account?: string, walletChain?: number) {
  const query = useQuery({ queryKey: ['native-display-v1', record.id, record.commitment, record.binding?.chainId, record.binding?.vault.toLowerCase(), account?.toLowerCase(), walletChain],
    enabled: !!record.binding && !!account && walletChain === record.binding.chainId,
    queryFn: async () => {
      if (!account || walletChain !== record.binding?.chainId) throw new Error('Connect a wallet on this vault’s chain before refreshing balances.');
      const session = await registrationSession();
      const { state: s } = await registrationRequest(session.token, '/native-state', { id: record.id, account });
      const state = s as NativeState;
      if (state.vault.toLowerCase() !== record.binding?.vault.toLowerCase() || state.chainId !== record.binding?.chainId || state.account?.toLowerCase() !== account?.toLowerCase()
        || !Number.isInteger(state.shareDecimals) || !Number.isInteger(state.quoteDecimals) || !/^0x[0-9a-f]{64}$/i.test(state.blockHash)) throw new Error('Investment snapshot does not match this vault, chain or wallet.');
      return state;
    },
    refetchInterval: 120000, refetchIntervalInBackground: false,
  });
  return { data: query.data, busy: query.isFetching, error: query.error?.message || '', async refresh() {
    const result = await query.refetch({ cancelRefetch: false }); if (result.error) throw result.error; return result.data;
  } };
}
