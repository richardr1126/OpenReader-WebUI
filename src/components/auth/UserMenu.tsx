'use client';

import { Button } from '@headlessui/react';
import Link from 'next/link';
import { useAuthConfig, useAutoRateLimit } from '@/contexts/AutoRateLimitContext';
import { useAuthSession } from '@/hooks/useAuth';
import { getAuthClient } from '@/lib/auth-client';
import { clearSignedOut } from '@/lib/session-utils';
import { useRouter } from 'next/navigation';

export function UserMenu({ className = '' }: { className?: string }) {
  const { authEnabled, baseUrl } = useAuthConfig();
  const { refresh: refreshRateLimit } = useAutoRateLimit();
  const { data: session, isPending } = useAuthSession();
  const router = useRouter();

  if (!authEnabled || isPending) return null;

  const handleSignOut = async () => {
    const client = getAuthClient(baseUrl);
    await client.signOut();
    await clearSignedOut();
    await client.signIn.anonymous();
    await refreshRateLimit();
    router.refresh();
  };

  if (!session || session.user.isAnonymous) {
    return (
      <div className={`flex gap-2 ${className}`}>
        <Link href="/signin">
          <Button className="inline-flex items-center rounded-md bg-base border border-offbase px-2 py-1 text-xs font-medium text-foreground hover:bg-offbase focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transform transition-all duration-200 ease-in-out hover:scale-[1.09] hover:text-accent">
            {session?.user.isAnonymous ? 'Log In' : 'Sign In'}
          </Button>
        </Link>
        <Link href="/signup">
          <Button className="inline-flex items-center rounded-md bg-accent px-2 py-1 text-xs font-medium text-background hover:bg-secondary-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 transform transition-all duration-200 ease-in-out hover:scale-[1.09]">
            Sign Up
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="hidden sm:flex flex-col items-end mr-1">
        <span className="text-xs font-medium text-foreground leading-none mb-0.5">
          {session.user.name || session.user.email || 'Account'}
        </span>
        <span className="text-[10px] text-muted truncate max-w-[120px] leading-none">
          {session.user.email}
        </span>
      </div>

      <Button
        onClick={handleSignOut}
        className="inline-flex items-center py-1 px-2 rounded-md border border-offbase bg-base text-foreground text-xs hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.09] hover:text-red-500"
        title="Sign Out"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </Button>
    </div>
  );
}
