'use client';

import { useRateLimit, formatCharCount } from '@/components/rate-limit-provider';
import { useAuthConfig } from '@/contexts/AuthConfigContext';
import Link from 'next/link';

interface RateLimitBannerProps {
  className?: string;
}

export function RateLimitBanner({ className = '' }: RateLimitBannerProps) {
  const { status, isAtLimit, timeUntilReset } = useRateLimit();
  const { authEnabled } = useAuthConfig();

  // Don't show banner if auth is not enabled or if not at limit
  if (!authEnabled || !status?.authEnabled || !isAtLimit) {
    return null;
  }

  const isAnonymous = status.userType === 'anonymous';

  return (
    <div className={`bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 ${className}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Daily TTS limit reached
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
            {`You've used ${formatCharCount(status.currentCount)} of ${formatCharCount(status.limit)} characters today.`}
            {' Resets in '}{timeUntilReset}.
          </p>
        </div>

        {isAnonymous && (
          <Link
            href="/signup"
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg
                     bg-accent text-background hover:bg-secondary-accent
                     transform transition-transform duration-200 hover:scale-[1.04]"
          >
            Sign up for 4x more
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Compact version for inline display
 */
export function RateLimitIndicator({ className = '' }: RateLimitBannerProps) {
  const { status, isAtLimit } = useRateLimit();
  const { authEnabled } = useAuthConfig();

  // Don't show if auth is not enabled
  if (!authEnabled || !status?.authEnabled) {
    return null;
  }

  const percentage = status.limit === Infinity
    ? 0
    : Math.min(100, (status.currentCount / status.limit) * 100);

  const isWarning = percentage >= 80;

  if (isAtLimit) {
    return (
      <span className={`text-xs font-medium text-amber-600 dark:text-amber-400 ${className}`}>
        Limit reached
      </span>
    );
  }

  if (isWarning) {
    return (
      <span className={`text-xs text-muted ${className}`}>
        {formatCharCount(status.remainingChars)} chars left
      </span>
    );
  }

  return null;
}
