'use client';

import { useState } from 'react';
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { ChevronUpDownIcon } from '@/components/icons/Icons';
import { useConfig } from '@/contexts/ConfigContext';

export const VoicesControl = ({ availableVoices, setVoiceAndRestart, voiceApiFailed }: {
  availableVoices: string[];
  setVoiceAndRestart: (voice: string) => void;
  voiceApiFailed: boolean;
}) => {
  const { voice: configVoice } = useConfig();
  const [customVoice, setCustomVoice] = useState(configVoice);

  // Use configVoice as the source of truth
  const currentVoice = configVoice;

  // Show text input only if API failed
  if (voiceApiFailed) {
    return (
      <div className="relative">
        <input
          type="text"
          value={customVoice}
          onChange={(e) => setCustomVoice(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customVoice.trim()) {
              setVoiceAndRestart(customVoice.trim());
            }
          }}
          onBlur={() => {
            if (customVoice.trim() && customVoice !== configVoice) {
              setVoiceAndRestart(customVoice.trim());
            } else {
              setCustomVoice(configVoice);
            }
          }}
          placeholder="Enter voice"
          className="bg-transparent text-foreground text-xs sm:text-sm focus:outline-none border border-offbase focus:border-accent rounded px-1.5 sm:px-2 py-0.5 sm:py-1 w-24 sm:w-28"
          title="Voice API unavailable - enter custom voice"
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <Listbox value={currentVoice} onChange={setVoiceAndRestart}>
        <ListboxButton className="flex items-center space-x-0.5 sm:space-x-1 bg-transparent text-foreground text-xs sm:text-sm focus:outline-none cursor-pointer hover:bg-offbase rounded pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 py-0.5 sm:py-1">
          <span>{currentVoice}</span>
          <ChevronUpDownIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        </ListboxButton>
        <ListboxOptions anchor='top end' className="absolute z-50 w-28 sm:w-32 overflow-auto rounded-lg bg-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {availableVoices.map((voiceId) => (
            <ListboxOption
              key={voiceId}
              value={voiceId}
              className={({ active, selected }) =>
                `relative cursor-pointer select-none py-0.5 px-1.5 sm:py-2 sm:px-3 ${active ? 'bg-offbase' : ''} ${selected ? 'font-medium' : ''}`
              }
            >
              <span className='text-xs sm:text-sm'>{voiceId}</span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  );
}