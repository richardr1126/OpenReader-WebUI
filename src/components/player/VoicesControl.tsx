'use client';

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { ChevronUpDownIcon, AudioWaveIcon } from '@/components/icons/Icons';
import { useConfig } from '@/contexts/ConfigContext';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { 
  parseKokoroVoiceNames, 
  buildKokoroVoiceString, 
  getMaxVoicesForProvider,
  isKokoroModel 
} from '@/utils/voice';

export const VoicesControl = ({ availableVoices, setVoiceAndRestart }: {
  availableVoices: string[];
  setVoiceAndRestart: (voice: string) => void;
}) => {
  const { voice: configVoice, ttsModel, ttsProvider } = useConfig();

  const isKokoro = isKokoroModel(ttsModel);
  const maxVoices = getMaxVoicesForProvider(ttsProvider, ttsModel || '');

  const clampToLimit = useCallback((names: string[]): string[] => {
    if (maxVoices === Infinity) return names;
    if (names.length <= maxVoices) return names;
    // For initial clamp, keep the first up to max allowed
    return names.slice(0, maxVoices);
  }, [maxVoices]);

  // Local selection state for Kokoro multi-select
  const [selectedVoices, setSelectedVoices] = useState<string[]>([]);

  useEffect(() => {
    if (!isKokoro) return;
    let initial: string[] = [];
    if (configVoice && configVoice.includes('+')) {
      initial = parseKokoroVoiceNames(configVoice);
    } else if (configVoice && availableVoices.includes(configVoice)) {
      initial = [configVoice];
    } else if (availableVoices.length > 0) {
      initial = [availableVoices[0]];
    }
    setSelectedVoices(clampToLimit(initial));
  }, [isKokoro, configVoice, availableVoices, maxVoices, clampToLimit]);

  // If the saved voice is not in the available list, use the first available voice (non-Kokoro)
  const currentVoice = useMemo(() => {
    if (isKokoro) {
      const combined = buildKokoroVoiceString(selectedVoices);
      return combined || (availableVoices[0] || '');
    }
    return (configVoice && availableVoices.includes(configVoice))
      ? configVoice
      : availableVoices[0] || '';
  }, [isKokoro, selectedVoices, availableVoices, configVoice]);

  return (
    <div className="relative">
      {isKokoro ? (
        <Listbox
          multiple
          value={selectedVoices}
          onChange={(vals: string[]) => {
            if (!vals || vals.length === 0) return; // prevent empty selection

            let next = vals;

            // Enforce deepinfra max selection of 2 voices
            if (maxVoices !== Infinity && vals.length > maxVoices) {
              // Determine the newly added voice
              const newlyAdded = vals.find(v => !selectedVoices.includes(v));
              if (newlyAdded) {
                const lastPrev = selectedVoices[selectedVoices.length - 1] ?? selectedVoices[0] ?? '';
                // Build next as [last previously selected, newly added], deduped, limited to max
                const pair = Array.from(new Set([lastPrev, newlyAdded])).filter(Boolean);
                next = pair.slice(0, maxVoices);
              } else {
                // Fallback: keep the last maxVoices options
                next = vals.slice(-maxVoices);
              }
            }

            setSelectedVoices(next);
            const combined = buildKokoroVoiceString(next);
            if (combined) {
              setVoiceAndRestart(combined);
            }
          }}
        >
          <ListboxButton className="flex items-center space-x-0.5 sm:space-x-1 bg-transparent text-foreground text-xs sm:text-sm focus:outline-none cursor-pointer hover:bg-offbase rounded pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 py-0.5 sm:py-1 transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent">
            <AudioWaveIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>
              {selectedVoices.length > 1
                ? selectedVoices.join(' + ')
                : selectedVoices[0] || currentVoice}
            </span>
            <ChevronUpDownIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </ListboxButton>
          <ListboxOptions anchor='top end' className="absolute z-50 w-40 sm:w-44 max-h-64 overflow-auto rounded-lg bg-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            {availableVoices.map((voiceId) => (
              <ListboxOption
                key={voiceId}
                value={voiceId}
                className={({ active, selected }) =>
                  `relative cursor-pointer select-none py-1 px-2 sm:py-2 sm:px-3 ${active ? 'bg-offbase' : ''} ${selected ? 'font-medium bg-accent text-background' : ''} ${selected && active ? 'text-foreground' : ''}`
                }
              >
                <span className='text-xs sm:text-sm'>{voiceId}</span>
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Listbox>
      ) : (
        <Listbox value={currentVoice} onChange={setVoiceAndRestart}>
          <ListboxButton className="flex items-center space-x-0.5 sm:space-x-1 bg-transparent text-foreground text-xs sm:text-sm focus:outline-none cursor-pointer hover:bg-offbase rounded pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 py-0.5 sm:py-1 transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent">
            <AudioWaveIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>{currentVoice}</span>
            <ChevronUpDownIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </ListboxButton>
          <ListboxOptions anchor='top end' className="absolute z-50 w-28 sm:w-32 max-h-64 overflow-auto rounded-lg bg-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            {availableVoices.map((voiceId) => (
              <ListboxOption
                key={voiceId}
                value={voiceId}
                className={({ active, selected }) =>
                  `relative cursor-pointer select-none py-1 px-2 sm:py-2 sm:px-3 ${active ? 'bg-offbase' : ''} ${selected ? 'font-medium bg-accent text-background' : ''} ${selected && active ? 'text-foreground' : ''}`
                }
              >
                <span className='text-xs sm:text-sm'>{voiceId}</span>
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Listbox>
      )}
    </div>
  );
}