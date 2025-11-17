'use client';

import { Input, Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { ChevronUpDownIcon, SpeedometerIcon } from '@/components/icons/Icons';
import { useConfig } from '@/contexts/ConfigContext';
import { useCallback, useEffect, useState } from 'react';

export const SpeedControl = ({ 
  setSpeedAndRestart, 
  setAudioPlayerSpeedAndRestart 
}: {
  setSpeedAndRestart: (speed: number) => void;
  setAudioPlayerSpeedAndRestart: (speed: number) => void;
}) => {
  const { voiceSpeed, audioPlayerSpeed } = useConfig();
  const [localVoiceSpeed, setLocalVoiceSpeed] = useState(voiceSpeed);
  const [localAudioSpeed, setLocalAudioSpeed] = useState(audioPlayerSpeed);

  // Sync local speeds with global state
  useEffect(() => {
    setLocalVoiceSpeed(voiceSpeed);
  }, [voiceSpeed]);

  useEffect(() => {
    setLocalAudioSpeed(audioPlayerSpeed);
  }, [audioPlayerSpeed]);

  // Handler for voice speed slider change (updates local state only)
  const handleVoiceSpeedChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVoiceSpeed(parseFloat(event.target.value));
  }, []);

  // Handler for audio player speed slider change (updates local state only)
  const handleAudioSpeedChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalAudioSpeed(parseFloat(event.target.value));
  }, []);

  // Handler for voice speed slider release
  const handleVoiceSpeedChangeComplete = useCallback(() => {
    if (localVoiceSpeed !== voiceSpeed) {
      setSpeedAndRestart(localVoiceSpeed);
    }
  }, [localVoiceSpeed, voiceSpeed, setSpeedAndRestart]);

  // Handler for audio player speed slider release
  const handleAudioSpeedChangeComplete = useCallback(() => {
    if (localAudioSpeed !== audioPlayerSpeed) {
      setAudioPlayerSpeedAndRestart(localAudioSpeed);
    }
  }, [localAudioSpeed, audioPlayerSpeed, setAudioPlayerSpeedAndRestart]);

  // Display the currently active speed (prioritize audio player speed if different from 1.0)
  const displaySpeed = localAudioSpeed !== 1.0 ? localAudioSpeed : localVoiceSpeed;

  return (
    <Popover className="relative">
      <PopoverButton className="flex items-center space-x-0.5 sm:space-x-1 bg-transparent text-foreground text-xs sm:text-sm focus:outline-none cursor-pointer hover:bg-offbase rounded pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 py-0.5 sm:py-1 transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent">
        <SpeedometerIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        <span>{Number.isInteger(displaySpeed) ? displaySpeed.toString() : displaySpeed.toFixed(1)}x</span>
        <ChevronUpDownIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
      </PopoverButton>
      <PopoverPanel anchor="top" className="absolute z-50 bg-base p-3 rounded-md shadow-lg border border-offbase">
        <div className="flex flex-col space-y-4">
          {/* Native Model Speed */}
          <div className="flex flex-col space-y-2">
            <div className="text-xs font-medium text-foreground">Native model speed</div>
            <div className="flex justify-between">
              <span className="text-xs">0.5x</span>
              <span className="text-xs font-bold">{Number.isInteger(localVoiceSpeed) ? localVoiceSpeed.toString() : localVoiceSpeed.toFixed(1)}x</span>
              <span className="text-xs">3x</span>
            </div>
            <Input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={localVoiceSpeed}
              onChange={handleVoiceSpeedChange}
              onMouseUp={handleVoiceSpeedChangeComplete}
              onKeyUp={handleVoiceSpeedChangeComplete}
              onTouchEnd={handleVoiceSpeedChangeComplete}
              className="w-full bg-offbase rounded-lg appearance-none cursor-pointer accent-accent [&::-webkit-slider-runnable-track]:bg-offbase [&::-webkit-slider-runnable-track]:rounded-lg [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-moz-range-track]:bg-offbase [&::-moz-range-track]:rounded-lg [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent"
            />
          </div>

          {/* Audio Player Speed */}
          <div className="flex flex-col space-y-2">
            <div className="text-xs font-medium text-foreground">Audio player speed</div>
            <div className="flex justify-between">
              <span className="text-xs">0.5x</span>
              <span className="text-xs font-bold">{Number.isInteger(localAudioSpeed) ? localAudioSpeed.toString() : localAudioSpeed.toFixed(1)}x</span>
              <span className="text-xs">3x</span>
            </div>
            <Input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={localAudioSpeed}
              onChange={handleAudioSpeedChange}
              onMouseUp={handleAudioSpeedChangeComplete}
              onKeyUp={handleAudioSpeedChangeComplete}
              onTouchEnd={handleAudioSpeedChangeComplete}
              className="w-full bg-offbase rounded-lg appearance-none cursor-pointer accent-accent [&::-webkit-slider-runnable-track]:bg-offbase [&::-webkit-slider-runnable-track]:rounded-lg [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-moz-range-track]:bg-offbase [&::-moz-range-track]:rounded-lg [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-accent"
            />
          </div>
        </div>
      </PopoverPanel>
    </Popover>
  );
};