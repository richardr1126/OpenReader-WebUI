'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { ChevronUpDownIcon } from '@/components/icons/Icons';
import { useConfig } from '@/contexts/ConfigContext';
import { Voice, VoiceCategory } from '@/providers/types';

interface VoicesControlProps {
  availableVoices: Voice[];
  voiceCategories: VoiceCategory[];
  setVoiceAndRestart: (voice: string) => void;
  isLoading?: boolean;
}

export const VoicesControl = ({ 
  availableVoices, 
  voiceCategories, 
  setVoiceAndRestart,
  isLoading = false
}: VoicesControlProps) => {
  const { voice: configVoice } = useConfig();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Get current voice name
  const currentVoice = useMemo(() => {
    const voice = availableVoices.find(v => v.id === configVoice);
    return voice?.name || configVoice;
  }, [availableVoices, configVoice]);

  // Filter voices based on search term
  const filteredVoices = useMemo(() => {
    if (!searchTerm) return availableVoices;
    return availableVoices.filter(voice => 
      voice.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      voice.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [availableVoices, searchTerm]);

  // Group voices by category
  const voicesByCategory = useMemo(() => {
    const grouped: Record<string, Voice[]> = {};
    
    // Initialize empty arrays for each category
    voiceCategories.forEach(category => {
      grouped[category.id] = [];
    });
    
    // Assign voices to categories
    filteredVoices.forEach(voice => {
      const categoryId = voice.categoryId || 'uncategorized';
      if (!grouped[categoryId]) {
        grouped[categoryId] = [];
      }
      grouped[categoryId].push(voice);
    });
    
    return grouped;
  }, [filteredVoices, voiceCategories]);
  
  // Reset search term when voices change
  useEffect(() => {
    setSearchTerm('');
  }, [availableVoices]);

  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <Menu.Button className="flex items-center justify-between w-full px-2 py-1 text-xs text-foreground hover:bg-offbase rounded border border-transparent hover:border-offbase/50 focus:outline-none">
          <span className="truncate mr-1">{isLoading ? "Loading voices..." : currentVoice}</span>
          <ChevronUpDownIcon className="h-3 w-3 text-foreground/70" />
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
          className="absolute right-0 bottom-full mb-1 z-50 mt-2 w-64 origin-top-right rounded-md bg-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none max-h-80 overflow-auto"
          style={{ marginBottom: '2.5rem' }}
        >
          <div className="sticky top-0 p-1 bg-base z-10 border-b border-offbase/20">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search voices..."
              onClick={(e) => e.stopPropagation()}
              className="w-full px-2 py-1 text-sm bg-offbase/30 hover:bg-offbase/50 focus:bg-offbase/70 rounded text-foreground focus:outline-none"
            />
          </div>
          
          {filteredVoices.length === 0 && (
            <div className="py-2 px-3 text-sm text-foreground/70">
              No voices match your search
            </div>
          )}
          
          {voiceCategories.map(category => {
            const categoryVoices = voicesByCategory[category.id] || [];
            if (categoryVoices.length === 0) return null;
            
            return (
              <div key={category.id} className="py-1">
                <div className="block px-3 py-1 text-xs font-semibold text-foreground/60">
                  {category.name}
                </div>
                
                {categoryVoices.map(voice => (
                  <Menu.Item key={voice.id}>
                    {({ active }) => (
                      <button
                        onClick={() => setVoiceAndRestart(voice.id)}
                        className={`${
                          active ? 'bg-offbase text-foreground' : 'text-foreground'
                        } ${
                          voice.id === configVoice ? 'font-semibold' : ''
                        } flex w-full items-center justify-between px-3 py-1 text-left text-xs`}
                      >
                        <span className="truncate">{voice.name}</span>
                        {voice.categoryId === 'elevenlabs-custom' && (
                          <span className="text-xs bg-accent text-white px-1 py-0.5 rounded-sm">
                            Custom
                          </span>
                        )}
                      </button>
                    )}
                  </Menu.Item>
                ))}
              </div>
            );
          })}
        </Menu.Items>
      </Transition>
    </Menu>
  );
};