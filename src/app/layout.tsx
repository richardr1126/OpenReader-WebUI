'use client';

import { useState, useEffect } from 'react';
import { Providers } from './providers';
import './globals.css';

/**
 * Root layout component for the application
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Client-side only state to avoid hydration mismatches
  const [isClient, setIsClient] = useState(false);

  // Set isClient to true once component mounts on the client
  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="OpenReader - Read and listen to documents" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body 
        className="antialiased"
        // This prevents hydration warnings from body attributes added by extensions
        suppressHydrationWarning
      >
        {/* Only render the application content once mounted on the client */}
        {isClient ? (
          <Providers>{children}</Providers>
        ) : (
          // Add a simple loading state while client-side JS initializes
          <div className="flex items-center justify-center h-screen w-screen bg-base">
            <div className="text-foreground">Loading OpenReader...</div>
          </div>
        )}
      </body>
    </html>
  );
}
