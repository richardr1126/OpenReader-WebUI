import { DocumentList } from '@/components/doclist/DocumentList';
import { DocumentUploader } from '@/components/DocumentUploader';
import { Footer } from '@/components/Footer';
import { SettingsModal } from '@/components/SettingsModal';
import { metadata } from './page-metadata';

/**
 * Home page component
 * Shows document list and uploader
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between py-8 px-0 md:px-8 select-none">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <div className="w-full relative p-2">
          <SettingsModal />
          <h1 className="text-2xl md:text-4xl font-bold text-center text-foreground mb-10">
            OpenReader
          </h1>
          <DocumentUploader />
          <DocumentList />
        </div>
      </div>
      <Footer />
    </main>
  );
}

// Export the metadata for this page
export { metadata };
