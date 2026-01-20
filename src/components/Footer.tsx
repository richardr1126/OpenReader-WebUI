import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { GithubIcon } from '@/components/icons/Icons'
import { CodeBlock } from '@/components/CodeBlock'

export function Footer() {
  return (
    <footer className="m-8 mb-2 text-sm text-muted">
      <div className="flex flex-col items-center space-y-4">
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
            <PopoverButton className="font-bold hover:text-foreground transition-colors outline-none flex items-center gap-1">
              Privacy info
            </PopoverButton>
            <PopoverPanel anchor="top" className="bg-base p-4 rounded-lg shadow-xl border border-offbase z-50">
              <p className='max-w-xs'>Documents are uploaded to your local browser cache.</p>
              <p className='mt-3 max-w-xs'>Each paragraph of the document you are viewing is sent to Deepinfra for audio generation through a Vercel backend proxy, containing a shared caching pool.</p>
              <p className='mt-3 max-w-xs'>The audio is streamed back to your browser and played in real-time.</p>
              <p className='mt-3 max-w-xs font-bold'><em>Self-hosting is the recommended way to use this app for a truly secure experience.</em></p>
              {/* Vercel analytics disclaimer */}
              <p className='mt-3 max-w-xs'>This site uses Vercel Analytics to collect anonymous usage data to help improve the service.</p>
            </PopoverPanel>
          </Popover>
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
        <div className='font-medium text-center inline-flex truncate items-center justify-center gap-1'>
          <span>This is a demo app (</span>
          <Popover className="relative">
            <PopoverButton className="font-bold hover:text-foreground transition-colors outline-none inline">
              self-host
            </PopoverButton>
            <PopoverPanel anchor="top" className="bg-base p-6 rounded-xl shadow-2xl border border-offbase w-[90vw] max-w-3xl z-50 backdrop-blur-md flex flex-col gap-4">
              <div className="space-y-4 font-medium">
                <h3 className="text-lg font-bold text-foreground">Self-Hosting Instructions</h3>

                <div>
                  <p className="mb-2 font-medium">
                    1. Start the <a href="https://github.com/remsky/Kokoro-FastAPI" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-foreground underline decoration-dotted underline-offset-4">Kokoro-FastAPI</a> container
                  </p>
                  <CodeBlock>
  {
  `docker run -d \\
  --name kokoro-tts \\
  --restart unless-stopped \\
  -p 8880:8880 \\
  -e ONNX_NUM_THREADS=8 \\
  -e ONNX_INTER_OP_THREADS=4 \\
  -e ONNX_EXECUTION_MODE=parallel \\
  -e ONNX_OPTIMIZATION_LEVEL=all \\
  -e ONNX_MEMORY_PATTERN=true \\
  -e ONNX_ARENA_EXTEND_STRATEGY=kNextPowerOfTwo \\
  -e API_LOG_LEVEL=DEBUG \\
  ghcr.io/remsky/kokoro-fastapi-cpu:v0.2.4`
  }
                  </CodeBlock>
                </div>

                <div>
                  <p className="mb-2 text-foreground font-medium">2. Start OpenReader WebUI container</p>
                  <CodeBlock>
{
`docker run --name openreader-webui --rm \\
-e API_BASE=http://kokoro-tts:8880/v1 \\
-p 3003:3003 \\
-v openreader_docstore:/app/docstore \\
-v /path/to/your/library:/app/docstore/library:ro \\
ghcr.io/richardr1126/openreader-webui:latest`
}
                  </CodeBlock>
                </div>

                <p>
                  Visit <a href="http://localhost:3003" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-foreground transition-colors underline decoration-dotted underline-offset-4">http://localhost:3003</a> to run the app and set your settings.
                  {' '}See the <a href="https://github.com/richardr1126/OpenReader-WebUI#readme" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-foreground transition-colors underline decoration-dotted underline-offset-4">README</a> for more details.
                </p>
              </div>
            </PopoverPanel>
          </Popover>
          <span> for full functionality)</span>
        </div>
      </div>
    </footer>
  )
}
