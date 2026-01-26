'use client';

import { useConfig } from '@/contexts/ConfigContext';
import { useCallback } from 'react';
import { VoicesControlBase } from '@/components/player/VoicesControlBase';

export const VoicesControl = ({ availableVoices, setVoiceAndRestart }: {
  availableVoices: string[];
  setVoiceAndRestart: (voice: string) => void;
}) => {
  const { voice, ttsModel, ttsProvider } = useConfig();
  const onChangeVoice = useCallback((nextVoice: string) => setVoiceAndRestart(nextVoice), [setVoiceAndRestart]);

  return (
    <VoicesControlBase
      availableVoices={availableVoices}
      voice={voice || ''}
      onChangeVoice={onChangeVoice}
      ttsProvider={ttsProvider}
      ttsModel={ttsModel}
    />
  );
}
