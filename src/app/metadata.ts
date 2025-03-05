import { Metadata } from 'next';

/**
 * Metadata for the application
 */
export const metadata: Metadata = {
  title: 'OpenReader',
  description: 'Read and listen to documents with multiple AI providers',
  icons: {
    icon: '/favicon.ico',
  },
  manifest: '/manifest.json',
  viewport: {
    width: 'device-width',
    initialScale: 1,
  },
  themeColor: '#000000',
};