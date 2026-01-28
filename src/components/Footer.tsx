'use client'

import { GithubIcon } from '@/components/icons/Icons'
import { showPrivacyModal } from '@/components/PrivacyModal'
import { useAuthConfig } from '@/contexts/AuthRateLimitContext'

export function Footer() {
  const { authEnabled } = useAuthConfig();

  return (
    <footer className="m-8 mb-2 text-sm text-muted">
      <div className="flex flex-col items-center space-y-4">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-center text-center sm:space-x-3">
          <a
            href="https://github.com/richardr1126/OpenReader-WebUI#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-bold hover:text-foreground transition-colors"
          >
            <GithubIcon className="w-5 h-5" />
            <span>Self host</span>
          </a>
          <span className='w-full sm:w-fit'>•</span>
          <button
            type="button"
            onClick={() => showPrivacyModal({ authEnabled })}
            className="font-bold hover:text-foreground transition-colors outline-none"
          >
            Privacy
          </button>
          <span className='w-full sm:w-fit'>•</span>
          <span>
            Powered by{' '}
            <a
              href="https://huggingface.co/hexgrad/Kokoro-82M"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold hover:text-foreground transition-colors underline decoration-dotted underline-offset-4"
            >
              hexgrad/Kokoro-82M
            </a>
            {' '}and{' '}
            <a
              href="https://deepinfra.com/models?type=text-to-speech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold hover:text-foreground transition-colors underline decoration-dotted underline-offset-4"
            >
              Deepinfra
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
