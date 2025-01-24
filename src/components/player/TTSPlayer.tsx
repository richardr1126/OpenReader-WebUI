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

export default function TTSPlayer({ currentPage, numPages, onPageChange }: {
  currentPage: number;
  numPages: number | undefined;
  onPageChange: (page: number) => void;
}) {
  const {
    isPlaying,
    togglePlay,
    skipForward,
    skipBackward,
    isProcessing,
    speed,
    setSpeedAndRestart,
    voice,
    setVoiceAndRestart,
    availableVoices,
  } = useTTS();

  return (
    <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 transition-opacity duration-300`}>
      <div className="bg-base dark:bg-base rounded-full shadow-lg px-4 py-1 flex items-center space-x-1 relative">
        {/* Speed control */}
        <SpeedControl speed={speed} setSpeedAndRestart={setSpeedAndRestart} />

        {/* Page Navigation */}
        <Navigator currentPage={currentPage} numPages={numPages} onPageChange={onPageChange} />

        {/* Playback Controls */}
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

        {/* Voice control */}
        <VoicesControl voice={voice} availableVoices={availableVoices} setVoiceAndRestart={setVoiceAndRestart} />
      </div>
    </div>
  );
}
