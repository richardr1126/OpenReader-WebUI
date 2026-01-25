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

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;

interface PrivacyPopupProps {
  onAccept?: () => void;
  authEnabled?: boolean;
}

function PrivacyPopupBody({
  origin,
  authEnabled,
}: {
  origin: string;
  authEnabled: boolean;
}) {
  if (!isDev) {
    return (
      <div className="mt-4 space-y-4 text-sm text-foreground/90">
        <div className="rounded-lg border border-offbase bg-offbase/40 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Service operator visibility</div>
          <div className="mt-2">
            This OpenReader instance is hosted at <span className="font-bold">{origin || 'this server'}</span>. The operator
            of this service can access data that reaches the service.
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Stored in your browser (IndexedDB)</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Uploaded documents (local library)</li>
            <li>Reading progress (last location)</li>
            <li>App settings (voice/speed/provider/base URL)</li>
            <li>Privacy notice acceptance</li>
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Sent to this service</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Text for audio generation and associated metadata</li>
            <li>Standard request metadata (e.g. IP address, user agent)</li>
            <li>Text is forwarded to a TTS provider (Deepinfra) to generate audio</li>
            <li>Some generated audio may be cached server-side to reduce cost/latency</li>
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Stored on this service</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {authEnabled ? (
              <li>Auth users data and IP rate limiting data are stored in the service database</li>
            ) : (
              <li>Authentication is disabled, so no user/session database is used</li>
            )}
          </ul>
        </div>

        <div className="text-xs text-muted">
          This site uses Vercel Analytics to collect anonymous usage data. For maximum privacy, use self-hosted mode.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4 text-sm text-foreground/90">
      <div className="rounded-lg border border-offbase bg-offbase/40 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Server owner visibility</div>
        <div className="mt-2">
          This OpenReader instance is hosted at <span className="font-bold">{origin || 'this server'}</span>. The operator
          of this server can access data that reaches the server.
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Stored in your browser (IndexedDB)</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Uploaded documents (local library)</li>
          <li>Reading progress (last location)</li>
          <li>App settings (voice/speed/provider/base URL)</li>
          <li>Privacy notice acceptance</li>
        </ul>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Sent to this server</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Text for audio generation and associated metadata</li>
          <li>DOCX document upload and conversion only</li>
          <li>Your IP address and device ID cookie used for rate limiting</li>
          <li>(Optionally) Generated audio for word-by-word timestamps</li>
          <li>(Optionally) Your TTS API key so the server can call your TTS provider</li>
        </ul>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Stored on this server</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Documents synced between your browser and this server</li>
          <li>Generated audiobooks</li>
          {authEnabled ? (
            <li>Auth users data and IP rate limiting data are stored in the server&apos;s database</li>
          ) : (
            <li>Authentication is disabled on this server, so no server-side user/session database is used</li>
          )}
        </ul>
      </div>

      <div className="text-xs text-muted">
        Tip: If you are behind a reverse proxy, the proxy operator may also have access to request logs.
      </div>
    </div>
  );
}

export function PrivacyPopup({ onAccept, authEnabled = false }: PrivacyPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [origin, setOrigin] = useState('');

  const checkPrivacyAccepted = useCallback(async () => {
    const config = await getAppConfig();
    if (!config?.privacyAccepted) {
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    checkPrivacyAccepted();
  }, [checkPrivacyAccepted]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOrigin(window.location.origin);
  }, []);

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

                <PrivacyPopupBody origin={origin} authEnabled={authEnabled} />

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
export function showPrivacyPopup(options?: { authEnabled?: boolean }): void {
  // Create a temporary container for the popup
  const container = document.createElement('div');
  container.id = 'privacy-popup-container';
  document.body.appendChild(container);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const authEnabled = Boolean(options?.authEnabled);

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

                      <PrivacyPopupBody origin={origin} authEnabled={authEnabled} />

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
