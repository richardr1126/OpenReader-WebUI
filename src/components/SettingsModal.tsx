'use client';

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
  Button,
  Input,
  TabGroup,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '@headlessui/react';
import { useTheme } from '@/contexts/ThemeContext';
import { useConfig } from '@/contexts/ConfigContext';
import { ChevronUpDownIcon, CheckIcon, SettingsIcon } from '@/components/icons/Icons';
import { syncDocumentsToServer, loadDocumentsFromServer, getFirstVisit, setFirstVisit } from '@/lib/dexie';
import { useDocuments } from '@/contexts/DocumentContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ProgressPopup } from '@/components/ProgressPopup';
import { useTimeEstimation } from '@/hooks/useTimeEstimation';
import { THEMES } from '@/contexts/ThemeContext';
import { deleteServerDocuments } from '@/lib/client';

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;

const themes = THEMES.map(id => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1)
}));

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);

  const { theme, setTheme } = useTheme();
  const { apiKey, baseUrl, ttsProvider, ttsModel, ttsInstructions, updateConfig, updateConfigKey } = useConfig();
  const { clearPDFs, clearEPUBs, clearHTML } = useDocuments();
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
  const [localTTSProvider, setLocalTTSProvider] = useState(ttsProvider);
  const [modelValue, setModelValue] = useState(ttsModel);
  const [customModelInput, setCustomModelInput] = useState('');
  const [localTTSInstructions, setLocalTTSInstructions] = useState(ttsInstructions);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [operationType, setOperationType] = useState<'sync' | 'load'>('sync');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const selectedTheme = themes.find(t => t.id === theme) || themes[0];
  const [showClearLocalConfirm, setShowClearLocalConfirm] = useState(false);
  const [showClearServerConfirm, setShowClearServerConfirm] = useState(false);
  const { progress, setProgress, estimatedTimeRemaining } = useTimeEstimation();

  const ttsProviders = useMemo(() => [
    { id: 'custom-openai', name: 'Custom OpenAI-Like' },
    { id: 'deepinfra', name: 'Deepinfra' },
    { id: 'openai', name: 'OpenAI' }
  ], []);

  const ttsModels = useMemo(() => {
    switch (localTTSProvider) {
      case 'openai':
        return [
          { id: 'tts-1', name: 'TTS-1' },
          { id: 'tts-1-hd', name: 'TTS-1 HD' },
          { id: 'gpt-4o-mini-tts', name: 'GPT-4o Mini TTS' }
        ];
      case 'custom-openai':
        return [
          { id: 'kokoro', name: 'Kokoro' },
          { id: 'orpheus', name: 'Orpheus' },
          { id: 'custom', name: 'Other' }
        ];
      case 'deepinfra':
        // In production without an API key, limit to free tier model
        if (!isDev && !localApiKey) {
          return [
            { id: 'hexgrad/Kokoro-82M', name: 'hexgrad/Kokoro-82M' }
          ];
        }
        // In dev or with an API key, allow all models
        return [
          { id: 'hexgrad/Kokoro-82M', name: 'hexgrad/Kokoro-82M' },
          { id: 'canopylabs/orpheus-3b-0.1-ft', name: 'canopylabs/orpheus-3b-0.1-ft' },
          { id: 'sesame/csm-1b', name: 'sesame/csm-1b' },
          { id: 'ResembleAI/chatterbox', name: 'ResembleAI/chatterbox' },
          { id: 'Zyphra/Zonos-v0.1-hybrid', name: 'Zyphra/Zonos-v0.1-hybrid' },
          { id: 'Zyphra/Zonos-v0.1-transformer', name: 'Zyphra/Zonos-v0.1-transformer' },
          { id: 'custom', name: 'Other' }
        ];
      default:
        return [
          { id: 'tts-1', name: 'TTS-1' }
        ];
    }
  }, [localTTSProvider, localApiKey]);

  const supportsCustom = useMemo(() => localTTSProvider !== 'openai', [localTTSProvider]);

  const selectedModelId = useMemo(
    () => {
      const isPreset = ttsModels.some(m => m.id === modelValue);
      if (isPreset) return modelValue;
      return supportsCustom ? 'custom' : (ttsModels[0]?.id ?? '');
    },
    [ttsModels, modelValue, supportsCustom]
  );

  const canSubmit = useMemo(
    () => selectedModelId !== 'custom' || (supportsCustom && customModelInput.trim().length > 0),
    [selectedModelId, supportsCustom, customModelInput]
  );

  // set firstVisit on initial load
  const checkFirstVist = useCallback(async () => {
    if (!isDev) return;
    const firstVisit = await getFirstVisit();
    if (!firstVisit) {
      await setFirstVisit(true);
      setIsOpen(true);
    }
  }, [setIsOpen]);

  useEffect(() => {
    checkFirstVist();
    setLocalApiKey(apiKey);
    setLocalBaseUrl(baseUrl);
    setLocalTTSProvider(ttsProvider);
    setModelValue(ttsModel);
    setLocalTTSInstructions(ttsInstructions);
  }, [apiKey, baseUrl, ttsProvider, ttsModel, ttsInstructions, checkFirstVist]);

  // Detect if current model is custom (not in presets) and mirror it in the input field
  useEffect(() => {
    if (!ttsModels.some(m => m.id === modelValue) && modelValue !== '') {
      setCustomModelInput(modelValue);
    } else {
      setCustomModelInput('');
    }
  }, [modelValue, ttsModels]);

  const handleSync = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    
    try {
      setIsSyncing(true);
      setShowProgress(true);
      setProgress(0);
      setOperationType('sync');
      setStatusMessage('Preparing documents...');
      await syncDocumentsToServer((progress, status) => {
        if (controller.signal.aborted) return;
        setProgress(progress);
        if (status) setStatusMessage(status);
      }, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        console.log('Sync operation cancelled');
        setStatusMessage('Operation cancelled');
      } else {
        console.error('Sync failed:', error);
        setStatusMessage('Sync failed. Please try again.');
      }
    } finally {
      setIsSyncing(false);
      setShowProgress(false);
      setProgress(0);
      setStatusMessage('');
      setAbortController(null);
    }
  };

  const handleLoad = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    
    try {
      setIsLoading(true);
      setShowProgress(true);
      setProgress(0);
      setOperationType('load');
      setStatusMessage('Downloading documents from server...');
      await loadDocumentsFromServer((progress, status) => {
        if (controller.signal.aborted) return;
        setProgress(progress);
        if (status) setStatusMessage(status);
      }, controller.signal);
      if (controller.signal.aborted) return;
      setStatusMessage('Documents loaded from server');
    } catch (error) {
      if (controller.signal.aborted) {
        console.log('Load operation cancelled');
        setStatusMessage('Operation cancelled');
      } else {
        console.error('Load failed:', error);
        setStatusMessage('Load failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
      setShowProgress(false);
      setProgress(0);
      setStatusMessage('');
      setAbortController(null);
    }
  };

  const handleClearLocal = async () => {
    await clearPDFs();
    await clearEPUBs();
    await clearHTML();
    setShowClearLocalConfirm(false);
  };

  const handleClearServer = async () => {
    try {
      await deleteServerDocuments();
    } catch (error) {
      console.error('Delete failed:', error);
    }
    setShowClearServerConfirm(false);
  };

  const handleInputChange = (type: 'apiKey' | 'baseUrl', value: string) => {
    if (type === 'apiKey') {
      setLocalApiKey(value === '' ? '' : value);
    } else if (type === 'baseUrl') {
      setLocalBaseUrl(value === '' ? '' : value);
    }
  };

  const resetToCurrent = useCallback(() => {
    setIsOpen(false);
    setLocalApiKey(apiKey);
    setLocalBaseUrl(baseUrl);
    setLocalTTSProvider(ttsProvider);
    setModelValue(ttsModel);
    setLocalTTSInstructions(ttsInstructions);
    if (!ttsModels.some(m => m.id === ttsModel) && ttsModel !== '') {
      setCustomModelInput(ttsModel);
    } else {
      setCustomModelInput('');
    }
  }, [apiKey, baseUrl, ttsProvider, ttsModel, ttsInstructions, ttsModels]);

  const tabs = [
    { name: 'API', icon: '🔑' },
    { name: 'Appearance', icon: '✨' },
    { name: 'Documents', icon: '📄' }
  ];

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="rounded-full p-2 text-foreground hover:bg-offbase transform transition-transform duration-200 ease-in-out hover:scale-[1.09] hover:text-accent absolute top-2 right-2 sm:top-4 sm:right-4"
        aria-label="Settings"
        tabIndex={0}
      >
        <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 transform transition-transform duration-200 ease-in-out hover:rotate-45" />
      </Button>

      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={resetToCurrent}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 overlay-dim backdrop-blur-sm" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-md transform rounded-2xl bg-base p-6 text-left align-middle shadow-xl transition-all">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-semibold leading-6 text-foreground mb-4"
                  >
                    Settings
                  </DialogTitle>

                  <TabGroup>
                    <TabList className="flex flex-col sm:flex-col-none sm:flex-row gap-1 rounded-xl bg-background p-1 mb-4">
                      {tabs.map((tab) => (
                        <Tab
                          key={tab.name}
                          className={({ selected }) =>
                            `w-full rounded-lg py-1 text-sm font-medium
                             ring-accent/60 ring-offset-2 ring-offset-base
                             ${selected
                              ? 'bg-accent text-background shadow'
                              : 'text-foreground hover:text-accent'
                            }`
                          }
                        >
                          <span className="flex items-center justify-center gap-2">
                            <span>{tab.icon}</span>
                            {tab.name}
                          </span>
                        </Tab>
                      ))}
                    </TabList>
                    <TabPanels className="mt-2">
                      <TabPanel className="space-y-2.5">
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-foreground">TTS Provider</label>
                          <Listbox
                            value={ttsProviders.find(p => p.id === localTTSProvider) || ttsProviders[0]}
                            onChange={(provider) => {
                              setLocalTTSProvider(provider.id);
                              // Set default model and base_url for each provider
                              if (provider.id === 'openai') {
                                setModelValue('tts-1');
                                setLocalBaseUrl('https://api.openai.com/v1');
                              } else if (provider.id === 'custom-openai') {
                                setModelValue('kokoro');
                                // Clear baseUrl for custom provider
                                setLocalBaseUrl('');
                              } else if (provider.id === 'deepinfra') {
                                setModelValue('hexgrad/Kokoro-82M');
                                setLocalBaseUrl('https://api.deepinfra.com/v1/openai');
                              }
                              setCustomModelInput('');
                            }}
                          >
                            <ListboxButton className="relative w-full cursor-pointer rounded-lg bg-background py-1.5 pl-3 pr-10 text-left text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent transform transition-transform duration-200 ease-in-out hover:scale-[1.009] hover:text-accent hover:bg-offbase">
                              <span className="block truncate">
                                {ttsProviders.find(p => p.id === localTTSProvider)?.name || 'Select Provider'}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon className="h-5 w-5 text-muted" />
                              </span>
                            </ListboxButton>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <ListboxOptions className="absolute mt-1 w-full overflow-auto rounded-md bg-background py-1 shadow-lg ring-1 ring-black/5 focus:outline-none z-50">
                                {ttsProviders.map((provider) => (
                                  <ListboxOption
                                    key={provider.id}
                                    className={({ active }) =>
                                      `relative cursor-pointer select-none py-1.5 pl-10 pr-4 ${
                                        active ? 'bg-offbase text-accent' : 'text-foreground'
                                      }`
                                    }
                                    value={provider}
                                  >
                                    {({ selected }) => (
                                      <>
                                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                          {provider.name}
                                        </span>
                                        {selected ? (
                                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-accent">
                                            <CheckIcon className="h-5 w-5" />
                                          </span>
                                        ) : null}
                                      </>
                                    )}
                                  </ListboxOption>
                                ))}
                              </ListboxOptions>
                            </Transition>
                          </Listbox>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-foreground">
                            API Key
                            {localApiKey && <span className="ml-2 text-xs text-accent">(Overriding env)</span>}
                          </label>
                          <div className="flex gap-2">
                            <Input
                              type="password"
                              value={localApiKey}
                              onChange={(e) => handleInputChange('apiKey', e.target.value)}
                              placeholder={!isDev && localTTSProvider === 'deepinfra' ? "Deepinfra free or use your API key" : "Using environment variable"}
                              className="w-full rounded-lg bg-background py-1.5 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-foreground">TTS Model</label>
                          <div className="flex flex-col gap-2">
                            <Listbox
                              value={ttsModels.find(m => m.id === selectedModelId) || ttsModels[0]}
                              onChange={(model) => {
                                if (model.id === 'custom') {
                                  // Switch to custom: keep the current custom input (or empty)
                                  setModelValue(customModelInput);
                                } else {
                                  setModelValue(model.id);
                                  setCustomModelInput('');
                                }
                              }}
                            >
                              <ListboxButton className="relative w-full cursor-pointer rounded-lg bg-background py-1.5 pl-3 pr-10 text-left text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent transform transition-transform duration-200 ease-in-out hover:scale-[1.009] hover:text-accent hover:bg-offbase">
                                <span className="block truncate">
                                  {ttsModels.find(m => m.id === selectedModelId)?.name || 'Select Model'}
                                </span>
                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                  <ChevronUpDownIcon className="h-5 w-5 text-muted" />
                                </span>
                              </ListboxButton>
                              <Transition
                                as={Fragment}
                                leave="transition ease-in duration-100"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0"
                              >
                                <ListboxOptions className="absolute mt-1 w-full overflow-auto rounded-md bg-background py-1 shadow-lg ring-1 ring-black/5 focus:outline-none z-50">
                                  {ttsModels.map((model) => (
                                    <ListboxOption
                                      key={model.id}
                                      className={({ active }) =>
                                        `relative cursor-pointer select-none py-1.5 pl-10 pr-4 ${
                                          active ? 'bg-offbase text-accent' : 'text-foreground'
                                        }`
                                      }
                                      value={model}
                                    >
                                      {({ selected }) => (
                                        <>
                                          <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                            {model.name}
                                          </span>
                                          {selected ? (
                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-accent">
                                              <CheckIcon className="h-5 w-5" />
                                            </span>
                                          ) : null}
                                        </>
                                      )}
                                    </ListboxOption>
                                  ))}
                                </ListboxOptions>
                              </Transition>
                            </Listbox>

                            {supportsCustom && selectedModelId === 'custom' && (
                              <Input
                                type="text"
                                value={customModelInput}
                                onChange={(e) => {
                                  setCustomModelInput(e.target.value);
                                  setModelValue(e.target.value);
                                }}
                                placeholder="Enter custom model name"
                                className="w-full rounded-lg bg-background py-1.5 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                              />
                            )}
                          </div>
                        </div>

                        {modelValue === 'gpt-4o-mini-tts' && (
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-foreground">TTS Instructions</label>
                            <textarea
                              value={localTTSInstructions}
                              onChange={(e) => setLocalTTSInstructions(e.target.value)}
                              placeholder="Enter instructions for the TTS model"
                              className="w-full h-24 rounded-lg bg-background py-1.5 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                          </div>
                        )}

                        {(localTTSProvider === 'custom-openai' || !localBaseUrl || localBaseUrl === '') && (
                          <div className="space-y-1">
                            <label className="block text-sm font-medium text-foreground">
                              API Base URL
                              {localBaseUrl && <span className="ml-2 text-xs text-accent">(Overriding env)</span>}
                            </label>
                            <div className="flex gap-2">
                              <Input
                                type="text"
                                value={localBaseUrl}
                                onChange={(e) => handleInputChange('baseUrl', e.target.value)}
                                placeholder="Using environment variable"
                                className="w-full rounded-lg bg-background py-1.5 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                              />
                            </div>
                          </div>
                        )}

                        <div className="pt-4 flex justify-end gap-2">
                          <Button
                            type="button"
                            className="inline-flex justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                               font-medium text-foreground hover:bg-offbase focus:outline-none 
                               focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                               transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent"
                            onClick={async () => {
                              setLocalApiKey('');
                              setLocalBaseUrl('');
                              setLocalTTSProvider('custom-openai');
                              setModelValue('kokoro');
                              setCustomModelInput('');
                              setLocalTTSInstructions('');
                            }}
                          >
                            Reset
                          </Button>
                          <Button
                            type="button"
                             className="inline-flex justify-center rounded-lg bg-accent px-3 py-1.5 text-sm 
                               font-medium text-background hover:bg-secondary-accent focus:outline-none 
                               focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                               transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-background"
                            disabled={!canSubmit}
                            onClick={async () => {
                              await updateConfig({
                                apiKey: localApiKey || '',
                                baseUrl: localBaseUrl || '',
                              });
                              await updateConfigKey('ttsProvider', localTTSProvider);
                              const finalModel = selectedModelId === 'custom' ? customModelInput.trim() : modelValue;
                              await updateConfigKey('ttsModel', finalModel);
                              await updateConfigKey('ttsInstructions', localTTSInstructions);
                              setIsOpen(false);
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      </TabPanel>

                      <TabPanel className="space-y-4 pb-3">
                        <div className="space-y-1">
                          <label className="block text-sm font-medium text-foreground">Theme</label>
                          <Listbox value={selectedTheme} onChange={(newTheme) => setTheme(newTheme.id)}>
                            <ListboxButton className="relative w-full cursor-pointer rounded-lg bg-background py-1.5 pl-3 pr-10 text-left text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent transform transition-transform duration-200 ease-in-out hover:scale-[1.009] hover:text-accent hover:bg-offbase">
                              <span className="block truncate">{selectedTheme.name}</span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon className="h-5 w-5 text-muted" />
                              </span>
                            </ListboxButton>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <ListboxOptions className="absolute mt-1 w-full overflow-auto rounded-md bg-background py-1 shadow-lg ring-1 ring-black/5 focus:outline-none">
                                {themes.map((theme) => (
                                  <ListboxOption
                                    key={theme.id}
                                    className={({ active }) =>
                                      `relative cursor-pointer select-none py-1.5 pl-10 pr-4 ${active ? 'bg-offbase text-accent' : 'text-foreground'
                                      }`
                                    }
                                    value={theme}
                                  >
                                    {({ selected }) => (
                                      <>
                                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                          {theme.name}
                                        </span>
                                        {selected ? (
                                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-accent">
                                            <CheckIcon className="h-5 w-5" />
                                          </span>
                                        ) : null}
                                      </>
                                    )}
                                  </ListboxOption>
                                ))}
                              </ListboxOptions>
                            </Transition>
                          </Listbox>
                        </div>
                      </TabPanel>

                      <TabPanel className="space-y-4">
                        {isDev && <div className="space-y-1">
                          <label className="block text-sm font-medium text-foreground">Server Document Sync</label>
                          <div className="flex gap-2">
                            <Button
                              onClick={handleLoad}
                              disabled={isSyncing || isLoading}
                              className="justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                                       font-medium text-foreground hover:bg-offbase focus:outline-none 
                                       focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                                       transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent
                                       disabled:opacity-50"
                            >
                              {isLoading ? `Loading... ${Math.round(progress)}%` : 'Load'}
                            </Button>
                            <Button
                              onClick={handleSync}
                              disabled={isSyncing || isLoading}
                              className="justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                                       font-medium text-foreground hover:bg-offbase focus:outline-none 
                                       focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                                       transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent
                                       disabled:opacity-50"
                            >
                              {isSyncing ? `Saving... ${Math.round(progress)}%` : 'Save to server'}
                            </Button>
                          </div>
                        </div>}

                        <div className="space-y-1 pb-3">
                          <label className="block text-sm font-medium text-foreground">Delete All</label>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => setShowClearLocalConfirm(true)}
                              className="justify-center rounded-lg bg-red-500 px-3 py-1.5 text-sm 
                                         font-medium text-background hover:bg-red-500/90 focus:outline-none 
                                         focus-visible:ring-2 focus-visible:bg-red-500 focus-visible:ring-offset-2
                                       transform transition-transform duration-200 ease-in-out hover:scale-[1.04]"
                            >
                              Delete local
                            </Button>
                            {isDev && <Button
                              onClick={() => setShowClearServerConfirm(true)}
                              className="justify-center rounded-lg bg-red-500 px-3 py-1.5 text-sm 
                                         font-medium text-background hover:bg-red-500/90 focus:outline-none 
                                         focus-visible:ring-2 focus-visible:bg-red-500 focus-visible:ring-offset-2
                                       transform transition-transform duration-200 ease-in-out hover:scale-[1.04]"
                            >
                              Delete server
                            </Button>}
                          </div>
                        </div>
                      </TabPanel>
                    </TabPanels>
                  </TabGroup>
                </DialogPanel>
              </TransitionChild>
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
      
      <ProgressPopup 
        isOpen={showProgress}
        progress={progress}
        estimatedTimeRemaining={estimatedTimeRemaining || undefined}
        onCancel={() => {
          if (abortController) {
            abortController.abort();
          }
          setShowProgress(false);
          setProgress(0);
          setIsSyncing(false);
          setIsLoading(false);
          setStatusMessage('');
          setOperationType('sync');
          setAbortController(null);
        }}
        statusMessage={statusMessage}
        operationType={operationType}
        cancelText="Cancel"
      />
    </>
  );
}
