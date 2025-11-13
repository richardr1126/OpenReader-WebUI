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
    
    // Merge multi-sentence dialogue enclosed in quotes into single items
    const mergedSentences = mergeQuotedDialogue(rawSentences);

    let currentBlock = '';

    for (const sentence of mergedSentences) {
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
// Helper functions to merge quoted dialogue across sentences
const countDoubleQuotes = (s: string): number => {
  const matches = s.match(/["“”]/g);
  return matches ? matches.length : 0;
};

const countCurlySingleQuotes = (s: string): number => {
  const matches = s.match(/[‘’]/g);
  return matches ? matches.length : 0;
};

const countStandaloneStraightSingles = (s: string): number => {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "'") {
      const prev = i > 0 ? s[i - 1] : '';
      const next = i + 1 < s.length ? s[i + 1] : '';
      const isPrevAlphaNum = /[A-Za-z0-9]/.test(prev);
      const isNextAlphaNum = /[A-Za-z0-9]/.test(next);
      // Count only when not clearly an apostrophe inside a word (e.g., don't)
      if (!(isPrevAlphaNum && isNextAlphaNum)) {
        count++;
      }
    }
  }
  return count;
};

const mergeQuotedDialogue = (rawSentences: string[]): string[] => {
  const result: string[] = [];
  let buffer = '';
  let insideDouble = false;
  let insideSingle = false;

  for (const s of rawSentences) {
    const t = s.trim();
    const dblCount = countDoubleQuotes(t);
    const singleCount = countCurlySingleQuotes(t) + countStandaloneStraightSingles(t);

    if (insideDouble || insideSingle) {
      buffer = buffer ? `${buffer} ${t}` : t;
    } else {
      // Start buffering if this sentence opens an unclosed quote
      if ((dblCount % 2 === 1) || (singleCount % 2 === 1)) {
        buffer = t;
      } else {
        result.push(t);
      }
    }

    // Toggle quote states after processing this sentence
    if (dblCount % 2 === 1) insideDouble = !insideDouble;
    if (singleCount % 2 === 1) insideSingle = !insideSingle;

    // If all open quotes are closed, flush buffer
    if (!(insideDouble || insideSingle) && buffer) {
      result.push(buffer);
      buffer = '';
    }
  }

  if (buffer) {
    result.push(buffer);
  }

  return result;
};