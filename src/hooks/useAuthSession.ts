'use client';

import { useMemo } from 'react';
import { useAuthConfig } from '@/contexts/AuthRateLimitContext';
import { getAuthClient } from '@/lib/auth-client';

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
    return { data: null, isPending: false, error: null };
  }

  return client.useSession();
}
