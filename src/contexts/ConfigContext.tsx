'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getItem, indexedDBService, setItem, removeItem } from '@/utils/indexedDB';

/** Represents the possible view types for document display */
export type ViewType = 'single' | 'dual' | 'scroll';

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
  ttsModel: string;
  ttsInstructions: string;
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
  ttsModel: string;
  ttsInstructions: string;
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
  const [ttsModel, setTTSModel] = useState<string>('tts-1');
  const [ttsInstructions, setTTSInstructions] = useState<string>('');

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
        const cachedAudioPlayerSpeed = await getItem('audioPlayerSpeed');
        const cachedVoice = await getItem('voice');
        const cachedSkipBlank = await getItem('skipBlank');
        const cachedEpubTheme = await getItem('epubTheme');
        const cachedHeaderMargin = await getItem('headerMargin');
        const cachedFooterMargin = await getItem('footerMargin');
        const cachedLeftMargin = await getItem('leftMargin');
        const cachedRightMargin = await getItem('rightMargin');
        const cachedTTSModel = await getItem('ttsModel');
        const cachedTTSInstructions = await getItem('ttsInstructions');

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
        setAudioPlayerSpeed(parseFloat(cachedAudioPlayerSpeed || '1'));
        setVoice(cachedVoice || 'af_sarah');
        setSkipBlank(cachedSkipBlank === 'false' ? false : true);
        setEpubTheme(cachedEpubTheme === 'true');
        setHeaderMargin(parseFloat(cachedHeaderMargin || '0.07'));
        setFooterMargin(parseFloat(cachedFooterMargin || '0.07'));
        setLeftMargin(parseFloat(cachedLeftMargin || '0.07'));
        setRightMargin(parseFloat(cachedRightMargin || '0.07'));
        setTTSModel(cachedTTSModel || 'tts-1');
        setTTSInstructions(cachedTTSInstructions || '');

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
        if (cachedTTSModel === null) {
          await setItem('ttsModel', 'tts-1');
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
        case 'voice':
          setVoice(value as string);
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
        case 'ttsModel':
          setTTSModel(value as string);
          break;
        case 'ttsInstructions':
          setTTSInstructions(value as string);
          break;
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
      ttsModel,
      ttsInstructions,
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