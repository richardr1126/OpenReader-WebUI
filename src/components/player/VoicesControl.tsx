import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { ChevronUpDownIcon } from '@/components/icons/Icons';

export const VoicesControl = ({ voice, availableVoices, setVoiceAndRestart }: {
  voice: string;
  availableVoices: string[];
  setVoiceAndRestart: (voice: string) => void;
}) => {
  return (
    <div className="relative">
      <Listbox value={voice} onChange={setVoiceAndRestart}>
        <ListboxButton className="flex items-center space-x-1 bg-transparent text-foreground text-sm focus:outline-none cursor-pointer hover:bg-offbase rounded pl-2 pr-1 py-1">
          <span>{voice}</span>
          <ChevronUpDownIcon className="h-3 w-3" />
        </ListboxButton>
        <ListboxOptions className="absolute bottom-full mb-1 w-32 overflow-auto rounded-lg bg-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {availableVoices.map((voiceId) => (
            <ListboxOption
              key={voiceId}
              value={voiceId}
              className={({ active, selected }) =>
                `relative cursor-pointer select-none py-2 px-3 ${active ? 'bg-offbase' : ''} ${selected ? 'font-medium' : ''}`
              }
            >
              <span>{voiceId}</span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  );
}