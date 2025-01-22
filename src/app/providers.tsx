'use client';

import { PDFProvider } from '@/contexts/PDFContext';
import { TTSProvider } from '@/contexts/TTSContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ConfigProvider } from '@/contexts/ConfigContext';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ConfigProvider>
        <TTSProvider>
          <PDFProvider>
            {children}
          </PDFProvider>
        </TTSProvider>
      </ConfigProvider>
    </ThemeProvider>
  );
}
