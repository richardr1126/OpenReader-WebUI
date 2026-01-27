'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Button,
} from '@headlessui/react';
import { useAuthSession } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function ClaimDataModal() {
  const { data: sessionData } = useAuthSession();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const user = sessionData?.user;

  const checkClaimableData = useCallback(async () => {
    setHasChecked(true);

    try {
      const res = await fetch('/api/user/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.documents > 0 || data.audiobooks > 0) {
          setIsOpen(true);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    // Only check once per session if user is logged in (non-anonymous)
    if (user && !user.isAnonymous && !hasChecked) {
      checkClaimableData();
    }
  }, [user, hasChecked, checkClaimableData]);

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const res = await fetch('/api/user/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Successfully claimed ${data.claimed.documents} documents and ${data.claimed.audiobooks} audiobooks!`);

        setIsOpen(false);
        router.refresh();
      }
    } catch {
      alert('Failed to claim data.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleDismiss = () => {
    // Close the modal for this session - will reappear on next page load/refresh
    setIsOpen(false);
    // Keep hasChecked = true so useEffect doesn't re-trigger in this session
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleDismiss}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 overlay-dim backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 pt-6 text-center sm:items-center sm:pt-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md transform rounded-2xl bg-base p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle
                  as="h3"
                  className="text-lg font-semibold leading-6 text-foreground mb-4"
                >
                  Existing Data Found
                </DialogTitle>

                <p className="text-sm text-muted mb-2">
                  We found documents and audiobooks that were created before auth was enabled.
                  Would you like to claim them and add them to your account?
                </p>

                <p className="text-xs text-muted/70 mb-6 italic">
                  ⚠️ First user to claim these files will own them and revoke access for anyone else.
                </p>

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    onClick={handleDismiss}
                    disabled={isClaiming}
                    className="inline-flex justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                             font-medium text-foreground hover:bg-offbase focus:outline-none 
                             focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                             transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent
                             disabled:opacity-50"
                  >
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    onClick={handleClaim}
                    disabled={isClaiming}
                    className="inline-flex justify-center rounded-lg bg-accent px-3 py-1.5 text-sm 
                             font-medium text-background hover:bg-secondary-accent focus:outline-none 
                             focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                             transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-background
                             disabled:opacity-50"
                  >
                    {isClaiming ? 'Claiming...' : 'Claim All'}
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
