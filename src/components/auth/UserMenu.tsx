'use client';

import { Button } from '@headlessui/react';
import Link from 'next/link';
import { useAuthConfig } from '@/contexts/AuthConfigContext';
import { useAuthSession } from '@/hooks/useAuth';
import { getAuthClient } from '@/lib/auth-client';
import { markSignedOut } from '@/lib/session-utils';
import { useRouter } from 'next/navigation';

export function UserMenu() {
  const { authEnabled, baseUrl } = useAuthConfig();
  const { data: session, isPending } = useAuthSession();
  const router = useRouter();

  if (!authEnabled || isPending) return null;

  const handleSignOut = async () => {
    await markSignedOut();
    const client = getAuthClient(baseUrl);
    await client.signOut();
    router.refresh();
  };

  if (!session || session.user.isAnonymous) {
    return (
      <div className="absolute top-2 right-14 sm:top-4 sm:right-16 flex gap-2">
        <Link href="/signin">
          <Button className="rounded-lg bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/20">
            {session?.user.isAnonymous ? 'Log In ' : 'Sign In'}
          </Button>
        </Link>
        <Link href="/signup" className="hidden sm:block">
          <Button className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background hover:bg-secondary-accent">
            Sign Up
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="absolute top-2 right-14 sm:top-4 sm:right-16 flex items-center gap-3">
      <div className="hidden sm:flex flex-col items-end">
        <span className="text-xs font-medium text-foreground">
          {session.user.name || 'Guest'}
        </span>
        <span className="text-[10px] text-muted truncate max-w-[120px]">
          {session.user.email}
        </span>
      </div>

      <Button
        onClick={handleSignOut}
        className="p-2 text-foreground/70 hover:text-red-500 transition-colors"
        title="Sign Out"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </Button>
    </div>
  );
}
