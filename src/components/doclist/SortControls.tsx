import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Button } from '@headlessui/react';
import { ChevronUpDownIcon } from '@/components/icons/Icons';
import { SortBy, SortDirection } from '@/types/documents';

interface SortControlsProps {
  sortBy: SortBy;
  sortDirection: SortDirection;
  onSortByChange: (value: SortBy) => void;
  onSortDirectionChange: () => void;
}

export function SortControls({
  sortBy,
  sortDirection,
  onSortByChange,
  onSortDirectionChange,
}: SortControlsProps) {
  const sortOptions: Array<{ value: SortBy; label: string, up: string, down: string }> = [
    { value: 'name', label: 'Name', up: 'A-Z', down: 'Z-A' },
    { value: 'type', label: 'Type', up: 'A-Z', down: 'Z-A' },
    { value: 'date', label: 'Date', up: 'Newest', down: 'Oldest' },
    { value: 'size', label: 'Size' , up: 'Smallest', down: 'Largest' },
  ];

  const currentSort = sortOptions.find(opt => opt.value === sortBy);
  const directionLabel = sortDirection === 'asc' ? currentSort?.up : currentSort?.down;

  return (
    <div className="flex items-center gap-1">
      <Button
        onClick={onSortDirectionChange}
        className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-base hover:bg-offbase rounded text-xs sm:text-sm whitespace-nowrap transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent"
      >
        {directionLabel}
      </Button>
      <div className="relative">
        <Listbox value={sortBy} onChange={onSortByChange}>
          <ListboxButton className="flex items-center space-x-0.5 sm:space-x-1 bg-background text-foreground text-xs sm:text-sm focus:outline-none cursor-pointer hover:bg-offbase rounded pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 py-0.5 sm:py-1 transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent">
            <span>{sortOptions.find(opt => opt.value === sortBy)?.label}</span>
            <ChevronUpDownIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          </ListboxButton>
          <ListboxOptions anchor="top end" className="absolute z-50 w-28 sm:w-32 overflow-auto rounded-lg bg-background shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            {sortOptions.map((option) => (
              <ListboxOption
                key={option.value}
                value={option.value}
                className={({ active, selected }) =>
                  `relative cursor-pointer select-none py-0.5 px-1.5 sm:py-2 sm:px-3 ${active ? 'bg-offbase' : ''} ${selected ? 'font-medium' : ''}`
                }
              >
                <span className="text-xs sm:text-sm">{option.label}</span>
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Listbox>
      </div>
    </div>
  );
}