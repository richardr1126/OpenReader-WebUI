import type { Metadata } from 'next';

/**
 * Metadata for the application
 * This needs to be exported from a server component
 */
export const metadata: Metadata = {
  title: 'OpenReader',
  description: 'Read and listen to documents with multiple AI providers',
  icons: {
    icon: '/favicon.ico',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
  },
  themeColor: '#000000',
};

/**
 * This component can be imported by pages to set their metadata
 */
export default function PageMetadata() {
  return null;
}