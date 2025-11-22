import { HomeContent } from '@/components/HomeContent';
import { SettingsModal } from '@/components/SettingsModal';

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;

export default function Home() {
  return (
    <div className="flex flex-col h-full w-full">
      <SettingsModal />
      <section className="px-4 pt-6 pb-4 md:pt-10 md:pb-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 text-foreground">OpenReader WebUI</h1>
          <p className="text-sm leading-relaxed max-w-[77ch] text-foreground">
            Open source document reader web app {isDev ? 'self-hosted server' : 'demo'}.
            <span className="block font-medium">Read & listen to PDF, EPUB, MD, and TXT documents with high quality text to speech voices.</span>
          </p>
        </div>
      </section>
      <section className="flex-1 px-4 pb-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <div className="prism-divider mb-4 sm:mb-6" aria-hidden="true" />
          <HomeContent />
        </div>
      </section>
    </div>
  );
}
