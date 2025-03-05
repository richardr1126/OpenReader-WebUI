'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { ProviderType, VoiceProviderType, ProviderSettings, DocumentProviderOverride } from '@/providers/types';
import { getItem, indexedDBService, setItem, removeItem } from '@/utils/indexedDB';

/** Represents the possible view types for document display */
export type ViewType = 'single' | 'dual' | 'scroll';

// Map of document IDs to provider overrides
type DocumentOverridesMap = Map<string, DocumentProviderOverride>;

/** Configuration values for the application */
type ConfigValues = {
  apiKey: string;
  baseUrl: string;
  viewType: ViewType;
  voiceSpeed: number;
  voice: string;
  skipBlank: boolean;
  epubTheme: boolean;
  textExtractionMargin: number;
  headerMargin: number;
  footerMargin: number;
  leftMargin: number;
  rightMargin: number;
  // New settings for provider system
  provider: ProviderType;
  voiceProvider: VoiceProviderType;
  providerSettings: ProviderSettings;
  documentProviderOverrides: Record<string, DocumentProviderOverride>;
};

/** Interface defining the configuration context shape and functionality */
interface ConfigContextType {
  apiKey: string;
  baseUrl: string;
  viewType: ViewType;
  voiceSpeed: number;
  voice: string;
  skipBlank: boolean;
  epubTheme: boolean;
  textExtractionMargin: number;
  headerMargin: number;
  footerMargin: number;
  leftMargin: number;
  rightMargin: number;
  // New properties for provider system
  provider: ProviderType;
  voiceProvider: VoiceProviderType;
  providerSettings: ProviderSettings;
  documentProviderOverrides: Record<string, DocumentProviderOverride>;
  // Updated updateConfig to include provider settings
  updateConfig: (newConfig: Partial<{
    apiKey: string;
    baseUrl: string;
    viewType: ViewType;
    provider: ProviderType;
    voiceProvider: VoiceProviderType;
    providerSettings: ProviderSettings;
  }>) => Promise<void>;
  updateConfigKey: <K extends keyof ConfigValues>(key: K, value: ConfigValues[K]) => Promise<void>;
  // New methods for document-specific overrides
  getDocumentProviderOverride: (documentId: string) => DocumentProviderOverride | undefined;
  setDocumentProviderOverride: (documentId: string, override: DocumentProviderOverride) => Promise<void>;
  removeDocumentProviderOverride: (documentId: string) => Promise<void>;
  isLoading: boolean;
  isDBReady: boolean;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

/**
 * Provider component for application configuration
 * Manages global configuration state and persistence
 * @param {Object} props - Component props
 * @param {ReactNode} props.children - Child components to be wrapped by the provider
 */
export function ConfigProvider({ children }: { children: ReactNode }) {
  // Config state
  const [apiKey, setApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [viewType, setViewType] = useState<ViewType>('single');
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1);
  const [voice, setVoice] = useState<string>('af_sarah');
  const [skipBlank, setSkipBlank] = useState<boolean>(true);
  const [epubTheme, setEpubTheme] = useState<boolean>(false);
  const [textExtractionMargin, setTextExtractionMargin] = useState<number>(0.07);
  const [headerMargin, setHeaderMargin] = useState<number>(0.07);
  const [footerMargin, setFooterMargin] = useState<number>(0.07);
  const [leftMargin, setLeftMargin] = useState<number>(0.07);
  
  // New state for provider system
  const [provider, setProvider] = useState<ProviderType>('openai');
  const [voiceProvider, setVoiceProvider] = useState<VoiceProviderType>('openai');
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>({
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'tts-1',
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'llama3:8b',
    },
    openrouter: {
      apiKey: '',
      model: 'openai/whisper',
    },
    elevenlabs: {
      apiKey: '',
    },
  });
  const [documentProviderOverrides, setDocumentProviderOverrides] = useState<Record<string, DocumentProviderOverride>>({});
  const [rightMargin, setRightMargin] = useState<number>(0.07);

  const [isLoading, setIsLoading] = useState(true);
  const [isDBReady, setIsDBReady] = useState(false);

