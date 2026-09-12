import { QueryClient, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, ApiError, call, signOut } from './api';
import { useSession } from './session';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry dropped connections and server errors (Render's free plan wakes slowly), never refusals.
      retry: (count, error) =>
        count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

/** Signs out and forgets everything this login loaded. */
export function signOutAndForget() {
  signOut();
  queryClient.clear();
}

/** The businesses this login can manage. */
export function useBusinesses() {
  const { token } = useSession();
  return useQuery({
    queryKey: ['businesses', token],
    queryFn: () => call(api.GET('/api/me/businesses')),
    enabled: token !== null,
  });
}

const fetchContext = () => call(api.GET('/api/me/context'));

/** Who is signed in, in the chosen business, with their permissions. */
export type Me = Awaited<ReturnType<typeof fetchContext>>;

export function useContextQuery() {
  const { token, tenantId } = useSession();
  return useQuery({
    queryKey: ['me', tenantId],
    queryFn: fetchContext,
    enabled: token !== null && tenantId !== null,
  });
}

/** True once `active` has lasted a few seconds: time to say the server is waking up. */
export function useSlow(active: boolean, afterMs = 4000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), afterMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, afterMs]);
  return active && slow;
}
