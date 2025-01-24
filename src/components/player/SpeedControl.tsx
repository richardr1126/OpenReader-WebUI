import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { ChevronUpDownIcon } from '@/components/icons/Icons';

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

export const SpeedControl = ({ speed, setSpeedAndRestart }: {
  speed: number;
  setSpeedAndRestart: (speed: number) => void;
}) => {
  return (
    <div className="relative">
      <Listbox value={speed} onChange={setSpeedAndRestart}>
        <ListboxButton className="flex items-center space-x-1 bg-transparent text-foreground text-sm focus:outline-none cursor-pointer hover:bg-offbase rounded pl-2 pr-1 py-1">
          <span>{speed}x</span>
          <ChevronUpDownIcon className="h-3 w-3" />
        </ListboxButton>
        <ListboxOptions className="absolute bottom-full mb-1 w-24 overflow-auto rounded-lg bg-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {speedOptions.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className={({ active, selected }) =>
                `relative cursor-pointer select-none py-2 px-3 ${active ? 'bg-offbase' : ''
                } ${selected ? 'font-medium' : ''}`
              }
            >
              {option.label}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  );
}