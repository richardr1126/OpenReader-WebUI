import { test, expect } from '@playwright/test';
import { 
  preprocessSentenceForAudio, 
  splitTextToTtsBlocks, 
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

test.describe('splitTextToTtsBlocks', () => {
  test('groups short sentences into single block', () => {
    const input = 'First sentence. Second sentence.';
    const result = splitTextToTtsBlocks(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('First sentence. Second sentence.');
  });

  test('merges quoted dialogue (double quotes)', () => {
    const input = 'He said, "This should be one block." and walked away.';
    const result = splitTextToTtsBlocks(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('He said, "This should be one block." and walked away.');
  });
  
  test('merges quoted dialogue (curly quotes)', () => {
      const input = 'She replied, “This also should be merged.” then smiled.';
      const result = splitTextToTtsBlocks(input);
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
    const result = splitTextToTtsBlocks(input);
    
    expect(result.length).toBeGreaterThan(1);
    // The first block should contain as many as possible
    expect(result[0].length).toBeLessThanOrEqual(450);
  });

  test('splits a single oversized sentence into multiple blocks', () => {
    // Some PDF pages (e.g. research papers) can extract into one massive "sentence"
    // with few or no punctuation marks; we still must respect MAX_BLOCK_LENGTH.
    const input = Array(1200).fill('word').join(' '); // no punctuation
    const result = splitTextToTtsBlocks(input);
    expect(result.length).toBeGreaterThan(1);
    for (const block of result) {
      expect(block.length).toBeGreaterThan(0);
      expect(block.length).toBeLessThanOrEqual(450);
    }
  });

  test('splits extremely long unbroken tokens', () => {
    const input = 'A'.repeat(1200); // no spaces, no punctuation
    const result = splitTextToTtsBlocks(input);
    expect(result.length).toBeGreaterThan(1);
    for (const block of result) {
      expect(block.length).toBeGreaterThan(0);
      expect(block.length).toBeLessThanOrEqual(450);
    }
  });

  test('prefers sentence punctuation when chunking long PDF-like text', () => {
    const sentences = Array.from({ length: 80 }, (_, i) =>
      `Sentence ${i} has some filler words to keep the length varying slightly number ${i}.`
    );
    // Simulate a common PDF extraction artifact: no whitespace after '.' before the next sentence.
    const input = sentences.join('');
    const result = splitTextToTtsBlocks(input);
    expect(result.length).toBeGreaterThan(1);
    for (const block of result) {
      expect(block.length).toBeGreaterThan(0);
      expect(block.length).toBeLessThanOrEqual(450);
      expect(block.endsWith('.')).toBe(true);
    }
  });

  test('does not treat single newlines as paragraph boundaries', () => {
    // Many PDFs contain hard-wrapped lines; we should not break blocks/sentences
    // just because of a newline.
    const input =
      'The first line ends with a comma,\n' +
      'but the sentence continues on the next line and ends here.\n' +
      'And this is the second sentence.';
    const result = splitTextToTtsBlocks(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(
      'The first line ends with a comma, but the sentence continues on the next line and ends here. And this is the second sentence.'
    );
  });

  test('allows long sentences to reach their ending punctuation', () => {
    const longSentence =
      `${'word '.repeat(110)}` + // ~550 chars before period
      'end.' +
      ' Next.';
    const result = splitTextToTtsBlocks(longSentence);
    // The first block should end at a period, not be cut mid-sentence at a space boundary.
    expect(result.length).toBeGreaterThan(1);
    expect(result[0].endsWith('.')).toBe(true);
    expect(result[0].includes('end.')).toBe(true);
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
