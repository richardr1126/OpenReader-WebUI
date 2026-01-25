'use client';

import { ReactNode } from 'react';

import { DocumentProvider } from '@/contexts/DocumentContext';
import { PDFProvider } from '@/contexts/PDFContext';
import { EPUBProvider } from '@/contexts/EPUBContext';
import { TTSProvider } from '@/contexts/TTSContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { HTMLProvider } from '@/contexts/HTMLContext';
import { RateLimitProvider } from '@/components/rate-limit-provider';
import { PrivacyPopup } from '@/components/privacy-popup';
import { AuthConfigProvider } from '@/contexts/AuthConfigContext';

interface ProvidersProps {
  children: ReactNode;
  authEnabled: boolean;
  authBaseUrl: string | null;
}

export function Providers({ children, authEnabled, authBaseUrl }: ProvidersProps) {
  const content = (
    <ThemeProvider>
      <ConfigProvider>
        <DocumentProvider>
          <TTSProvider>
            <PDFProvider>
              <EPUBProvider>
                <HTMLProvider>
                  {children}
                  <PrivacyPopup />
                </HTMLProvider>
              </EPUBProvider>
            </PDFProvider>
          </TTSProvider>
        </DocumentProvider>
      </ConfigProvider>
    </ThemeProvider>
  );

  // Wrap with RateLimitProvider only when auth is enabled
  const wrappedContent = authEnabled ? (
    <RateLimitProvider>{content}</RateLimitProvider>
  ) : content;

  return (
    <AuthConfigProvider authEnabled={authEnabled} baseUrl={authBaseUrl}>
      {wrappedContent}
    </AuthConfigProvider>
  );
}
