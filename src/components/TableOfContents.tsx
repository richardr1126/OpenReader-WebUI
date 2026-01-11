'use client';

import { Fragment, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { ListIcon } from '@/components/icons/Icons';
import type { Chapter } from '@/lib/chapterDetection';

interface TableOfContentsProps {
  chapters: Chapter[];
  currentChapterIndex: number;
  onChapterSelect: (index: number) => void;
}

export function TableOfContents({ chapters, currentChapterIndex, onChapterSelect }: TableOfContentsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleChapterClick = (index: number) => {
    onChapterSelect(index);
    setIsOpen(false);
  };

  return (
    <>
      {/* Table of Contents Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-3 py-1 text-sm rounded-md border border-muted bg-base text-foreground hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.04] hover:text-accent"
        aria-label="Table of contents"
        title="Table of contents"
      >
        <ListIcon className="w-4 h-4" />
      </button>

      {/* Table of Contents Modal */}
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          role={undefined}
          className="relative z-50"
          onClose={() => setIsOpen(false)}
        >
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
                <DialogPanel role='dialog' className="w-full max-w-2xl transform rounded-2xl bg-base p-6 text-left align-middle shadow-xl transition-all">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-semibold leading-6 text-foreground mb-4"
                  >
                    Table of Contents
                  </DialogTitle>

                  {/* Chapters List */}
                  <div className="mt-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                      {chapters.map((chapter, index) => (
                        <button
                          key={index}
                          onClick={() => handleChapterClick(index)}
                          className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 ease-in-out
                            ${index === currentChapterIndex
                              ? 'bg-accent text-background font-medium'
                              : 'bg-offbase text-foreground hover:bg-muted hover:text-accent hover:scale-[1.02]'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium">
                                {chapter.title}
                              </div>
                            </div>
                            <div className="text-sm opacity-70 ml-2">
                              {index + 1} / {chapters.length}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Close Button */}
                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-lg bg-background px-4 py-2 text-sm
                               font-medium text-foreground hover:bg-offbase focus:outline-none
                               focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                               transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent"
                      onClick={() => setIsOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
