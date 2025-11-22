import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Button } from '@headlessui/react';
import { ChevronUpDownIcon, ListIcon, GridIcon } from '@/components/icons/Icons';
import { SortBy, SortDirection } from '@/types/documents';

interface SortControlsProps {
  sortBy: SortBy;
  sortDirection: SortDirection;
  onSortByChange: (value: SortBy) => void;
  onSortDirectionChange: () => void;
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
}

export function SortControls({
  sortBy,
  sortDirection,
  onSortByChange,
  onSortDirectionChange,
  viewMode,
  onViewModeChange,
}: SortControlsProps) {
  const sortOptions: Array<{ value: SortBy; label: string, up: string, down: string }> = [
    { value: 'name', label: 'Name', up: 'A-Z', down: 'Z-A' },
    { value: 'type', label: 'Type', up: 'A-Z', down: 'Z-A' },
    { value: 'date', label: 'Date', up: 'Newest', down: 'Oldest' },
    { value: 'size', label: 'Size' , up: 'Smallest', down: 'Largest' },
  ];

  const currentSort = sortOptions.find(opt => opt.value === sortBy);
  const directionLabel = sortDirection === 'asc' ? currentSort?.up : currentSort?.down;

  const buttonBaseClass = "h-6 flex items-center justify-center bg-base hover:bg-offbase rounded border border-transparent hover:border-offbase text-xs sm:text-sm transition-all duration-200 ease-in-out hover:scale-[1.04] hover:text-accent";
  const activeIconClass = "text-accent";
  const inactiveIconClass = "text-muted";

  return (
    <div className="flex items-center gap-1">
      <div className="hidden xs:flex items-center bg-base rounded p-[1px] gap-0.5 border border-transparent">
        <Button
          onClick={() => onViewModeChange('list')}
          className={`p-0.5 rounded hover:bg-offbase transition-all hover:scale-[1.07] ${viewMode === 'list' ? activeIconClass : inactiveIconClass}`}
          aria-label="List view"
        >
          <ListIcon className="w-4 h-4" />
        </Button>
        <Button
          onClick={() => onViewModeChange('grid')}
          className={`p-0.5 rounded hover:bg-offbase transition-all hover:scale-[1.07] ${viewMode === 'grid' ? activeIconClass : inactiveIconClass}`}
          aria-label="Grid view"
        >
          <GridIcon className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="hidden xs:block h-4 w-px bg-offbase mx-1" />

      <div className="flex items-center gap-1">
        <Button
          onClick={onSortDirectionChange}
          className={`${buttonBaseClass} px-2 text-xs`}
        >
          {directionLabel}
        </Button>
        <div className="relative">
          <Listbox value={sortBy} onChange={onSortByChange}>
            <ListboxButton className={`${buttonBaseClass} pl-2 pr-1 gap-1 min-w-[80px] justify-between focus:outline-none focus:ring-accent focus:ring-2`}>
              <span>{sortOptions.find(opt => opt.value === sortBy)?.label}</span>
              <ChevronUpDownIcon className="h-3 w-3 opacity-50" />
            </ListboxButton>
            <ListboxOptions anchor="top end" className="absolute z-50 w-32 overflow-auto rounded-lg bg-background shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none p-1">
              {sortOptions.map((option) => (
                <ListboxOption
                  key={option.value}
                  value={option.value}
                  className={({ active, selected }) =>
                    `relative cursor-pointer select-none py-1.5 px-2 rounded text-xs ${active ? 'bg-offbase text-accent' : 'text-foreground'} ${selected ? 'font-medium' : ''}`
                  }
                >
                  {option.label}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Listbox>
        </div>
      </div>
    </div>
  );
}