import { test, expect } from '@playwright/test';
import { 
  preprocessSentenceForAudio, 
  splitIntoSentences, 
  processTextWithMapping 
} from '../../src/lib/nlp';

test.describe('preprocessSentenceForAudio', () => {
  test('removes URLs', () => {
    const input = 'Check out https://example.com/page for more info';
    const expected = 'Check out - (link to example.com) - for more info';
    expect(preprocessSentenceForAudio(input)).toBe(expected);
  });

  test('removes hyphenation', () => {
    const input = 'This is a hyp- henated word';
    const expected = 'This is a hyphenated word';
    expect(preprocessSentenceForAudio(input)).toBe(expected);
  });

  test('removes asterisks', () => {
    const input = 'This is *bold* text';
    const expected = 'This is bold text';
    expect(preprocessSentenceForAudio(input)).toBe(expected);
  });

  test('collapses whitespace', () => {
    const input = 'Multiple    spaces';
    const expected = 'Multiple spaces';
    expect(preprocessSentenceForAudio(input)).toBe(expected);
  });
});

test.describe('splitIntoSentences', () => {
  test('groups short sentences into single block', () => {
    const input = 'First sentence. Second sentence.';
    const result = splitIntoSentences(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('First sentence. Second sentence.');
  });

  test('merges quoted dialogue (double quotes)', () => {
    const input = 'He said, "This should be one block." and walked away.';
    const result = splitIntoSentences(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('He said, "This should be one block." and walked away.');
  });
  
  test('merges quoted dialogue (curly quotes)', () => {
      const input = 'She replied, “This also should be merged.” then smiled.';
      const result = splitIntoSentences(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('She replied, “This also should be merged.” then smiled.');
    });

  test('respects max block length for long text', () => {
    // MAX_BLOCK_LENGTH is 450 in nlp.ts
    // We construct distinct sentences. 
    // If we make sentences short enough individually but long enough combined, 
    // they should be grouped until the limit is reached.
    
    const sentence = 'A'.repeat(100) + '.'; // 101 chars
    // 4 sentences = 404 chars + 3 spaces = 407 chars (< 450). Should fit in one block.
    // 5 sentences = 505 chars + 4 spaces = 509 chars (> 450). Should split.
    
    const input = Array(5).fill(sentence).join(' ');
    const result = splitIntoSentences(input);
    
    expect(result.length).toBeGreaterThan(1);
    // The first block should contain as many as possible
    expect(result[0].length).toBeLessThanOrEqual(450);
  });
});

test.describe('processTextWithMapping', () => {
  test('maps raw sentences to processed ones', () => {
    const text = 'First (1). Second (2).';
    const { processedSentences, rawSentences, sentenceMapping } = processTextWithMapping(text);

    expect(processedSentences.length).toBeGreaterThan(0);
    expect(rawSentences.length).toBeGreaterThan(0);
    expect(sentenceMapping).toHaveLength(processedSentences.length);
    
    // Check structure of mapping
    expect(sentenceMapping[0]).toHaveProperty('processedIndex');
    expect(sentenceMapping[0]).toHaveProperty('rawIndices');
  });
});
