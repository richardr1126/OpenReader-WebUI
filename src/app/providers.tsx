import { ReactNode } from 'react';

import { DocumentProvider } from '@/contexts/DocumentContext';
import { PDFProvider } from '@/contexts/PDFContext';
import { EPUBProvider } from '@/contexts/EPUBContext';
import { TTSProvider } from '@/contexts/TTSContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { HTMLProvider } from '@/contexts/HTMLContext';
import { AuthRateLimitProvider } from '@/contexts/AuthRateLimitContext';
import { PrivacyPopup } from '@/components/privacy-popup';

interface ProvidersProps {
  children: ReactNode;
  authEnabled: boolean;
  authBaseUrl: string | null;
}

export function Providers({ children, authEnabled, authBaseUrl }: ProvidersProps) {
  return (
    <AuthRateLimitProvider authEnabled={authEnabled} authBaseUrl={authBaseUrl}>
      <ThemeProvider>
        <ConfigProvider>
          <DocumentProvider>
            <TTSProvider>
              <PDFProvider>
                <EPUBProvider>
                  <HTMLProvider>
                    {children}
                    <PrivacyPopup authEnabled={authEnabled} />
                  </HTMLProvider>
                </EPUBProvider>
              </PDFProvider>
            </TTSProvider>
          </DocumentProvider>
        </ConfigProvider>
      </ThemeProvider>
    </AuthRateLimitProvider>
  );
}
