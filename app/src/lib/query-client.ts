import { QueryClient } from '@tanstack/react-query';

// One cache above the router; queries survive directory/profile navigation and
// share requests across StrictMode mounts and multiple observers.
export const queryClient = new QueryClient({ defaultOptions: { queries: {
  retry: false, staleTime: 60000, gcTime: 30 * 60000,
  refetchOnWindowFocus: false, refetchOnReconnect: true,
} } });

export { QueryClient };
