// Add utility function to convert AudioBuffer to URL
export const audioBufferToURL = (audioBuffer: AudioBuffer): string => {
  // Get WAV file bytes
  const wavBytes = getWavBytes(audioBuffer.getChannelData(0), {
    isFloat: true,       // floating point or 16-bit integer
    numChannels: 1,      // number of channels
    sampleRate: audioBuffer.sampleRate,    // audio sample rate
  });

  // Create blob and URL
  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

// Add helper function for WAV conversion
export const getWavBytes = (samples: Float32Array, opts: {
  isFloat?: boolean,
  numChannels?: number,
  sampleRate?: number,
}) => {
  const {
    isFloat = true,
    numChannels = 1,
    sampleRate = 44100,
  } = opts;

  const bytesPerSample = isFloat ? 4 : 2;
  const numSamples = samples.length;

  // WAV header size is 44 bytes
  const buffer = new ArrayBuffer(44 + numSamples * bytesPerSample);
  const dv = new DataView(buffer);

  let pos = 0;

  // Write WAV header
  writeString(dv, pos, 'RIFF'); pos += 4;
  dv.setUint32(pos, 36 + numSamples * bytesPerSample, true); pos += 4;
  writeString(dv, pos, 'WAVE'); pos += 4;
  writeString(dv, pos, 'fmt '); pos += 4;
  dv.setUint32(pos, 16, true); pos += 4;
  dv.setUint16(pos, isFloat ? 3 : 1, true); pos += 2;
  dv.setUint16(pos, numChannels, true); pos += 2;
  dv.setUint32(pos, sampleRate, true); pos += 4;
  dv.setUint32(pos, sampleRate * numChannels * bytesPerSample, true); pos += 4;
  dv.setUint16(pos, numChannels * bytesPerSample, true); pos += 2;
  dv.setUint16(pos, bytesPerSample * 8, true); pos += 2;
  writeString(dv, pos, 'data'); pos += 4;
  dv.setUint32(pos, numSamples * bytesPerSample, true); pos += 4;

  if (isFloat) {
    for (let i = 0; i < numSamples; i++) {
      dv.setFloat32(pos, samples[i], true);
      pos += bytesPerSample;
    }
  } else {
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      dv.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      pos += bytesPerSample;
    }
  }

  return buffer;
};

export const writeString = (view: DataView, offset: number, string: string): void => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};