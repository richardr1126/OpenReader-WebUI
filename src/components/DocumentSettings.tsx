'use client';

import { Fragment } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild, Listbox, ListboxButton, ListboxOptions, ListboxOption, Button } from '@headlessui/react';
import { useConfig, ViewType } from '@/contexts/ConfigContext';
import { ChevronUpDownIcon, CheckIcon } from '@/components/icons/Icons';

interface DocViewSettingsProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  epub?: boolean;
}

const viewTypes = [
  { id: 'single', name: 'Single Page' },
  { id: 'dual', name: 'Two Pages' },
  { id: 'scroll', name: 'Continuous Scroll' },
];

export function DocumentSettings({ isOpen, setIsOpen, epub }: DocViewSettingsProps) {
  const { viewType, skipBlank, updateConfigKey } = useConfig();
  const selectedView = viewTypes.find(v => v.id === viewType) || viewTypes[0];

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => setIsOpen(false)}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
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
                  View Settings
                </DialogTitle>
                <div className="mt-4">
                  <div className="space-y-4">
                    {!epub && <div className="space-y-2">
                      <label className="block text-sm font-medium text-foreground">Mode</label>
                      <Listbox 
                        value={selectedView} 
                        onChange={(newView) => updateConfigKey('viewType', newView.id as ViewType)}
                      >
                        <div className="relative z-10">
                          <ListboxButton className="relative w-full cursor-pointer rounded-lg bg-background py-2 pl-3 pr-10 text-left text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent transform transition-transform duration-200 ease-in-out hover:scale-[1.01] hover:text-accent">
                            <span className="block truncate">{selectedView.name}</span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                              <ChevronUpDownIcon className="h-5 w-5 text-muted" />
                            </span>
                          </ListboxButton>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <ListboxOptions className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-background py-1 shadow-lg ring-1 ring-black/5 focus:outline-none">
                              {viewTypes.map((view) => (
                                <ListboxOption
                                  key={view.id}
                                  className={({ active }) =>
                                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                      active ? 'bg-accent/10 text-accent' : 'text-foreground'
                                    }`
                                  }
                                  value={view}
                                >
                                  {({ selected }) => (
                                    <>
                                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                        {view.name}
                                      </span>
                                      {selected ? (
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-accent">
                                          <CheckIcon className="h-5 w-5" />
                                        </span>
                                      ) : null}
                                    </>
                                  )}
                                </ListboxOption>
                              ))}
                            </ListboxOptions>
                          </Transition>
                        </div>
                      </Listbox>
                      {selectedView.id === 'scroll' && (
                        <p className="text-sm text-warning pt-2">
                          Note: Continuous scroll may perform poorly for larger documents.
                        </p>
                      )}
                    </div>}
                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={skipBlank}
                          onChange={(e) => updateConfigKey('skipBlank', e.target.checked)}
                          className="form-checkbox h-4 w-4 text-accent rounded border-muted"
                        />
                        <span className="text-sm font-medium text-foreground">Skip blank pages</span>
                      </label>
                      <p className="text-sm text-muted pl-6">
                        Automatically skip pages with no text content
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    className="inline-flex justify-center rounded-lg bg-background px-4 py-2 text-sm 
                             font-medium text-foreground hover:bg-background/90 focus:outline-none 
                             focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                             transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent z-1"
                    onClick={() => setIsOpen(false)}
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
}
