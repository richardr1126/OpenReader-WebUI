'use client';

import { useEffect, useRef } from 'react';
import { useAuthConfig } from '@/contexts/AuthConfigContext';
import { useAuthSession } from '@/hooks/useAuth';
import { getAuthClient } from '@/lib/auth-client';
import { wasSignedOut } from '@/lib/session-utils';

export function SessionManager() {
  const { authEnabled, baseUrl } = useAuthConfig();
  const { data: session, isPending } = useAuthSession();
  const attemptRef = useRef(false);

  useEffect(() => {
    // Only run if auth is enabled
    if (!authEnabled) return;

    // Wait for session check to complete
    if (isPending) return;

    // If we have a session, we're good
    if (session) return;

    // Prevent multiple attempts
    if (attemptRef.current) return;

    const checkAndSignIn = async () => {
      attemptRef.current = true;
      try {
        // Check if user explicitly signed out
        const signedOut = await wasSignedOut();

        // If not explicitly signed out, sign in anonymously
        if (!signedOut) {
          console.log('No session found, signing in anonymously...');
          const client = getAuthClient(baseUrl);
          await client.signIn.anonymous();
        }
      } catch (error) {
        console.error('Error in session manager:', error);
      }
    };

    checkAndSignIn();
  }, [session, isPending, authEnabled, baseUrl]);

  return null;
}
