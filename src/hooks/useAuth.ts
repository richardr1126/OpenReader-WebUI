'use client';

import { useMemo } from 'react';
import { useAuthConfig } from '@/contexts/AutoRateLimitContext';
import { getAuthClient } from '@/lib/auth-client';

/**
 * Hook that provides auth client methods configured with the correct baseUrl from server.
 * Use this hook in components that need to call auth methods (signIn, signUp, etc.)
 */
export function useAuth() {
  const { baseUrl, authEnabled } = useAuthConfig();

  const client = useMemo(() => {
    if (!authEnabled || !baseUrl) return null;
    return getAuthClient(baseUrl);
  }, [baseUrl, authEnabled]);

  if (!client) {
    // Safe no-op implementation when auth is disabled
    return {
      authEnabled: false,
      baseUrl: null,
      signIn: async () => ({ data: null, error: null }),
      signUp: async () => ({ data: null, error: null }),
      signOut: async () => ({ data: null, error: null }),
      useSession: () => ({ data: null, isPending: false, error: null }),
      getSession: async () => ({ data: null, error: null }),
    };
  }

  return {
    authEnabled,
    baseUrl,
    signIn: client.signIn,
    signUp: client.signUp,
    signOut: client.signOut,
    useSession: client.useSession,
    getSession: client.getSession,
  };
}

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
