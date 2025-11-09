'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getItem, indexedDBService, setItem, removeItem } from '@/utils/indexedDB';

/** Represents the possible view types for document display */
export type ViewType = 'single' | 'dual' | 'scroll';

/** Saved voice configurations per provider-model */
type SavedVoices = Record<string, string>;

/** Configuration values for the application */
type ConfigValues = {
  apiKey: string;
  baseUrl: string;
  viewType: ViewType;
  voiceSpeed: number;
  audioPlayerSpeed: number;
  voice: string;
  skipBlank: boolean;
  epubTheme: boolean;
  headerMargin: number;
  footerMargin: number;
  leftMargin: number;
  rightMargin: number;
  ttsProvider: string;
  ttsModel: string;
  ttsInstructions: string;
  savedVoices: SavedVoices;
};

/** Interface defining the configuration context shape and functionality */
interface ConfigContextType {
  apiKey: string;
  baseUrl: string;
  viewType: ViewType;
  voiceSpeed: number;
  audioPlayerSpeed: number;
  voice: string;
  skipBlank: boolean;
  epubTheme: boolean;
  headerMargin: number;
  footerMargin: number;
  leftMargin: number;
  rightMargin: number;
  ttsProvider: string;
  ttsModel: string;
  ttsInstructions: string;
  savedVoices: SavedVoices;
  updateConfig: (newConfig: Partial<{ apiKey: string; baseUrl: string; viewType: ViewType }>) => Promise<void>;
  updateConfigKey: <K extends keyof ConfigValues>(key: K, value: ConfigValues[K]) => Promise<void>;
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
  const [audioPlayerSpeed, setAudioPlayerSpeed] = useState<number>(1);
  const [voice, setVoice] = useState<string>('af_sarah');
  const [skipBlank, setSkipBlank] = useState<boolean>(true);
  const [epubTheme, setEpubTheme] = useState<boolean>(false);
  const [headerMargin, setHeaderMargin] = useState<number>(0.07);
  const [footerMargin, setFooterMargin] = useState<number>(0.07);
  const [leftMargin, setLeftMargin] = useState<number>(0.07);
  const [rightMargin, setRightMargin] = useState<number>(0.07);
  const [ttsProvider, setTTSProvider] = useState<string>('custom-openai');
  const [ttsModel, setTTSModel] = useState<string>('kokoro');
  const [ttsInstructions, setTTSInstructions] = useState<string>('');
  const [savedVoices, setSavedVoices] = useState<SavedVoices>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isDBReady, setIsDBReady] = useState(false);

  // Helper function to generate provider-model key
  const getVoiceKey = (provider: string, model: string) => `${provider}:${model}`;

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
        const cachedAudioPlayerSpeed = await getItem('audioPlayerSpeed');
        const cachedSkipBlank = await getItem('skipBlank');
        const cachedEpubTheme = await getItem('epubTheme');
        const cachedHeaderMargin = await getItem('headerMargin');
        const cachedFooterMargin = await getItem('footerMargin');
        const cachedLeftMargin = await getItem('leftMargin');
        const cachedRightMargin = await getItem('rightMargin');
        const cachedTTSProvider = await getItem('ttsProvider');
        const cachedTTSModel = await getItem('ttsModel');
        const cachedTTSInstructions = await getItem('ttsInstructions');
        const cachedSavedVoices = await getItem('savedVoices');

        // Migration logic: infer provider and baseUrl for returning users
        let inferredProvider = cachedTTSProvider || '';
        let inferredBaseUrl = cachedBaseUrl || '';

        if (!inferredProvider) {
          if (cachedBaseUrl) {
            const baseUrlLower = cachedBaseUrl.toLowerCase();
            if (baseUrlLower.includes('deepinfra.com')) {
              inferredProvider = 'deepinfra';
            } else if (baseUrlLower.includes('openai.com')) {
              inferredProvider = 'openai';
            } else if (
              baseUrlLower.includes('localhost') ||
              baseUrlLower.includes('127.0.0.1') ||
              baseUrlLower.includes('internal')
            ) {
              inferredProvider = 'custom-openai';
            } else {
              // Unknown host: fall back based on presence of API key
              inferredProvider = cachedApiKey ? 'openai' : 'custom-openai';
            }
          } else {
            // No provider stored and no baseUrl stored
            // If there is an API key and no base URL -> assume OpenAI
            // If empty with no API key -> default to custom
            inferredProvider = cachedApiKey ? 'openai' : 'custom-openai';
          }
        }

        // If baseUrl is missing, set a safe default based on the inferred provider
        if (!inferredBaseUrl) {
          if (inferredProvider === 'openai') {
            inferredBaseUrl = 'https://api.openai.com/v1';
          } else if (inferredProvider === 'deepinfra') {
            inferredBaseUrl = 'https://api.deepinfra.com/v1/openai';
          } else {
            inferredBaseUrl = '';
          }
        }

        // Only set API key and base URL if they were explicitly saved by the user
        if (cachedApiKey) {
          console.log('Using cached API key');
          setApiKey(cachedApiKey);
        }
        if (cachedBaseUrl) {
          console.log('Using cached base URL');
          setBaseUrl(cachedBaseUrl);
        } else if (inferredBaseUrl) {
          // Migration: no stored baseUrl, pick a safe default from provider inference
          console.log('Setting default base URL from inferred provider', inferredBaseUrl);
          setBaseUrl(inferredBaseUrl);
          await setItem('baseUrl', inferredBaseUrl);
        }

        // Parse savedVoices
        let parsedSavedVoices: SavedVoices = {};
        if (cachedSavedVoices) {
          try {
            parsedSavedVoices = JSON.parse(cachedSavedVoices);
          } catch (error) {
            console.error('Error parsing savedVoices:', error);
          }
        }
        setSavedVoices(parsedSavedVoices);

        // Set the other values with defaults
        setViewType((cachedViewType || 'single') as ViewType);
        setVoiceSpeed(parseFloat(cachedVoiceSpeed || '1'));
        setAudioPlayerSpeed(parseFloat(cachedAudioPlayerSpeed || '1'));
        setSkipBlank(cachedSkipBlank === 'false' ? false : true);
        setEpubTheme(cachedEpubTheme === 'true');
        setHeaderMargin(parseFloat(cachedHeaderMargin || '0.07'));
        setFooterMargin(parseFloat(cachedFooterMargin || '0.07'));
        setLeftMargin(parseFloat(cachedLeftMargin || '0.07'));
        setRightMargin(parseFloat(cachedRightMargin || '0.07'));
        setTTSProvider(inferredProvider || 'custom-openai');
        const finalModel = cachedTTSModel || (inferredProvider === 'openai' ? 'tts-1' : inferredProvider === 'deepinfra' ? 'hexgrad/Kokoro-82M' : 'kokoro');
        setTTSModel(finalModel);
        setTTSInstructions(cachedTTSInstructions || '');

        // Restore voice for current provider-model if available in savedVoices
        const voiceKey = getVoiceKey(inferredProvider || 'custom-openai', finalModel);
        const restoredVoice = parsedSavedVoices[voiceKey] || '';
        setVoice(restoredVoice);

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
        if (cachedHeaderMargin === null) await setItem('headerMargin', '0.07');
        if (cachedFooterMargin === null) await setItem('footerMargin', '0.07');
        if (cachedLeftMargin === null) await setItem('leftMargin', '0.0');
        if (cachedRightMargin === null) await setItem('rightMargin', '0.0');
        if (cachedTTSProvider === null && inferredProvider) {
          await setItem('ttsProvider', inferredProvider);
        } else if (cachedTTSProvider === null) {
          await setItem('ttsProvider', 'custom-openai');
        }
        if (cachedTTSModel === null) {
          const defaultModel = inferredProvider === 'openai' ? 'tts-1' : inferredProvider === 'deepinfra' ? 'hexgrad/Kokoro-82M' : 'kokoro';
          await setItem('ttsModel', defaultModel);
        }
        if (cachedTTSInstructions === null) {
          await setItem('ttsInstructions', '');
        }
        if (!cachedVoiceSpeed) {
          await setItem('voiceSpeed', '1');
        }
        if (!cachedAudioPlayerSpeed) {
          await setItem('audioPlayerSpeed', '1');
        }
        if (!cachedSavedVoices) {
          await setItem('savedVoices', JSON.stringify({}));
        }
        // Always ensure voice is not stored standalone - only in savedVoices
        await removeItem('voice');
        
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
  const updateConfig = async (newConfig: Partial<{ apiKey: string; baseUrl: string; viewType: ViewType }>) => {
    try {
      setIsLoading(true);
      if (newConfig.apiKey !== undefined && newConfig.apiKey !== '') {
        // Only save API key to IndexedDB if it's different from env default
        await setItem('apiKey', newConfig.apiKey!);
        setApiKey(newConfig.apiKey!);
      }
      if (newConfig.baseUrl !== undefined && newConfig.baseUrl !== '') {
        // Only save base URL to IndexedDB if it's different from env default
        await setItem('baseUrl', newConfig.baseUrl!);
        setBaseUrl(newConfig.baseUrl!);
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
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Updates a single configuration value by key
   * @param {K} key - The configuration key to update
   * @param {ConfigValues[K]} value - The new value for the configuration
   */
  const updateConfigKey = async <K extends keyof ConfigValues>(key: K, value: ConfigValues[K]) => {
    try {
      setIsLoading(true);
      
      // Special handling for voice - only update savedVoices
      if (key === 'voice') {
        const voiceKey = getVoiceKey(ttsProvider, ttsModel);
        const updatedSavedVoices = { ...savedVoices, [voiceKey]: value as string };
        setSavedVoices(updatedSavedVoices);
        await setItem('savedVoices', JSON.stringify(updatedSavedVoices));
        setVoice(value as string);
      }
      // Special handling for provider/model changes - restore saved voice if available
      else if (key === 'ttsProvider' || key === 'ttsModel') {
        const newProvider = key === 'ttsProvider' ? (value as string) : ttsProvider;
        const newModel = key === 'ttsModel' ? (value as string) : ttsModel;
        const voiceKey = getVoiceKey(newProvider, newModel);
        
        // Update provider or model
        await setItem(key, value.toString());
        if (key === 'ttsProvider') {
          setTTSProvider(value as string);
        } else {
          setTTSModel(value as string);
        }
        
        // Restore voice for this provider-model combination if it exists
        const restoredVoice = savedVoices[voiceKey];
        if (restoredVoice) {
          setVoice(restoredVoice);
        } else {
          // Clear voice so TTSContext will use first available
          setVoice('');
        }
      }
      else if (key === 'savedVoices') {
        setSavedVoices(value as SavedVoices);
        await setItem('savedVoices', JSON.stringify(value));
      }
      else {
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
          case 'audioPlayerSpeed':
            setAudioPlayerSpeed(value as number);
            break;
          case 'skipBlank':
            setSkipBlank(value as boolean);
            break;
          case 'epubTheme':
            setEpubTheme(value as boolean);
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
          case 'ttsInstructions':
            setTTSInstructions(value as string);
            break;
        }
      }
    } catch (error) {
      console.error(`Error updating config key ${key}:`, error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ConfigContext.Provider value={{
      apiKey,
      baseUrl,
      viewType,
      voiceSpeed,
      audioPlayerSpeed,
      voice,
      skipBlank,
      epubTheme,
      headerMargin,
      footerMargin,
      leftMargin,
      rightMargin,
      ttsProvider,
      ttsModel,
      ttsInstructions,
      savedVoices,
      updateConfig,
      updateConfigKey,
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