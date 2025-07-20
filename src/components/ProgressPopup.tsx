import { Fragment } from 'react';
import { Transition } from '@headlessui/react';
import { LoadingSpinner } from './Spinner';

interface ProgressPopupProps {
  isOpen: boolean;
  progress: number;
  estimatedTimeRemaining?: string;
  onCancel: () => void;
  isProcessing: boolean;
  statusMessage?: string;
  operationType?: 'sync' | 'load';
}

export function ProgressPopup({ isOpen, progress, estimatedTimeRemaining, onCancel, isProcessing, statusMessage, operationType }: ProgressPopupProps) {
  return (
    <Transition
      show={isOpen}
      as={Fragment}
      enter="transform transition ease-out duration-300"
      enterFrom="opacity-0 -translate-y-4"
      enterTo="opacity-100 translate-y-0"
      leave="transform transition ease-in duration-200"
      leaveFrom="opacity-100 translate-y-0"
      leaveTo="opacity-0 -translate-y-4"
    >
      <div className="fixed inset-x-0 top-2 z-[60] pointer-events-none">
        <div className="w-full max-w-sm mx-auto">
          <div className="w-full transform rounded-lg bg-offbase p-4 shadow-xl pointer-events-auto">
            <div className="space-y-2 truncate">
              <div className="w-full bg-background rounded-lg overflow-hidden">
                <div
                  className="h-2 bg-accent transition-all duration-300 ease-in-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-sm text-muted text-xs sm:text-sm">
                <div className="flex flex-col gap-1">
                  {operationType && (
                    <span className="text-accent font-semibold text-xs uppercase tracking-wide">
                      {operationType === 'sync' ? 'Saving to Server' : 'Loading from Server'}
                    </span>
                  )}
                  {statusMessage && <span className="text-foreground font-medium">{statusMessage}</span>}
                  <div className="flex flex-wrap items-center gap-1">
                    <span>{Math.round(progress)}% complete</span>
                    {estimatedTimeRemaining && <div>
                      <span>&bull;</span>
                      <span>{` ~${estimatedTimeRemaining}`}</span>
                    </div>}
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex justify-center rounded-lg px-2.5 py-1
                            font-medium text-foreground hover:text-accent focus:outline-none 
                            focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                            transform transition-transform duration-200 ease-in-out hover:scale-[1.02]"
                  onClick={onCancel}
                >
                  {isProcessing ? (
                    <div className="w-full h-full flex items-center justify-end">
                      <LoadingSpinner />
                    </div>
                  ) : (
                    'Cancel and download'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  );
}