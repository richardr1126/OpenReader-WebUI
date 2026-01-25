'use client';

import { useMemo } from 'react';
import { useAuthConfig } from '@/contexts/AuthConfigContext';
import { getAuthClient } from '@/lib/auth-client';

/**
 * Hook that provides auth client methods configured with the correct baseUrl from server.
 * Use this hook in components that need to call auth methods (signIn, signUp, etc.)
 */
export function useAuth() {
  const { baseUrl, authEnabled } = useAuthConfig();

  const client = useMemo(() => {
    return getAuthClient(baseUrl);
  }, [baseUrl]);

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
  const { baseUrl } = useAuthConfig();
  const client = useMemo(() => getAuthClient(baseUrl), [baseUrl]);
  return client.useSession();
}
