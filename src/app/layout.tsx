import "./globals.css";
import { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Toaster } from 'react-hot-toast';
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "OpenReader WebUI",
  description: 'A "bring your own TTS api" web interface for reading PDF and EPUB documents with high quality text-to-speech voices. Read books with ease, listen to articles on the go, or study like you have your own lecturer, all in one place.',
  keywords: "PDF reader, EPUB reader, text to speech, tts open ai, kokoro tts, Kokoro-82M, OpenReader, TTS PDF reader, ebook reader, epub tts, high quality text to speech",
  authors: [{ name: "Richard Roberson" }],
  manifest: "/manifest.json",
  metadataBase: new URL("https://openreader.richardr.dev"), // Replace with your domain
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://openreader.richardr.dev",
    siteName: "OpenReader WebUI",
    title: "OpenReader WebUI",
    description: 'A "bring your own TTS api" web interface for reading PDF and EPUB documents with high quality text-to-speech voices. Read books with ease, listen to articles on the go, or study like you have your own lecturer, all in one place.',
    images: [
      {
        url: "/web-app-manifest-512x512.png",
        width: 512,
        height: 512,
        alt: "OpenReader WebUI Logo",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: "MJXyTudn1kgQF8EtGD-tsnAWev7Iawso9hEvqeGHB3U",
  },
};

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;
//const isDev = false;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="antialiased">
        <Providers>
          <div className="app-shell min-h-screen flex flex-col bg-background">
            <main className="flex-1 flex flex-col">
              {children}
              <Analytics />
            </main>
            {!isDev && (
              <div className="px-4 py-3">
                <Footer />
              </div>
            )}
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
