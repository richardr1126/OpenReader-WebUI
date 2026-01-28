'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { useAuthConfig, useAuthRateLimit } from '@/contexts/AuthRateLimitContext';
import { useAuthSession } from '@/hooks/useAuthSession';
import { getAuthClient } from '@/lib/auth-client';
import { LoadingSpinner } from '@/components/Spinner';

export function AuthLoader({ children }: { children: ReactNode }) {
  const { authEnabled, baseUrl } = useAuthConfig();
  const { refresh: refreshRateLimit } = useAuthRateLimit();
  const { data: session, isPending } = useAuthSession();
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const attemptedForNullSessionRef = useRef(false);

  // If the auth base URL changes, re-run the bootstrap logic.
  useEffect(() => {
    attemptedForNullSessionRef.current = false;
    setBootstrapError(null);
  }, [authEnabled, baseUrl]);

  useEffect(() => {
    // This app does not have a real "signed out" state when auth is enabled.
    // If we ever observe "no session", we immediately start an anonymous session.
    const checkStatus = async () => {
      if (!authEnabled) return;
      if (isPending) return;

      if (session) {
        attemptedForNullSessionRef.current = false;
        setBootstrapError(null);
        return;
      }

      // Avoid double-calling anonymous sign-in (e.g. React strict mode).
      if (attemptedForNullSessionRef.current) return;
      attemptedForNullSessionRef.current = true;

      setIsAutoLoggingIn(true);
      setBootstrapError(null);

      try {
        const client = getAuthClient(baseUrl);
        await client.signIn.anonymous();
        await refreshRateLimit();
      } catch (err) {
        console.error('Auto-login failed', err);
        setBootstrapError('Unable to start an anonymous session.');
      } finally {
        setIsAutoLoggingIn(false);
      }
    };

    checkStatus();
  }, [session, isPending, authEnabled, baseUrl, refreshRateLimit, retryNonce]);

  // Show loader if:
  // 1. Auth client is initializing (isPending) AND auth is enabled
  // 2. We are actively creating an anonymous session
  const isLoading = authEnabled && (isPending || isAutoLoggingIn || !session);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-base z-50 flex flex-col items-center justify-center gap-4">
        <LoadingSpinner className="w-8 h-8 text-accent" />
        {bootstrapError ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted text-center">{bootstrapError}</p>
            <button
              type="button"
              onClick={() => {
                attemptedForNullSessionRef.current = false;
                setBootstrapError(null);
                setRetryNonce((v) => v + 1);
              }}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-secondary-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted animate-pulse">
            {isAutoLoggingIn ? 'Starting anonymous session...' : 'Loading...'}
          </p>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
