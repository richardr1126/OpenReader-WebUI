'use client';

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'

export function Footer() {
  return (
    <footer className="m-8 text-sm text-muted">
      <div className="flex flex-col items-center space-y-2">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-center text-center sm:space-x-3">
          <Popover className="flex relative">
            <PopoverButton className="hover:text-foreground transition-colors">
              Privacy info
            </PopoverButton>
            <PopoverPanel anchor="top" className="bg-base p-4 rounded-lg shadow-lg w-64">
              <p>PDF files are processed entirely in your browser and stored locally in IndexedDB. Word documents (.doc/.docx) require temporary server-side conversion but are then stored locally.</p>
              <p className='mt-3'>For text-to-speech, only the current text segment is sent to my server. Audio is cached locally for reuse.</p>
            </PopoverPanel>
          </Popover>
          <span className='w-full sm:w-fit'>•</span>
          <span>
            Powered by{' '}
            <a
              href="https://huggingface.co/hexgrad/Kokoro-82M"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold hover:text-foreground transition-colors"
            >
              hexgrad/Kokoro-82M
            </a>
            {' '}and{' '}
            <a
              href="https://github.com/remsky/Kokoro-FastAPI/tree/master"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold hover:text-foreground transition-colors"
            >
              Kokoro-FastAPI
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
