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
import { updateAppConfig, getAppConfig } from '@/lib/dexie';

interface PrivacyPopupProps {
  onAccept?: () => void;
}

export function PrivacyPopup({ onAccept }: PrivacyPopupProps) {
  const [isOpen, setIsOpen] = useState(false);

  const checkPrivacyAccepted = useCallback(async () => {
    const config = await getAppConfig();
    if (!config?.privacyAccepted) {
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    checkPrivacyAccepted();
  }, [checkPrivacyAccepted]);

  const handleAccept = async () => {
    await updateAppConfig({ privacyAccepted: true });
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('openreader:privacyAccepted'));
    }
    onAccept?.();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[60]" onClose={() => { }}>
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
          <div className="flex min-h-full items-center justify-center p-4 text-center">
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
                  className="text-lg font-semibold leading-6 text-foreground"
                >
                  Privacy & Data Usage
                </DialogTitle>

                <div className="mt-4 space-y-3 text-sm text-foreground/90">
                  <p>Documents are uploaded to your local browser cache.</p>
                  <p>
                    Each paragraph of the document you are viewing is sent to Deepinfra
                    for audio generation through a Vercel backend proxy, containing a
                    shared caching pool.
                  </p>
                  <p>The audio is streamed back to your browser and played in real-time.</p>
                  <p className="font-semibold italic">
                    Self-hosting is the recommended way to use this app for a truly secure experience.
                  </p>
                  <p className="text-xs text-muted">
                    This site uses Vercel Analytics to collect anonymous usage data to help improve the service.
                  </p>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button
                    type="button"
                    className="inline-flex justify-center rounded-lg bg-accent px-4 py-2 text-sm 
                             font-medium text-background hover:bg-secondary-accent focus:outline-none 
                             focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                             transform transition-transform duration-200 ease-in-out hover:scale-[1.04]"
                    onClick={handleAccept}
                  >
                    I Understand
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

/**
 * Function to programmatically show the privacy popup
 * This can be called from signin/signup components
 */
export function showPrivacyPopup(): void {
  // Create a temporary container for the popup
  const container = document.createElement('div');
  container.id = 'privacy-popup-container';
  document.body.appendChild(container);

  // Import React and render the popup
  import('react-dom/client').then(({ createRoot }) => {
    import('react').then((React) => {
      const root = createRoot(container);

      const PopupWrapper = () => {
        const [show, setShow] = useState(true);

        const handleClose = () => {
          setShow(false);
          setTimeout(() => {
            root.unmount();
            container.remove();
          }, 300);
        };

        if (!show) return null;

        return (
          <Transition appear show={show} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
                <div className="flex min-h-full items-center justify-center p-4 text-center">
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
                        className="text-lg font-semibold leading-6 text-foreground"
                      >
                        Privacy & Data Usage
                      </DialogTitle>

                      <div className="mt-4 space-y-3 text-sm text-foreground/90">
                        <p>Documents are uploaded to your local browser cache.</p>
                        <p>
                          Each paragraph of the document you are viewing is sent to Deepinfra
                          for audio generation through a Vercel backend proxy, containing a
                          shared caching pool.
                        </p>
                        <p>The audio is streamed back to your browser and played in real-time.</p>
                        <p className="font-semibold italic">
                          Self-hosting is the recommended way to use this app for a truly secure experience.
                        </p>
                        <p className="text-xs text-muted">
                          This site uses Vercel Analytics to collect anonymous usage data.
                        </p>
                      </div>

                      <div className="mt-6 flex justify-end">
                        <Button
                          type="button"
                          className="inline-flex justify-center rounded-lg bg-accent px-4 py-2 text-sm 
                                   font-medium text-background hover:bg-secondary-accent focus:outline-none 
                                   focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                                   transform transition-transform duration-200 ease-in-out hover:scale-[1.04]"
                          onClick={handleClose}
                        >
                          Close
                        </Button>
                      </div>
                    </DialogPanel>
                  </TransitionChild>
                </div>
              </div>
            </Dialog>
          </Transition>
        );
      };

      root.render(React.createElement(PopupWrapper));
    });
  });
}
