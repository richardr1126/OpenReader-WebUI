'use client';

import { useMemo } from 'react';
import { useAuthConfig } from '@/contexts/AuthRateLimitContext';
import { getAuthClient } from '@/lib/auth-client';

type SessionHookResult = ReturnType<ReturnType<typeof getAuthClient>['useSession']>;

/**
 * Hook for session that uses the correct baseUrl from context
 */
export function useAuthSession() {
  const { baseUrl, authEnabled } = useAuthConfig();

  const client = useMemo(() => {
    if (!authEnabled || !baseUrl) return null;
    return getAuthClient(baseUrl);
  }, [baseUrl, authEnabled]);

  if (!client) {
    // Keep a stable shape so consumers can always destructure the same fields.
    // This avoids union-type issues when auth is disabled.
    const empty: SessionHookResult = {
      data: null,
      isPending: false,
      isRefetching: false,
      // better-auth types use BetterFetchError | null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: null as any,
      refetch: async () => {},
    };
    return empty;
  }

  return client.useSession();
}
