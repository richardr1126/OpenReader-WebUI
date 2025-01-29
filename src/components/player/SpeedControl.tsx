'use client';

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { ChevronUpDownIcon } from '@/components/icons/Icons';
import { useConfig } from '@/contexts/ConfigContext';

const speedOptions = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: '1x' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 1.75, label: '1.75x' },
  { value: 2, label: '2x' },
  { value: 2.5, label: '2.5x' },
  { value: 3, label: '3x' },
];

export const SpeedControl = ({ setSpeedAndRestart }: {
  setSpeedAndRestart: (speed: number) => void;
}) => {
  const { voiceSpeed } = useConfig();

  // Use voiceSpeed as the source of truth
  const currentSpeed = voiceSpeed;

  return (
    <div className="relative">
      <Listbox value={currentSpeed} onChange={setSpeedAndRestart}>
        <ListboxButton className="flex items-center space-x-0.5 sm:space-x-1 bg-transparent text-foreground text-xs sm:text-sm focus:outline-none cursor-pointer hover:bg-offbase rounded pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 py-0.5 sm:py-1">
          <span>{currentSpeed}x</span>
          <ChevronUpDownIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        </ListboxButton>
        <ListboxOptions anchor='top start' className="absolute z-50 w-20 sm:w-24 overflow-auto rounded-lg bg-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {speedOptions.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className={({ active, selected }) =>
                `relative cursor-pointer select-none py-0.5 px-1.5 sm:py-2 sm:px-3 ${active ? 'bg-offbase' : ''} ${selected ? 'font-medium' : ''}`
              }
            >
              <span className='text-xs sm:text-sm'>{option.label}</span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  );
}