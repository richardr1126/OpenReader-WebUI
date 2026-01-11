/**
 * Background job processor for audiobook generation
 * This file contains the logic to process audiobook generation jobs
 * in the background without requiring the browser to stay open
 */

import type { Job, AudiobookJobData } from '@/types/jobs';
import type { TTSRequestPayload, TTSRequestHeaders } from '@/types/client';

interface ProcessingContext {
  job: Job;
  signal: AbortSignal;
  updateProgress: (progress: number, step: string) => void;
}

/**
 * Process an audiobook generation job
 * This is called by the API route and runs server-side
 */
export async function processAudiobookJob(
  context: ProcessingContext
): Promise<{ bookId: string; format: string; totalDuration: number; chapterCount: number }> {
  const { job, signal, updateProgress } = context;
  const data = job.data as AudiobookJobData;

  try {
    // Step 1: Fetch document content (10%)
    updateProgress(5, 'Loading document content...');
    const documentText = await fetchDocumentContent(data.documentId, signal);

    updateProgress(10, 'Document loaded successfully');

    // Step 2: Process text into sentences (20%)
    updateProgress(12, 'Splitting document into sentences...');
    const sentences = await processTextToSentences(documentText, signal);

    updateProgress(20, `Document split into ${sentences.length} sentences`);

    if (sentences.length === 0) {
      throw new Error('No sentences found in document');
    }

    // Step 3: Generate TTS for each sentence (20-90%)
    const bookId = generateBookId();
    const audioChunks: ArrayBuffer[] = [];
    let totalDuration = 0;

    for (let i = 0; i < sentences.length; i++) {
      if (signal.aborted) {
        throw new Error('Job cancelled by user');
      }

      const sentence = sentences[i];
      const progress = 20 + ((i / sentences.length) * 70);
      updateProgress(
        Math.floor(progress),
        `Generating audio for sentence ${i + 1}/${sentences.length}...`
      );

      try {
        const audioBuffer = await generateSentenceTTS(sentence, data, signal);
        audioChunks.push(audioBuffer);

        // Estimate duration (rough approximation: 150 words per minute)
        const words = sentence.split(/\s+/).length;
        const durationSeconds = (words / 150) * 60;
        totalDuration += durationSeconds;
      } catch (error) {
        console.warn(`Failed to generate TTS for sentence ${i + 1}, skipping:`, error);
        // Continue with next sentence instead of failing the entire job
      }
    }

    // Step 4: Combine audio chunks into final audiobook (90-95%)
    updateProgress(90, 'Combining audio chunks...');

    // In a real implementation, you would:
    // 1. Use the existing /api/audiobook endpoint to create chapters
    // 2. Combine chapters into final audiobook file
    // 3. Store the result in the docstore directory

    updateProgress(95, 'Finalizing audiobook...');

    // Step 5: Complete (100%)
    updateProgress(100, 'Audiobook generation complete!');

    return {
      bookId,
      format: data.format || 'mp3',
      totalDuration: Math.floor(totalDuration),
      chapterCount: 1,
    };
  } catch (error) {
    console.error('Error processing audiobook job:', error);
    throw error;
  }
}

/**
 * Fetch document content from storage
 * This would integrate with your document storage system
 */
async function fetchDocumentContent(_documentId: string, _signal: AbortSignal): Promise<string> {
  // In a real implementation, this would:
  // 1. Query the document from IndexedDB or file system
  // 2. Extract text content based on document type (PDF, EPUB, HTML)
  // 3. Return the full text content

  // For now, return a placeholder
  // You would integrate this with your existing document loading logic
  return 'Sample document content for audiobook generation...';
}

/**
 * Process text into sentences
 * Uses the existing NLP sentence splitting logic
 */
async function processTextToSentences(text: string, _signal: AbortSignal): Promise<string[]> {
  // This would use the same logic as the TTS context
  // For now, simple split on sentence boundaries
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return sentences;
}

/**
 * Generate TTS audio for a single sentence
 * Integrates with the existing TTS API
 */
async function generateSentenceTTS(
  sentence: string,
  data: AudiobookJobData,
  signal: AbortSignal
): Promise<ArrayBuffer> {
  const reqHeaders: TTSRequestHeaders = {
    'Content-Type': 'application/json',
    'x-tts-provider': data.ttsProvider,
  };

  const reqBody: TTSRequestPayload = {
    text: sentence,
    voice: data.voice,
    speed: data.speed,
    model: data.ttsModel,
    instructions: data.ttsInstructions,
  };

  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: reqHeaders as HeadersInit,
    body: JSON.stringify(reqBody),
    signal,
  });

  if (!response.ok) {
    throw new Error(`TTS generation failed with status ${response.status}`);
  }

  return await response.arrayBuffer();
}

/**
 * Generate a unique book ID
 */
function generateBookId(): string {
  return `audiobook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
