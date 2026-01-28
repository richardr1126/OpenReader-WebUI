import { ReactNode } from 'react';

import { DocumentProvider } from '@/contexts/DocumentContext';
import { PDFProvider } from '@/contexts/PDFContext';
import { EPUBProvider } from '@/contexts/EPUBContext';
import { TTSProvider } from '@/contexts/TTSContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { HTMLProvider } from '@/contexts/HTMLContext';
import { AuthRateLimitProvider } from '@/contexts/AuthRateLimitContext';
import { PrivacyModal } from '@/components/PrivacyModal';
import { AuthLoader } from '@/components/auth/AuthLoader';

interface ProvidersProps {
  children: ReactNode;
  authEnabled: boolean;
  authBaseUrl: string | null;
}

export function Providers({ children, authEnabled, authBaseUrl }: ProvidersProps) {
  return (
    <AuthRateLimitProvider authEnabled={authEnabled} authBaseUrl={authBaseUrl}>
      <ThemeProvider>
        <AuthLoader>
          <ConfigProvider>
            <DocumentProvider>
              <TTSProvider>
                <PDFProvider>
                  <EPUBProvider>
                    <HTMLProvider>
                      <>
                        {children}
                        <PrivacyModal authEnabled={authEnabled} />
                      </>
                    </HTMLProvider>
                  </EPUBProvider>
                </PDFProvider>
              </TTSProvider>
            </DocumentProvider>
          </ConfigProvider>
        </AuthLoader>
      </ThemeProvider>
    </AuthRateLimitProvider>
  );
}
