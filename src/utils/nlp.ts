/**
 * Natural Language Processing Utilities
 * 
 * This module provides consistent sentence processing functionality across the application.
 * It handles text preprocessing, sentence splitting, and block creation for optimal TTS processing.
 */

import nlp from 'compromise';

const MAX_BLOCK_LENGTH = 300;

/**
 * Preprocesses text for audio generation by cleaning up various text artifacts
 * 
 * @param {string} text - The text to preprocess
 * @returns {string} The cleaned text
 */
export const preprocessSentenceForAudio = (text: string): string => {
  return text
    .replace(/\S*(?:https?:\/\/|www\.)([^\/\s]+)(?:\/\S*)?/gi, '- (link to $1) -')
    .replace(/(\w+)-\s+(\w+)/g, '$1$2') // Remove hyphenation
    // Remove special character *
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Splits text into sentences and groups them into blocks suitable for TTS processing
 * 
 * @param {string} text - The text to split into sentences
 * @returns {string[]} Array of sentence blocks
 */
export const splitIntoSentences = (text: string): string[] => {
  const paragraphs = text.split(/\n+/);
  const blocks: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;

    const cleanedText = preprocessSentenceForAudio(paragraph);
    const doc = nlp(cleanedText);
    const rawSentences = doc.sentences().out('array') as string[];
    
    let currentBlock = '';

    for (const sentence of rawSentences) {
      const trimmedSentence = sentence.trim();
      
      if (currentBlock && (currentBlock.length + trimmedSentence.length + 1) > MAX_BLOCK_LENGTH) {
        blocks.push(currentBlock.trim());
        currentBlock = trimmedSentence;
      } else {
        currentBlock = currentBlock 
          ? `${currentBlock} ${trimmedSentence}`
          : trimmedSentence;
      }
    }

    if (currentBlock) {
      blocks.push(currentBlock.trim());
    }
  }
  
  return blocks;
};

/**
 * Main sentence processing function that handles both short and long texts
 * 
 * @param {string} text - The text to process
 * @returns {string[]} Array of processed sentences/blocks
 */
export const processTextToSentences = (text: string): string[] => {
  if (!text || text.length < 1) {
    return [];
  }

  if (text.length <= MAX_BLOCK_LENGTH) {
    // Single sentence preprocessing
    const cleanedText = preprocessSentenceForAudio(text);
    return [cleanedText];
  }

  // Full text splitting into sentences
  return splitIntoSentences(text);
};

/**
 * Gets raw sentences from text without preprocessing or grouping
 * This is useful for text matching and highlighting
 * 
 * @param {string} text - The text to extract sentences from
 * @returns {string[]} Array of raw sentences
 */
export const getRawSentences = (text: string): string[] => {
  if (!text || text.length < 1) {
    return [];
  }
  
  return nlp(text).sentences().out('array') as string[];
};

/**
 * Enhanced sentence processing that returns both processed sentences and raw sentences
 * This allows for better mapping between the two for click-to-highlight functionality
 * 
 * @param {string} text - The text to process
 * @returns {Object} Object containing processed sentences and raw sentences with mapping
 */
export const processTextWithMapping = (text: string): {
  processedSentences: string[];
  rawSentences: string[];
  sentenceMapping: Array<{ processedIndex: number; rawIndices: number[] }>;
} => {
  const rawSentences = getRawSentences(text);
  const processedSentences = processTextToSentences(text);
  
  // Create a mapping between processed sentences and raw sentences
  const sentenceMapping: Array<{ processedIndex: number; rawIndices: number[] }> = [];
  
  // For simple mapping, we'll track which raw sentences contributed to each processed sentence
  let rawIndex = 0;
  
  for (let processedIndex = 0; processedIndex < processedSentences.length; processedIndex++) {
    const processedSentence = processedSentences[processedIndex];
    const rawIndices: number[] = [];
    
    // Find which raw sentences are contained in this processed sentence
    const remainingText = processedSentence;
    
    while (rawIndex < rawSentences.length && remainingText.length > 0) {
      const rawSentence = rawSentences[rawIndex];
      const cleanedRawSentence = preprocessSentenceForAudio(rawSentence);
      
      if (remainingText.includes(cleanedRawSentence) || cleanedRawSentence.includes(remainingText)) {
        rawIndices.push(rawIndex);
        rawIndex++;
        break;
      } else {
        rawIndex++;
      }
    }
    
    sentenceMapping.push({ processedIndex, rawIndices });
  }
  
  return {
    processedSentences,
    rawSentences,
    sentenceMapping
  };
}; 