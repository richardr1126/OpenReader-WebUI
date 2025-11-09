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

export default function TTSPlayer({ currentPage, numPages }: {
  currentPage?: number;
  numPages?: number | undefined;
}) {
  const {
    isPlaying,
    togglePlay,
    skipForward,
    skipBackward,
    isProcessing,
    setSpeedAndRestart,
    setAudioPlayerSpeedAndRestart,
    setVoiceAndRestart,
    availableVoices,
    voiceApiFailed,
    skipToLocation,
  } = useTTS();

  return (
    <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-49 transition-opacity duration-300`}>
      <div className="bg-base dark:bg-base rounded-full shadow-lg px-3 sm:px-4 py-0.5 sm:py-1 flex items-center space-x-0.5 sm:space-x-1 relative scale-90 sm:scale-100 border border-offbase">
        {/* Speed control */}
        <SpeedControl 
          setSpeedAndRestart={setSpeedAndRestart} 
          setAudioPlayerSpeedAndRestart={setAudioPlayerSpeedAndRestart}
        />

        {/* Page Navigation */}
        {currentPage && numPages && (
          <Navigator 
            currentPage={currentPage} 
            numPages={numPages} 
            skipToLocation={skipToLocation}
          />
        )}

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
          disabled={isProcessing}
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
        <VoicesControl availableVoices={availableVoices} setVoiceAndRestart={setVoiceAndRestart} voiceApiFailed={voiceApiFailed} />
      </div>
    </div>
  );
}
