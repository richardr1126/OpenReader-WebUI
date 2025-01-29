'use client';

import { usePDF } from '@/contexts/PDFContext';
import Link from 'next/link';
import { Button, Dialog } from '@headlessui/react';
import { Transition, TransitionChild, DialogPanel, DialogTitle } from '@headlessui/react';
import { Fragment, useState } from 'react';

export function DocumentList() {
  const { documents, removeDocument, isLoading } = usePDF();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = async () => {
    if (documentToDelete) {
      try {
        await removeDocument(documentToDelete.id);
        setIsDeleteDialogOpen(false);
        setDocumentToDelete(null);
      } catch (err) {
        console.error('Failed to remove document:', err);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="w-full text-center text-muted">
        Loading documents...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="w-full text-center text-muted">
        No documents uploaded yet
      </div>
    );
  }

  return (
    <div className="w-full mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-foreground">Your Documents</h2>
      <div className="bg-background rounded-lg shadow p-2 space-y-2">
        {documents.map((doc) => (
          <Transition
            key={doc.id}
            show={true}
            enter="transition duration-100 ease-out"
            enterFrom="transform scale-95 opacity-0"
            enterTo="transform scale-100 opacity-100"
            leave="transition duration-75 ease-out"
            leaveFrom="transform scale-100 opacity-100"
            leaveTo="transform scale-95 opacity-0"
          >
            <div 
              className="flex items-center justify-between hover:bg-base p-1 rounded-lg transition-colors"
            >
              <Link 
                href={`/pdf/${encodeURIComponent(doc.id)}`}
                className="flex items-center space-x-4 flex-1 min-w-0"
              >
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0 transform transition-transform duration-200 ease-in-out hover:scale-[1.02]">
                  <p className="text-sm sm:text-md text-foreground font-medium truncate">{doc.name}</p>
                  <p className="text-xs sm:text-sm text-muted truncate">
                    {(doc.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </Link>
              <Button
                onClick={() => {
                  setDocumentToDelete({ id: doc.id, name: doc.name });
                  setIsDeleteDialogOpen(true);
                }}
                className="ml-4 p-2 text-muted hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                aria-label="Delete document"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </Button>
            </div>
          </Transition>
        ))}
      </div>

      <Transition appear show={isDeleteDialogOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsDeleteDialogOpen(false)}
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
            <div className="fixed inset-0 bg-black bg-opacity-25" />
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
                <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-background p-6 text-left align-middle shadow-xl transition-all">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-foreground"
                  >
                    Delete Document
                  </DialogTitle>
                  <div className="mt-2">
                    <p className="text-sm text-muted">
                      Are you sure you want to delete <span className='font-bold'>{documentToDelete?.name}</span>? This action cannot be undone.
                    </p>
                  </div>

                  <div className="mt-4 flex justify-end space-x-3">
                    <Button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-base px-4 py-2 text-sm font-medium text-foreground hover:bg-base/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                      onClick={() => setIsDeleteDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                      onClick={handleDelete}
                    >
                      Delete
                    </Button>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
