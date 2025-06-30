import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { GithubIcon } from '@/components/icons/Icons'

export function Footer() {
  return (
    <footer className="m-8 text-sm text-muted">
      <div className="flex flex-col items-center space-y-2">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-center text-center sm:space-x-3">
          <a
            href="https://github.com/richardr1126/OpenReader-WebUI"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            <GithubIcon className="w-5 h-5" />
          </a>
          <span className='w-full sm:w-fit'>•</span>
          <Popover className="flex">
            <PopoverButton className="hover:text-foreground transition-colors flex items-center gap-1">
              Privacy info
            </PopoverButton>
            <PopoverPanel anchor="top" className="bg-base p-4 rounded-lg shadow-lg w-64">
              <p>Documents are uploaded to your local browser cache.</p>
              <p className='mt-3'>Each sentence of the document you are viewing is sent to my Kokoro-FastAPI server for audio generation.</p>
              <p className='mt-3'>The audio is streamed back to your browser and played in real-time.</p>
              {/* Vercel analytics disclaimer */}
              <p className='mt-3'>This site uses Vercel Analytics to collect anonymous usage data to help improve the service.</p>
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
