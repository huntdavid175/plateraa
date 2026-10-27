import { MutationCache, QueryClient, useQuery } from '@tanstack/react-query';
import { api, ApiError, call, type Capability, type Me } from './api';
import { useToken } from './session';
import { toast } from '@/ui/Toast';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { ok?: string; quiet?: boolean };
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) =>
        failures < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
  // Every change that fails says why; one that works says so when it carries meta.ok.
  mutationCache: new MutationCache({
    // `meta: { quiet: true }` for a form that already says why under itself.
    onError: (error, _vars, _ctx, mutation) => {
      if (!mutation.meta?.quiet) toast.problem(error.message);
    },
    onSuccess: (_data, _vars, _ctx, mutation) => {
      if (mutation.meta?.ok) toast.ok(mutation.meta.ok);
    },
  }),
});

export function useMe() {
  const token = useToken();
  return useQuery({
    queryKey: ['me', token],
    queryFn: () => call<Me>(api.GET('/api/platform/me')),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });
}

/** Whether the signed-in team member may do something. The server checks again. */
export function useCan() {
  const me = useMe().data;
  return (capability: Capability) => Boolean(me?.capabilities.includes(capability));
}

/** After any change, everything that might show it is fetched again. */
export const refreshAll = () => queryClient.invalidateQueries();
