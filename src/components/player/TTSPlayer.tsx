'use client';

import { useTTS } from '@/contexts/TTSContext';
import { Button } from '@headlessui/react';
import {
  PlayIcon,
  PauseIcon,
  SkipForwardIcon,
  SkipBackwardIcon,
} from '@/components/icons/Icons';
import { LoadingSpinner } from '@/components/Spinner';
import { VoicesControl } from '@/components/player/VoicesControl';
import { SpeedControl } from '@/components/player/SpeedControl';
import { Navigator } from '@/components/player/Navigator';
import { ProviderType, VoiceProviderType } from '@/providers/types';
import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';

export default function TTSPlayer({ currentPage, numPages }: {
  currentPage?: number;
  numPages?: number | undefined;
}) {
  const {
    isPlaying,
    togglePlay,
    skipForward,
    skipBackward,
    isProcessing,
    setSpeedAndRestart,
    setVoiceAndRestart,
    availableVoices,
    voiceCategories,
    skipToLocation,
    provider,
    voiceProvider,
    setProviderAndRestart,
    setVoiceProviderAndRestart,
  } = useTTS();
  
  // Provider options
  const providerOptions = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'openrouter', name: 'OpenRouter' },
    { id: 'ollama', name: 'Ollama' },
  ];

  // Voice provider options
  const voiceProviderOptions = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'elevenlabs', name: 'ElevenLabs' },
  ];

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40 transition-opacity duration-300">
      <div className="bg-base dark:bg-base rounded-full shadow-lg px-3 sm:px-4 py-2 flex items-center space-x-2 sm:space-x-3 relative border border-offbase">
        {/* Speed control */}
        <SpeedControl setSpeedAndRestart={setSpeedAndRestart} />

        {/* Page Navigation */}
        {currentPage && numPages && (
          <Navigator 
            currentPage={currentPage} 
            numPages={numPages} 
            skipToLocation={skipToLocation}
          />
        )}

        {/* Playback Controls */}
        <div className="flex items-center space-x-2">
          <Button
            onClick={skipBackward}
            className="relative p-2 rounded-full text-foreground hover:bg-offbase data-[hover]:bg-offbase data-[active]:bg-offbase/80 transition-colors duration-200 focus:outline-none disabled:opacity-50"
            aria-label="Skip backward"
            disabled={isProcessing}
          >
            {isProcessing ? <LoadingSpinner /> : <SkipBackwardIcon />}
          </Button>

          <Button
            onClick={togglePlay}
            className="relative p-2 rounded-full text-foreground hover:bg-offbase data-[hover]:bg-offbase data-[active]:bg-offbase/80 transition-colors duration-200 focus:outline-none"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            disabled={isProcessing}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </Button>

          <Button
            onClick={skipForward}
            className="relative p-2 rounded-full text-foreground hover:bg-offbase data-[hover]:bg-offbase data-[active]:bg-offbase/80 transition-colors duration-200 focus:outline-none disabled:opacity-50"
            aria-label="Skip forward"
            disabled={isProcessing}
          >
            {isProcessing ? <LoadingSpinner /> : <SkipForwardIcon />}
          </Button>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-offbase/30 mx-0.5"></div>

        {/* Provider Controls */}
        <div className="flex items-center space-x-3">
          {/* TTS Provider */}
          <Menu as="div" className="relative inline-block text-left">
            <div>
              <Menu.Button className="flex items-center justify-between px-2 py-1 text-xs text-foreground hover:bg-offbase rounded border border-transparent hover:border-offbase/50 focus:outline-none">
                <span className="truncate">{providerOptions.find(p => p.id === provider)?.name || 'OpenAI'}</span>
              </Menu.Button>
            </div>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items 
                className="absolute right-0 bottom-full mb-1 z-50 w-40 origin-top-right rounded-md bg-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                style={{ marginBottom: '2.5rem' }}
              >
                {providerOptions.map((option) => (
                  <Menu.Item key={option.id}>
                    {({ active }) => (
                      <button
                        onClick={() => setProviderAndRestart(option.id as ProviderType)}
                        className={`${
                          active ? 'bg-offbase text-foreground' : 'text-foreground'
                        } ${
                          option.id === provider ? 'font-semibold' : ''
                        } block w-full text-left px-3 py-1.5 text-xs`}
                      >
                        {option.name}
                      </button>
                    )}
                  </Menu.Item>
                ))}
              </Menu.Items>
            </Transition>
          </Menu>

          {/* Voice Provider */}
          <Menu as="div" className="relative inline-block text-left">
            <div>
              <Menu.Button className="flex items-center justify-between px-2 py-1 text-xs text-foreground hover:bg-offbase rounded border border-transparent hover:border-offbase/50 focus:outline-none">
                <span className="truncate">{voiceProviderOptions.find(p => p.id === voiceProvider)?.name || 'OpenAI'}</span>
              </Menu.Button>
            </div>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items 
                className="absolute right-0 bottom-full mb-1 z-50 w-40 origin-top-right rounded-md bg-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                style={{ marginBottom: '2.5rem' }}
              >
                {voiceProviderOptions.map((option) => (
                  <Menu.Item key={option.id}>
                    {({ active }) => (
                      <button
                        onClick={() => setVoiceProviderAndRestart(option.id as VoiceProviderType)}
                        className={`${
                          active ? 'bg-offbase text-foreground' : 'text-foreground'
                        } ${
                          option.id === voiceProvider ? 'font-semibold' : ''
                        } block w-full text-left px-3 py-1.5 text-xs`}
                      >
                        {option.name}
                      </button>
                    )}
                  </Menu.Item>
                ))}
              </Menu.Items>
            </Transition>
          </Menu>

          {/* Voice selection */}
          <VoicesControl 
            availableVoices={availableVoices} 
            voiceCategories={voiceCategories}
            setVoiceAndRestart={setVoiceAndRestart}
            isLoading={isProcessing} 
          />
        </div>
      </div>
    </div>
  );
}
