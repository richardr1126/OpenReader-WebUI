'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuthConfig } from '@/contexts/AuthConfigContext';

export interface RateLimitStatus {
  allowed: boolean;
  currentCount: number;
  limit: number;
  remainingChars: number;
  resetTime: Date;
  userType: 'anonymous' | 'authenticated' | 'unauthenticated';
  authEnabled: boolean;
}

export interface RateLimitContextType {
  status: RateLimitStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isAtLimit: boolean;
  timeUntilReset: string;
  incrementCount: (charCount: number) => void;
  onTTSStart: () => void;
  onTTSComplete: () => void;
}

const RateLimitContext = createContext<RateLimitContextType | null>(null);

export function useRateLimit(): RateLimitContextType {
  const context = useContext(RateLimitContext);
  if (!context) {
    throw new Error('useRateLimit must be used within a RateLimitProvider');
  }
  return context;
}

interface RateLimitProviderProps {
  children: React.ReactNode;
}

function calculateTimeUntilReset(resetTime: Date): string {
  const now = new Date();
  const timeDiff = resetTime.getTime() - now.getTime();

  if (timeDiff <= 0) {
    return 'Soon';
  }

  const hours = Math.floor(timeDiff / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

function formatCharCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  } else if (count >= 1_000) {
    return `${(count / 1_000).toFixed(0)}K`;
  }
  return count.toString();
}

export { formatCharCount };

export function RateLimitProvider({ children }: RateLimitProviderProps) {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { authEnabled } = useAuthConfig();

  // Track pending TTS operations to delay count updates
  const pendingTTSRef = useRef<number>(0);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    // Skip if auth is not enabled
    if (!authEnabled) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      setStatus({
        allowed: true,
        currentCount: 0,
        limit: Infinity,
        remainingChars: Infinity,
        resetTime: tomorrow,
        userType: 'unauthenticated',
        authEnabled: false
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/rate-limit/status');

      if (!response.ok) {
        throw new Error(`Failed to fetch rate limit status: ${response.status}`);
      }

      const data = await response.json();

      setStatus({
        ...data,
        resetTime: new Date(data.resetTime)
      });
    } catch (err) {
      console.error('Error fetching rate limit status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [authEnabled]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Calculate time until reset
  const timeUntilReset = status ? calculateTimeUntilReset(status.resetTime) : '';
  const isAtLimit = status ? status.remainingChars <= 0 : false;

  // Increment count locally (for immediate UI feedback)
  const incrementCount = useCallback((charCount: number) => {
    setStatus(prevStatus => {
      if (!prevStatus) return prevStatus;

      const newCurrentCount = prevStatus.currentCount + charCount;
      const newRemainingChars = Math.max(0, prevStatus.limit - newCurrentCount);

      return {
        ...prevStatus,
        currentCount: newCurrentCount,
        remainingChars: newRemainingChars,
        allowed: newRemainingChars > 0
      };
    });
  }, []);

  // Called when a TTS request starts
  const onTTSStart = useCallback(() => {
    pendingTTSRef.current += 1;

    // Clear any existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
  }, []);

  // Called when a TTS request completes (success or error)
  const onTTSComplete = useCallback(() => {
    pendingTTSRef.current = Math.max(0, pendingTTSRef.current - 1);

    // Clear any existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }

    // If no more pending requests, schedule an update
    if (pendingTTSRef.current === 0) {
      updateTimeoutRef.current = setTimeout(() => {
        fetchStatus();
        updateTimeoutRef.current = null;
      }, 1000); // Wait 1 second after completion to refresh
    }
  }, [fetchStatus]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  const contextValue: RateLimitContextType = {
    status,
    loading,
    error,
    refresh: fetchStatus,
    isAtLimit,
    timeUntilReset,
    incrementCount,
    onTTSStart,
    onTTSComplete
  };

  return (
    <RateLimitContext.Provider value={contextValue}>
      {children}
    </RateLimitContext.Provider>
  );
}