'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useAuthConfig, useAutoRateLimit } from '@/contexts/AutoRateLimitContext';
import { useAuthSession } from '@/hooks/useAuth';
import { getAuthClient } from '@/lib/auth-client';
import { LoadingSpinner } from '@/components/Spinner';

export function AuthLoader({ children }: { children: ReactNode }) {
  const { authEnabled, baseUrl } = useAuthConfig();
  const { refresh: refreshRateLimit } = useAutoRateLimit();
  const { data: session, isPending } = useAuthSession();
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const [isCheckingSignOut, setIsCheckingSignOut] = useState(true);

  useEffect(() => {
    // Determine if we need to check sign-out status or proceed
    const checkStatus = async () => {
      // If auth is disabled, stop checking immediately
      if (!authEnabled) {
        setIsCheckingSignOut(false);
        return;
      }

      // If session is still loading, wait
      if (isPending) return;

      // If we have a session, we are done checking
      if (session) {
        setIsCheckingSignOut(false);
        return;
      }

      // Not signed out, start auto-login
      setIsAutoLoggingIn(true);
      setIsCheckingSignOut(false); // Stop checking sign-out, now in auto-login mode

      try {
        const client = getAuthClient(baseUrl);
        await client.signIn.anonymous();
        await refreshRateLimit();
      } catch (err) {
        console.error('Auto-login failed', err);
      } finally {
        setIsAutoLoggingIn(false);
      }
    };

    checkStatus();
  }, [session, isPending, authEnabled, baseUrl, refreshRateLimit]);

  // Show loader if:
  // 1. Auth client is initializing (isPending) AND auth is enabled
  // 2. We are checking the sign-out status (Dexie)
  // 3. We are actively auto-logging in
  const isLoading = (isPending && authEnabled) || isCheckingSignOut || isAutoLoggingIn;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-base z-50 flex flex-col items-center justify-center gap-4">
        <LoadingSpinner className="w-8 h-8 text-accent" />
        <p className="text-sm text-muted animate-pulse">
          {isAutoLoggingIn ? 'Logging in anonymously...' : 'Loading...'}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
