'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useTheme } from '@/contexts/ThemeContext';
import { useConfig } from '@/contexts/ConfigContext';
import { ChevronUpDownIcon, CheckIcon, SettingsIcon } from '@/components/icons/Icons';
import { indexedDBService } from '@/utils/indexedDB';
import { useDocuments } from '@/contexts/DocumentContext';
import { setItem, getItem } from '@/utils/indexedDB';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { THEMES } from '@/contexts/ThemeContext';
import { ProviderType, VoiceProviderType, ProviderSettings } from '@/providers/types';

// Import Theme type from ThemeContext
type Theme = 'system' | 'light' | 'dark' | 'ocean' | 'forest' | 'sunset' | 'sea' | 'mint';

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;

const themes = THEMES.map(id => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1)
}));

// Provider options
const providerOptions = [
  { id: 'openai' as ProviderType, name: 'OpenAI' },
  { id: 'openrouter' as ProviderType, name: 'OpenRouter' },
  { id: 'ollama' as ProviderType, name: 'Ollama' },
];

// Voice provider options
const voiceProviderOptions = [
  { id: 'openai' as VoiceProviderType, name: 'OpenAI' },
  { id: 'elevenlabs' as VoiceProviderType, name: 'ElevenLabs' },
];

// Ollama model interface
interface OllamaModel {
  id: string;
  name: string;
  details?: {
    family: string;
    parameterSize: string;
  };
  size?: number;
}