  useEffect(() => {
    const initializeDB = async () => {
      try {
        setIsLoading(true);
        await indexedDBService.init();
        setIsDBReady(true);
        
        // Load config from IndexedDB
        const cachedApiKey = await getItem('apiKey');
        const cachedBaseUrl = await getItem('baseUrl');
        const cachedViewType = await getItem('viewType');
        const cachedVoiceSpeed = await getItem('voiceSpeed');
        const cachedVoice = await getItem('voice');
        const cachedSkipBlank = await getItem('skipBlank');
        const cachedEpubTheme = await getItem('epubTheme');
        const cachedMargin = await getItem('textExtractionMargin');
        const cachedHeaderMargin = await getItem('headerMargin');
        const cachedFooterMargin = await getItem('footerMargin');
        const cachedLeftMargin = await getItem('leftMargin');
        
        // Load new provider settings
        const cachedProvider = await getItem('provider');
        const cachedVoiceProvider = await getItem('voiceProvider');
        const cachedProviderSettings = await getItem('providerSettings');
        const cachedDocumentOverrides = await getItem('documentProviderOverrides');
        const cachedRightMargin = await getItem('rightMargin');

        // Only set API key and base URL if they were explicitly saved by the user
        if (cachedApiKey) {
          console.log('Using cached API key');
          setApiKey(cachedApiKey);
        }
        if (cachedBaseUrl) {
          console.log('Using cached base URL');
          setBaseUrl(cachedBaseUrl);
        }

        // Set the other values with defaults
        setViewType((cachedViewType || 'single') as ViewType);
        setVoiceSpeed(parseFloat(cachedVoiceSpeed || '1'));
        setVoice(cachedVoice || 'af_sarah');
        setSkipBlank(cachedSkipBlank === 'false' ? false : true);
        setEpubTheme(cachedEpubTheme === 'true');
        setTextExtractionMargin(parseFloat(cachedMargin || '0.07'));
        setHeaderMargin(parseFloat(cachedHeaderMargin || '0.07'));
        setFooterMargin(parseFloat(cachedFooterMargin || '0.07'));
        setLeftMargin(parseFloat(cachedLeftMargin || '0.07'));
        
        // Set provider settings with defaults
        setProvider((cachedProvider || 'openai') as ProviderType);
        setVoiceProvider((cachedVoiceProvider || 'openai') as VoiceProviderType);
        
        if (cachedProviderSettings) {
          try {
            const parsedSettings = JSON.parse(cachedProviderSettings);
            setProviderSettings({
              ...providerSettings,
              ...parsedSettings
            });
          } catch (e) {
            console.error('Error parsing provider settings:', e);
          }
        }
        
        if (cachedDocumentOverrides) {
          setDocumentProviderOverrides(JSON.parse(cachedDocumentOverrides));
        }
        setRightMargin(parseFloat(cachedRightMargin || '0.07'));

        // Only save non-sensitive settings by default
        if (!cachedViewType) {
          await setItem('viewType', 'single');
        }
        if (cachedSkipBlank === null) {
          await setItem('skipBlank', 'true');
        }
        if (cachedEpubTheme === null) {
          await setItem('epubTheme', 'false');
        }
        if (cachedMargin === null) {
          await setItem('textExtractionMargin', '0.07');
        }
        if (cachedHeaderMargin === null) await setItem('headerMargin', '0.07');
        if (cachedFooterMargin === null) await setItem('footerMargin', '0.07');
        if (cachedLeftMargin === null) await setItem('leftMargin', '0.0');
        if (cachedRightMargin === null) await setItem('rightMargin', '0.0');
        
        // Save new default settings
        if (cachedProvider === null) await setItem('provider', 'openai');
        if (cachedVoiceProvider === null) await setItem('voiceProvider', 'openai');
        if (cachedProviderSettings === null) {
          await setItem('providerSettings', JSON.stringify(providerSettings));
        }
        if (cachedDocumentOverrides === null) {
          await setItem('documentProviderOverrides', JSON.stringify({}));
        }
        
      } catch (error) {
        console.error('Error initializing:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeDB();
  }, []);

  /**
   * Updates multiple configuration values simultaneously
   * Only saves API credentials if they are explicitly set
   */
  const updateConfig = async (newConfig: Partial<{
    apiKey: string;
    baseUrl: string;
    provider: ProviderType;
    voiceProvider: VoiceProviderType;
    providerSettings: ProviderSettings;
  }>) => {
    try {
      if (newConfig.apiKey !== undefined || newConfig.apiKey !== '') {
        // Only save API key to IndexedDB if it's different from env default
        await setItem('apiKey', newConfig.apiKey!);
        setApiKey(newConfig.apiKey!);
      }
      if (newConfig.baseUrl !== undefined || newConfig.baseUrl !== '') {
        // Only save base URL to IndexedDB if it's different from env default
        await setItem('baseUrl', newConfig.baseUrl!);
        setBaseUrl(newConfig.baseUrl!);
      }
      
      // Handle provider settings
      if (newConfig.provider !== undefined) {
        await setItem('provider', newConfig.provider);
        setProvider(newConfig.provider);
      }
      
      if (newConfig.voiceProvider !== undefined) {
        await setItem('voiceProvider', newConfig.voiceProvider);
        setVoiceProvider(newConfig.voiceProvider);
      }
      
      if (newConfig.providerSettings !== undefined) {
        await setItem('providerSettings', JSON.stringify(newConfig.providerSettings));
        setProviderSettings((prevSettings: ProviderSettings) => ({
          ...prevSettings, ...newConfig.providerSettings
        }));
      }

      // Delete completely if '' is passed
      if (newConfig.apiKey === '') {
        await removeItem('apiKey');
        setApiKey('');
      }
      if (newConfig.baseUrl === '') {
        await removeItem('baseUrl');
        setBaseUrl('');
      }
      
    } catch (error) {
      console.error('Error updating config:', error);
      throw error;
    }
  };

  /**
   * Updates a single configuration value by key
   * @param {K} key - The configuration key to update
   * @param {ConfigValues[K]} value - The new value for the configuration
   */
  const updateConfigKey = async <K extends keyof ConfigValues>(key: K, value: ConfigValues[K]) => {
    try {
      await setItem(key, value.toString());
      switch (key) {
        case 'apiKey':
          setApiKey(value as string);
          break;
        case 'baseUrl':
          setBaseUrl(value as string);
          break;
        case 'viewType':
          setViewType(value as ViewType);
          break;
        case 'voiceSpeed':
          setVoiceSpeed(value as number);
          break;
        case 'voice':
          setVoice(value as string);
          break;
        case 'skipBlank':
          setSkipBlank(value as boolean);
          break;
        case 'epubTheme':
          setEpubTheme(value as boolean);
          break;
        case 'textExtractionMargin':
          setTextExtractionMargin(value as number);
          break;
        case 'headerMargin':
          setHeaderMargin(value as number);
          break;
        case 'footerMargin':
          setFooterMargin(value as number);
          break;
        case 'leftMargin':
          setLeftMargin(value as number);
          break;
        case 'rightMargin':
          setRightMargin(value as number);
          break;
        case 'provider':
          setProvider(value as ProviderType);
          break;
        case 'voiceProvider':
          setVoiceProvider(value as VoiceProviderType);
          break;
        case 'providerSettings':
          setProviderSettings(value as ProviderSettings);
          break;
        case 'documentProviderOverrides':
          setDocumentProviderOverrides(value as Record<string, DocumentProviderOverride>);
          break;
      }
    } catch (error) {
      console.error(`Error updating config key ${key}:`, error);
      throw error;
    }
  };

  /**
   * Gets document-specific provider override if it exists
   * 
   * @param documentId The document ID to check for overrides
   * @returns The document override or undefined if none exists
   */
  const getDocumentProviderOverride = useCallback((documentId: string): DocumentProviderOverride | undefined => {
    return documentProviderOverrides[documentId];
  }, [documentProviderOverrides]);

  /**
   * Sets document-specific provider override
   * 
   * @param documentId The document ID to set override for
   * @param override The provider override settings
   */
  const setDocumentProviderOverride = async (documentId: string, override: DocumentProviderOverride): Promise<void> => {
    try {
      const newOverrides = {
        ...documentProviderOverrides,
        [documentId]: override
      };
      
      await setItem('documentProviderOverrides', JSON.stringify(newOverrides));
      setDocumentProviderOverrides(newOverrides);
    } catch (error) {
      console.error(`Error setting document provider override for ${documentId}:`, error);
      throw error;
    }
  };

  /**
   * Removes document-specific provider override
   * 
   * @param documentId The document ID to remove override for
   */
  const removeDocumentProviderOverride = async (documentId: string): Promise<void> => {
    try {
      const newOverrides = { ...documentProviderOverrides };
      delete newOverrides[documentId];
      
      await setItem('documentProviderOverrides', JSON.stringify(newOverrides));
      setDocumentProviderOverrides(newOverrides);
    } catch (error) {
      console.error(`Error removing document provider override for ${documentId}:`, error);
      throw error;
    }
  };

  return (
    <ConfigContext.Provider value={{ 
      apiKey, 
      baseUrl, 
      viewType, 
      voiceSpeed,
      voice,
      skipBlank,
      epubTheme,
      textExtractionMargin,
      headerMargin,
      footerMargin,
      leftMargin,
      rightMargin,
      provider,
      voiceProvider,
      providerSettings,
      documentProviderOverrides,
      updateConfig, 
      updateConfigKey,
      getDocumentProviderOverride,
      setDocumentProviderOverride,
      removeDocumentProviderOverride,
      isLoading, 
      isDBReady 
    }}>
      {children}
    </ConfigContext.Provider>
  );
}

/**
 * Custom hook to consume the configuration context
 * @returns {ConfigContextType} The configuration context value
 * @throws {Error} When used outside of ConfigProvider
 */
export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}