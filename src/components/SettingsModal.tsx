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
import { indexedDBService } from '@/utils/indexedDB';
import { useDocuments } from '@/contexts/DocumentContext';
import { setItem, getItem } from '@/utils/indexedDB';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { THEMES } from '@/contexts/ThemeContext';

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;

const themes = THEMES.map(id => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1)
}));

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);

  const { theme, setTheme } = useTheme();
  const { apiKey, baseUrl, ttsModel, ttsInstructions, updateConfig, updateConfigKey } = useConfig();
  const { refreshPDFs, refreshEPUBs, clearPDFs, clearEPUBs } = useDocuments();
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
  const [localTTSModel, setLocalTTSModel] = useState(ttsModel);
  const [customModel, setCustomModel] = useState('');
  const [localTTSInstructions, setLocalTTSInstructions] = useState(ttsInstructions);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const selectedTheme = themes.find(t => t.id === theme) || themes[0];
  const [showClearLocalConfirm, setShowClearLocalConfirm] = useState(false);
  const [showClearServerConfirm, setShowClearServerConfirm] = useState(false);

  const ttsModels = useMemo(() => [
    { id: 'tts-1', name: 'TTS-1' },
    { id: 'tts-1-hd', name: '($$) TTS-1-HD' },
    { id: 'gpt-4o-mini-tts', name: '($$$) GPT-4o Mini TTS' },
    { id: 'kokoro', name: 'Kokoro' },
    { id: 'custom', name: 'Custom Model' }
  ], []);

  // set firstVisit on initial load
  const checkFirstVist = useCallback(async () => {
    if (!isDev) return;
    const firstVisit = await getItem('firstVisit');
    if (firstVisit == null) {
      await setItem('firstVisit', 'true');
      setIsOpen(true);
    }
  }, [setIsOpen]);

  useEffect(() => {
    checkFirstVist();
    setLocalApiKey(apiKey);
    setLocalBaseUrl(baseUrl);
    setLocalTTSModel(ttsModel);
    setLocalTTSInstructions(ttsInstructions);
    // Set custom model if current model is not in predefined list
    if (!ttsModels.some(m => m.id === ttsModel) && ttsModel !== '') {
      setCustomModel(ttsModel);
      setLocalTTSModel('custom');
    }
  }, [apiKey, baseUrl, ttsModel, ttsModels, ttsInstructions, checkFirstVist]);

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

  const handleInputChange = (type: 'apiKey' | 'baseUrl' | 'ttsModel', value: string) => {
    if (type === 'apiKey') {
      setLocalApiKey(value === '' ? '' : value);
    } else if (type === 'baseUrl') {
      setLocalBaseUrl(value === '' ? '' : value);
    } else if (type === 'ttsModel') {
      setLocalTTSModel(value === '' ? 'tts-1' : value);
    }
  };

  const resetToCurrent = useCallback(() => {
    setIsOpen(false);
    setLocalApiKey(apiKey);
    setLocalBaseUrl(baseUrl);
    setLocalTTSModel(ttsModel);
    setLocalTTSInstructions(ttsInstructions);
    if (!ttsModels.some(m => m.id === ttsModel) && ttsModel !== '') {
      setCustomModel(ttsModel);
      setLocalTTSModel('custom');
    }
  }, [apiKey, baseUrl, ttsModel, ttsInstructions, ttsModels]);

  const tabs = [
    { name: 'Appearance', icon: '✨' },
    { name: 'API', icon: '🔑' },
    { name: 'Documents', icon: '📄' }
  ];

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="rounded-full p-2 text-foreground hover:bg-offbase transform transition-transform duration-200 ease-in-out hover:scale-[1.1] hover:text-accent absolute top-1 left-1 sm:top-3 sm:left-3"
        aria-label="Settings"
        tabIndex={0}
      >
        <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 hover:animate-spin-slow" />
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
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
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
                              ? 'bg-accent text-white shadow'
                              : 'text-foreground hover:bg-accent/[0.12] hover:text-accent'
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
                      <TabPanel className="space-y-4 pb-3">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-foreground">Theme</label>
                          <Listbox value={selectedTheme} onChange={(newTheme) => setTheme(newTheme.id)}>
                            <ListboxButton className="relative w-full cursor-pointer rounded-lg bg-background py-2 pl-3 pr-10 text-left text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent transform transition-transform duration-200 ease-in-out hover:scale-[1.01] hover:text-accent">
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
                              <ListboxOptions className="absolute mt-1 max-h-40 w-full overflow-auto rounded-md bg-background py-1 shadow-lg ring-1 ring-black/5 focus:outline-none">
                                {themes.map((theme) => (
                                  <ListboxOption
                                    key={theme.id}
                                    className={({ active }) =>
                                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${active ? 'bg-accent/10 text-accent' : 'text-foreground'
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
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-foreground">
                            OpenAI API Key
                            {localApiKey && <span className="ml-2 text-xs text-accent">(Overriding env)</span>}
                          </label>
                          <div className="flex gap-2">
                            <Input
                              type="password"
                              value={localApiKey}
                              onChange={(e) => handleInputChange('apiKey', e.target.value)}
                              placeholder="Using environment variable"
                              className="w-full rounded-lg bg-background py-2 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-foreground">
                            OpenAI API Base URL
                            {localBaseUrl && <span className="ml-2 text-xs text-accent">(Overriding env)</span>}
                          </label>
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              value={localBaseUrl}
                              onChange={(e) => handleInputChange('baseUrl', e.target.value)}
                              placeholder="Using environment variable"
                              className="w-full rounded-lg bg-background py-2 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-foreground">TTS Model</label>
                          <div className="flex flex-col gap-2">
                            <Listbox 
                              value={ttsModels.find(m => m.id === localTTSModel) || ttsModels[0]} 
                              onChange={(model) => {
                                setLocalTTSModel(model.id);
                                if (model.id !== 'custom') {
                                  setCustomModel('');
                                }
                              }}
                            >
                              <ListboxButton className="relative w-full cursor-pointer rounded-lg bg-background py-2 pl-3 pr-10 text-left text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent transform transition-transform duration-200 ease-in-out hover:scale-[1.01] hover:text-accent">
                                <span className="block truncate">
                                  {ttsModels.find(m => m.id === localTTSModel)?.name || 'Select Model'}
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
                                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                          active ? 'bg-accent/10 text-accent' : 'text-foreground'
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

                            {localTTSModel === 'custom' && (
                              <Input
                                type="text"
                                value={customModel}
                                onChange={(e) => setCustomModel(e.target.value)}
                                placeholder="Enter custom model name"
                                className="w-full rounded-lg bg-background py-2 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                              />
                            )}
                          </div>
                        </div>

                        {localTTSModel === 'gpt-4o-mini-tts' && (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-foreground">TTS Instructions</label>
                            <textarea
                              value={localTTSInstructions}
                              onChange={(e) => setLocalTTSInstructions(e.target.value)}
                              placeholder="Enter instructions for the TTS model"
                              className="w-full h-24 rounded-lg bg-background py-2 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                          </div>
                        )}

                        <div className="mt-6 flex justify-end gap-2">
                          <Button
                            type="button"
                            className="inline-flex justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                               font-medium text-foreground hover:bg-background/90 focus:outline-none 
                               focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                               transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent"
                            onClick={async () => {
                              setLocalApiKey('');
                              setLocalBaseUrl('');
                              setLocalTTSModel('tts-1');
                              setCustomModel('');
                              setLocalTTSInstructions('');
                            }}
                          >
                            Reset
                          </Button>
                          <Button
                            type="button"
                            className="inline-flex justify-center rounded-lg bg-accent px-3 py-1.5 text-sm 
                               font-medium text-white hover:bg-accent/90 focus:outline-none 
                               focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                               transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-background"
                            onClick={async () => {
                              await updateConfig({
                                apiKey: localApiKey || '',
                                baseUrl: localBaseUrl || '',
                              });
                              const finalModel = localTTSModel === 'custom' ? customModel : localTTSModel;
                              await updateConfigKey('ttsModel', finalModel);
                              await updateConfigKey('ttsInstructions', localTTSInstructions);
                              setIsOpen(false);
                            }}
                          >
                            Done
                          </Button>
                        </div>
                      </TabPanel>

                      <TabPanel className="space-y-4">
                        {isDev && <div className="space-y-2">
                          <label className="block text-sm font-medium text-foreground">Document Sync</label>
                          <div className="flex gap-2">
                            <Button
                              onClick={handleLoad}
                              disabled={isSyncing || isLoading}
                              className="justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                                       font-medium text-foreground hover:bg-background/90 focus:outline-none 
                                       focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                                       transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent
                                       disabled:opacity-50"
                            >
                              {isLoading ? 'Loading...' : 'Load docs from Server'}
                            </Button>
                            <Button
                              onClick={handleSync}
                              disabled={isSyncing || isLoading}
                              className="justify-center rounded-lg bg-background px-3 py-1.5 text-sm 
                                       font-medium text-foreground hover:bg-background/90 focus:outline-none 
                                       focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                                       transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent
                                       disabled:opacity-50"
                            >
                              {isSyncing ? 'Saving...' : 'Save local to Server'}
                            </Button>
                          </div>
                        </div>}

                        <div className="space-y-2 pb-3">
                          <label className="block text-sm font-medium text-foreground">Bulk Delete</label>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => setShowClearLocalConfirm(true)}
                              className="justify-center rounded-lg bg-red-600 px-3 py-1.5 text-sm 
                                       font-medium text-white hover:bg-red-700 focus:outline-none 
                                       focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2
                                       transform transition-transform duration-200 ease-in-out hover:scale-[1.04]"
                            >
                              Delete local docs
                            </Button>
                            {isDev && <Button
                              onClick={() => setShowClearServerConfirm(true)}
                              className="justify-center rounded-lg bg-red-600 px-3 py-1.5 text-sm 
                                       font-medium text-white hover:bg-red-700 focus:outline-none 
                                       focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2
                                       transform transition-transform duration-200 ease-in-out hover:scale-[1.04]"
                            >
                              Delete server docs
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
    </>
  );
}
