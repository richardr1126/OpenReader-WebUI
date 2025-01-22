'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getItem, setItem } from '@/services/indexedDB';

interface ConfigContextType {
  apiKey: string;
  baseUrl: string;
  updateConfig: (newConfig: Partial<{ apiKey: string; baseUrl: string }>) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');

  useEffect(() => {
    const loadConfig = async () => {
      try {
        // Try to load from IndexedDB first
        const cachedApiKey = await getItem('apiKey');
        const cachedBaseUrl = await getItem('baseUrl');

        // If not in cache, use env variables
        const defaultApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';
        const defaultBaseUrl = process.env.NEXT_PUBLIC_OPENAI_API_BASE || '';

        // Set the values
        setApiKey(cachedApiKey || defaultApiKey);
        setBaseUrl(cachedBaseUrl || defaultBaseUrl);

        // If we used default values and they're not empty, store them in IndexedDB
        if (!cachedApiKey && defaultApiKey) {
          await setItem('apiKey', defaultApiKey);
        }
        if (!cachedBaseUrl && defaultBaseUrl) {
          await setItem('baseUrl', defaultBaseUrl);
        }
      } catch (error) {
        console.error('Error loading config:', error);
      }
    };

    loadConfig();
  }, []);

  const updateConfig = async (newConfig: Partial<{ apiKey: string; baseUrl: string }>) => {
    try {
      if (newConfig.apiKey !== undefined) {
        await setItem('apiKey', newConfig.apiKey);
        setApiKey(newConfig.apiKey);
      }
      if (newConfig.baseUrl !== undefined) {
        await setItem('baseUrl', newConfig.baseUrl);
        setBaseUrl(newConfig.baseUrl);
      }
    } catch (error) {
      console.error('Error updating config:', error);
      throw error;
    }
  };

  return (
    <ConfigContext.Provider value={{ apiKey, baseUrl, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}