'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getItem, indexedDBService, setItem } from '@/services/indexedDB';

interface ConfigContextType {
  apiKey: string;
  baseUrl: string;
  updateConfig: (newConfig: Partial<{ apiKey: string; baseUrl: string }>) => Promise<void>;
  isLoading: boolean;
  isDBReady: boolean;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDBReady, setIsDBReady] = useState(false);

  useEffect(() => {
    const initializeDB = async () => {
      try {
        setIsLoading(true);
        await indexedDBService.init();
        setIsDBReady(true);
        
        // Now load config
        const cachedApiKey = await getItem('apiKey');
        const cachedBaseUrl = await getItem('baseUrl');

        if (cachedApiKey) {
          console.log('Cached API key found:', cachedApiKey);
        }
        if (cachedBaseUrl) {
          console.log('Cached base URL found:', cachedBaseUrl);
        }

        // If not in cache, use env variables
        const defaultApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || '';
        const defaultBaseUrl = process.env.NEXT_PUBLIC_OPENAI_API_BASE || '';

        // Set the values
        setApiKey(cachedApiKey || defaultApiKey);
        setBaseUrl(cachedBaseUrl || defaultBaseUrl);

        // If not in cache, save to cache
        if (!cachedApiKey) {
          await setItem('apiKey', defaultApiKey);
        }
        if (!cachedBaseUrl) {
          await setItem('baseUrl', defaultBaseUrl);
        }
        
      } catch (error) {
        console.error('Error initializing:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeDB();
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
    <ConfigContext.Provider value={{ apiKey, baseUrl, updateConfig, isLoading, isDBReady }}>
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