type InputChangeEvent = React.ChangeEvent<HTMLInputElement>;
type SelectChangeEvent = React.ChangeEvent<HTMLSelectElement>;

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);

  const { theme, setTheme } = useTheme();
  const { 
    apiKey, 
    baseUrl, 
    provider,
    voiceProvider,
    providerSettings,
    updateConfig,
    updateConfigKey
  } = useConfig();
  
  const { refreshPDFs, refreshEPUBs, clearPDFs, clearEPUBs } = useDocuments();
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
  const [localProvider, setLocalProvider] = useState<ProviderType>(provider);
  const [localVoiceProvider, setLocalVoiceProvider] = useState<VoiceProviderType>(voiceProvider);
  const [localProviderSettings, setLocalProviderSettings] = useState<ProviderSettings>(providerSettings);
  
  // Ollama models state
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [ollamaModelError, setOllamaModelError] = useState<string | null>(null);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const selectedTheme = themes.find(t => t.id === theme) || themes[0];
  const selectedProvider = providerOptions.find(p => p.id === localProvider) || providerOptions[0];
  const selectedVoiceProvider = voiceProviderOptions.find(p => p.id === localVoiceProvider) || voiceProviderOptions[0];
  
  const [showClearLocalConfirm, setShowClearLocalConfirm] = useState(false);
  const [showClearServerConfirm, setShowClearServerConfirm] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'providers' | 'advanced'>('general');

  // set firstVisit on initial load
  const checkFirstVist = useCallback(async () => {
    if (!isDev) return;
    const firstVisit = await getItem('firstVisit');
    if (firstVisit == null) {
      await setItem('firstVisit', 'true');
      setIsOpen(true);
    }
  }, [setIsOpen]);

  // Fetch Ollama models when base URL changes
  const fetchOllamaModels = useCallback(async (baseUrl: string) => {
    if (!baseUrl) return;
    
    try {
      setIsLoadingModels(true);
      setOllamaModelError(null);
      
      const response = await fetch(`/api/providers/ollama/models?baseUrl=${encodeURIComponent(baseUrl)}`);
      const data = await response.json();
      
      if (response.ok) {
        setOllamaModels(data.models || []);
        if (data.models?.length === 0 && data.message) {
          setOllamaModelError(data.message);
        }
      } else {
        setOllamaModels([]);
        setOllamaModelError(data.message || 'Failed to fetch Ollama models');
      }
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      setOllamaModels([]);
      setOllamaModelError('Connection error');
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    checkFirstVist();
    setLocalApiKey(apiKey);
    setLocalBaseUrl(baseUrl);
    setLocalProvider(provider);
    setLocalVoiceProvider(voiceProvider);
    setLocalProviderSettings({...providerSettings});
  }, [apiKey, baseUrl, provider, voiceProvider, providerSettings, checkFirstVist]);
  
  // Fetch Ollama models when the tab is active and provider is Ollama
  useEffect(() => {
    if (isOpen && activeSettingsTab === 'providers' && localProvider === 'ollama') {
      fetchOllamaModels(localProviderSettings.ollama?.baseUrl || 'http://localhost:11434');
    }
  }, [isOpen, activeSettingsTab, localProvider, localProviderSettings.ollama?.baseUrl, fetchOllamaModels]);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await indexedDBService.syncToServer();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLoad = async () => {
    try {
      setIsLoading(true);
      await indexedDBService.loadFromServer();
      await Promise.all([refreshPDFs(), refreshEPUBs()]);
    } catch (error) {
      console.error('Load failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLocal = async () => {
    await clearPDFs();
    await clearEPUBs();
    setShowClearLocalConfirm(false);
  };

  const handleClearServer = async () => {
    try {
      const response = await fetch('/api/documents', {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete server documents');
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
    setShowClearServerConfirm(false);
  };

  const handleInputChange = (
    type: 'apiKey' | 'baseUrl' | 'providerSetting', 
    value: string, 
    providerKey?: keyof ProviderSettings, 
    settingKey?: string
  ) => {
    if (type === 'apiKey') {
      setLocalApiKey(value === '' ? '' : value);
      
      // Also update in provider settings for OpenAI
      setLocalProviderSettings(prev => ({
        ...prev,
        openai: {
          ...prev.openai,
          apiKey: value
        }
      }));
    } else if (type === 'baseUrl') {
      setLocalBaseUrl(value === '' ? '' : value);
      
      // Also update in provider settings for OpenAI
      setLocalProviderSettings(prev => ({
        ...prev,
        openai: {
          ...prev.openai,
          baseUrl: value || 'https://api.openai.com/v1'
        }
      }));
    } else if (type === 'providerSetting' && providerKey && settingKey) {
      // Update provider-specific settings
      setLocalProviderSettings(prev => ({
        ...prev,
        [providerKey]: {
          ...prev[providerKey],
          [settingKey]: value
        }
      }));
      
      // Keep OpenAI settings in sync with the legacy apiKey and baseUrl
      if (providerKey === 'openai') {
        if (settingKey === 'apiKey') {
          setLocalApiKey(value);
        } else if (settingKey === 'baseUrl') {
          setLocalBaseUrl(value);
        }
      }
      
      // If changing Ollama base URL, refetch models
      if (providerKey === 'ollama' && settingKey === 'baseUrl') {
        fetchOllamaModels(value);
      }
    }
  };
  
  // Handle Ollama model selection
  const handleOllamaModelChange = (e: SelectChangeEvent) => {
    const modelId = e.target.value;
    handleInputChange('providerSetting', modelId, 'ollama', 'model');
  };
  
  // Handle provider selection change
  const handleProviderChange = (newProvider: { id: ProviderType, name: string }) => {
    setLocalProvider(newProvider.id);
  };
  
  // Handle voice provider selection change
  const handleVoiceProviderChange = (newProvider: { id: VoiceProviderType, name: string }) => {
    setLocalVoiceProvider(newProvider.id);
  };
  
  // Reset all provider settings to defaults
  const resetProviderSettings = () => {
    setLocalProvider('openai');
    setLocalVoiceProvider('openai');
    setLocalProviderSettings({
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
    setLocalApiKey('');
    setLocalBaseUrl('');
    setOllamaModels([]);
    setOllamaModelError(null);
  };
  
  // Save all settings
  const saveSettings = async () => {
    // Update OpenAI key and base URL in provider settings
    const updatedProviderSettings = {
      ...localProviderSettings,
      openai: {
        ...localProviderSettings.openai,
        apiKey: localApiKey,
        baseUrl: localBaseUrl || 'https://api.openai.com/v1',
      }
    };
    
    // Update all config settings
    await updateConfig({
      apiKey: localApiKey || '',
      baseUrl: localBaseUrl || '',
      provider: localProvider,
      voiceProvider: localVoiceProvider,
      providerSettings: updatedProviderSettings,
    });
    
    setIsOpen(false);
  };

  // Handle theme change
  const handleThemeChange = (e: SelectChangeEvent) => {
    // Cast the string value to the Theme type
    setTheme(e.target.value as Theme);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-full p-2 text-foreground hover:bg-offbase transform transition-transform duration-200 ease-in-out hover:scale-[1.1] hover:text-accent absolute top-1 left-1 sm:top-3 sm:left-3"
        aria-label="Settings"
        tabIndex={0}
      >
        <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 hover:animate-spin-slow" />
      </button>

      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => {
          setIsOpen(false);
          setLocalApiKey(apiKey);
          setLocalBaseUrl(baseUrl);
          setLocalProvider(provider);
          setLocalVoiceProvider(voiceProvider);
          setLocalProviderSettings({...providerSettings});
          setOllamaModels([]);
          setOllamaModelError(null);
        }}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform rounded-2xl bg-base p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold leading-6 text-foreground"
                  >
                    Settings
                  </Dialog.Title>
                  <div className="mt-4">
                    <div className="relative space-y-4">
                      {/* Tab navigation */}
                      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
                        <button
                          className={`py-2 px-4 font-medium text-sm ${activeSettingsTab === 'general' ? 'border-b-2 border-accent text-accent' : 'text-foreground/70'}`}
                          onClick={() => setActiveSettingsTab('general')}
                        >
                          General
                        </button>
                        <button
                          className={`py-2 px-4 font-medium text-sm ${activeSettingsTab === 'providers' ? 'border-b-2 border-accent text-accent' : 'text-foreground/70'}`}
                          onClick={() => setActiveSettingsTab('providers')}
                        >
                          AI Providers
                        </button>
                        <button
                          className={`py-2 px-4 font-medium text-sm ${activeSettingsTab === 'advanced' ? 'border-b-2 border-accent text-accent' : 'text-foreground/70'}`}
                          onClick={() => setActiveSettingsTab('advanced')}
                        >
                          Advanced
                        </button>
                      </div>
                      
                      {/* General tab */}
                      {activeSettingsTab === 'general' && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground">Theme</label>
                            <Transition.Root show={true} as={Fragment}>
                              <Transition.Child as="div" enter="" enterFrom="" enterTo="" leave="" leaveFrom="" leaveTo="">
                                <select
                                  value={selectedTheme.id}
                                  onChange={handleThemeChange}
                                  className="w-full cursor-pointer rounded-lg bg-background py-2 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                                >
                                  {themes.map((theme) => (
                                    <option key={theme.id} value={theme.id}>
                                      {theme.name}
                                    </option>
                                  ))}
                                </select>
                              </Transition.Child>
                            </Transition.Root>
                          </div>
                          
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground">Bulk Delete</label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setShowClearLocalConfirm(true)}
                                className="justify-center rounded-lg bg-red-600 px-3 py-1.5 text-sm 
                                         font-medium text-white hover:bg-red-700 focus:outline-none 
                                         focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2
                                         transform transition-transform duration-200 ease-in-out hover:scale-[1.04]"
                              >
                                Delete local docs
                              </button>
                              {isDev && <button
                                onClick={() => setShowClearServerConfirm(true)}
                                className="justify-center rounded-lg bg-red-600 px-3 py-1.5 text-sm 
                                         font-medium text-white hover:bg-red-700 focus:outline-none 
                                         focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2
                                         transform transition-transform duration-200 ease-in-out hover:scale-[1.04]"
                              >
                                Delete server docs
                              </button>}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Providers tab */}
                      {activeSettingsTab === 'providers' && (
                        <div className="space-y-4">
                          {/* TTS Provider Selection */}
                          <div className="flex flex-col gap-4 p-3 bg-background rounded-lg">
                            <div className="flex gap-4 items-center justify-between">
                              <h4 className="text-sm font-semibold text-foreground">Text Processing</h4>
                              <select
                                value={selectedProvider.id}
                                onChange={(e) => setLocalProvider(e.target.value as ProviderType)}
                                className="cursor-pointer rounded-lg bg-base py-1 px-2 text-xs text-foreground border border-offbase focus:outline-none focus:ring-1 focus:ring-accent"
                              >
                                {providerOptions.map((provider) => (
                                  <option key={provider.id} value={provider.id}>
                                    {provider.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            {/* OpenAI specific settings */}
                            {localProvider === 'openai' && (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-foreground/80">
                                    API Key
                                  </label>
                                  <input
                                    type="password"
                                    value={localProviderSettings.openai?.apiKey || ''}
                                    onChange={(e: InputChangeEvent) => 
                                      handleInputChange('providerSetting', e.target.value, 'openai', 'apiKey')}
                                    placeholder="Enter OpenAI API key"
                                    className="w-full rounded-lg bg-base py-1.5 px-2 text-sm text-foreground border border-offbase shadow-sm focus:outline-none focus:ring-1 focus:ring-accent"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-foreground/80">
                                    Base URL
                                  </label>
                                  <input
                                    type="text"
                                    value={localProviderSettings.openai?.baseUrl || 'https://api.openai.com/v1'}
                                    onChange={(e: InputChangeEvent) => 
                                      handleInputChange('providerSetting', e.target.value, 'openai', 'baseUrl')}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full rounded-lg bg-base py-1.5 px-2 text-sm text-foreground border border-offbase shadow-sm focus:outline-none focus:ring-1 focus:ring-accent"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-foreground/80">
                                    Model
                                  </label>
                                  <input
                                    type="text"
                                    value={localProviderSettings.openai?.model || 'tts-1'}
                                    onChange={(e: InputChangeEvent) => 
                                      handleInputChange('providerSetting', e.target.value, 'openai', 'model')}
                                    placeholder="tts-1"
                                    className="w-full rounded-lg bg-base py-1.5 px-2 text-sm text-foreground border border-offbase shadow-sm focus:outline-none focus:ring-1 focus:ring-accent"
                                  />
                                </div>
                              </div>
                            )}
                            
                            {/* OpenRouter specific settings */}
                            {localProvider === 'openrouter' && (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-foreground/80">
                                    API Key
                                  </label>
                                  <input
                                    type="password"
                                    value={localProviderSettings.openrouter?.apiKey || ''}
                                    onChange={(e: InputChangeEvent) => 
                                      handleInputChange('providerSetting', e.target.value, 'openrouter', 'apiKey')}
                                    placeholder="Enter OpenRouter API key"
                                    className="w-full rounded-lg bg-base py-1.5 px-2 text-sm text-foreground border border-offbase shadow-sm focus:outline-none focus:ring-1 focus:ring-accent"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-foreground/80">
                                    Model
                                  </label>
                                  <input
                                    type="text"
                                    value={localProviderSettings.openrouter?.model || 'openai/whisper'}
                                    onChange={(e: InputChangeEvent) => 
                                      handleInputChange('providerSetting', e.target.value, 'openrouter', 'model')}
                                    placeholder="openai/whisper"
                                    className="w-full rounded-lg bg-base py-1.5 px-2 text-sm text-foreground border border-offbase shadow-sm focus:outline-none focus:ring-1 focus:ring-accent"
                                  />
                                </div>
                              </div>
                            )}
                            
                            {/* Ollama specific settings */}
                            {localProvider === 'ollama' && (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-foreground/80">
                                    Base URL
                                  </label>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={localProviderSettings.ollama?.baseUrl || 'http://localhost:11434'}
                                      onChange={(e: InputChangeEvent) => 
                                        handleInputChange('providerSetting', e.target.value, 'ollama', 'baseUrl')}
                                      placeholder="http://localhost:11434"
                                      className="w-full rounded-lg bg-base py-1.5 px-2 text-sm text-foreground border border-offbase shadow-sm focus:outline-none focus:ring-1 focus:ring-accent"
                                    />
                                    <button
                                      onClick={() => fetchOllamaModels(localProviderSettings.ollama?.baseUrl || 'http://localhost:11434')}
                                      className="px-2 py-1 rounded bg-background hover:bg-background/80 text-foreground text-xs"
                                      disabled={isLoadingModels}
                                    >
                                      Refresh
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-xs font-medium text-foreground/80">
                                    Model
                                  </label>
                                  <div className="relative">
                                    {isLoadingModels && (
                                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                        <svg className="animate-spin h-4 w-4 text-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                      </div>
                                    )}
                                    <select
                                      value={localProviderSettings.ollama?.model || ''}
                                      onChange={handleOllamaModelChange}
                                      className="w-full rounded-lg bg-base py-1.5 px-2 text-sm text-foreground border border-offbase shadow-sm focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                                      disabled={isLoadingModels}
                                    >
                                      {ollamaModels.length > 0 ? (
                                        ollamaModels.map((model) => (
                                          <option key={model.id} value={model.id}>
                                            {model.name} {model.details?.parameterSize && `(${model.details.parameterSize})`}
                                          </option>
                                        ))
                                      ) : (
                                        <option value="" disabled>
                                          {ollamaModelError || "No models available - check connection"}
                                        </option>
                                      )}
                                    </select>
                                  </div>
                                  {ollamaModelError && (
                                    <p className="text-xs text-red-500 mt-1">
                                      {ollamaModelError}. Check your Ollama instance is running.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Voice Provider Selection */}
                          <div className="flex flex-col gap-4 p-3 bg-background rounded-lg">
                            <div className="flex gap-4 items-center justify-between">
                              <h4 className="text-sm font-semibold text-foreground">Voice Synthesis</h4>
                              <select
                                value={selectedVoiceProvider.id}
                                onChange={(e) => setLocalVoiceProvider(e.target.value as VoiceProviderType)}
                                className="cursor-pointer rounded-lg bg-base py-1 px-2 text-xs text-foreground border border-offbase focus:outline-none focus:ring-1 focus:ring-accent"
                              >
                                {voiceProviderOptions.map((provider) => (
                                  <option key={provider.id} value={provider.id}>
                                    {provider.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            {/* ElevenLabs specific settings */}
                            {localVoiceProvider === 'elevenlabs' && (
                              <div className="space-y-1">
                                <label className="block text-xs font-medium text-foreground/80">
                                  API Key
                                </label>
                                <input
                                  type="password"
                                  value={localProviderSettings.elevenlabs?.apiKey || ''}
                                  onChange={(e: InputChangeEvent) => 
                                    handleInputChange('providerSetting', e.target.value, 'elevenlabs', 'apiKey')}
                                  placeholder="Enter ElevenLabs API key"
                                  className="w-full rounded-lg bg-base py-1.5 px-2 text-sm text-foreground border border-offbase shadow-sm focus:outline-none focus:ring-1 focus:ring-accent"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Advanced tab */}
                      {activeSettingsTab === 'advanced' && (
                        <div className="space-y-4">
                          {isDev && <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground">Document Sync</label>
                            <div className="flex gap-2">
                              <button
                                onClick={handleLoad}
                                disabled={isSyncing || isLoading}
                                className="justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                                           font-medium text-foreground hover:bg-background/90 focus:outline-none 
                                           focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                                           transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent
                                           disabled:opacity-50"
                              >
                                {isLoading ? 'Loading...' : 'Load docs from Server'}
                              </button>
                              <button
                                onClick={handleSync}
                                disabled={isSyncing || isLoading}
                                className="justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                                           font-medium text-foreground hover:bg-background/90 focus:outline-none 
                                           focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                                           transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent
                                           disabled:opacity-50"
                              >
                                {isSyncing ? 'Saving...' : 'Save local to Server'}
                              </button>
                            </div>
                          </div>}
                          
                          {/* Additional advanced settings could go here */}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                               font-medium text-foreground hover:bg-background/90 focus:outline-none 
                               focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                               transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent" 
                      onClick={resetProviderSettings}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-lg bg-accent px-3 py-1.5 text-sm 
                               font-medium text-white hover:bg-accent/90 focus:outline-none 
                               focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                               transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-background"
                      onClick={saveSettings}
                    >
                      Done
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <ConfirmDialog
        isOpen={showClearLocalConfirm}
        onClose={() => setShowClearLocalConfirm(false)}
        onConfirm={handleClearLocal}
        title="Delete Local Documents"
        message="Are you sure you want to delete all local documents? This action cannot be undone."
        confirmText="Delete"
        isDangerous={true}
      />

      <ConfirmDialog
        isOpen={showClearServerConfirm}
        onClose={() => setShowClearServerConfirm(false)}
        onConfirm={handleClearServer}
        title="Delete Server Documents"
        message="Are you sure you want to delete all documents from the server? This action cannot be undone."
        confirmText="Delete"
        isDangerous={true}
      />
    </>
  );
}
