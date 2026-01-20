import { test, expect } from '@playwright/test';
import { escapeFFMetadata } from '../../src/lib/server/audiobook';

test.describe('escapeFFMetadata', () => {
  test('escapes special characters correctly', () => {
    const input = 'Title with = ; # and backslash \\';
    // Expected: Equal -> \=, Semicolon -> \;, Hash -> \#, Backslash -> \\
    const expected = 'Title with \\= \\; \\# and backslash \\\\';
    expect(escapeFFMetadata(input)).toBe(expected);
  });

  test('normalizes newlines to spaces', () => {
    const input = 'Title with\nnewline and\rreturn';
    const expected = 'Title with newline and return';
    expect(escapeFFMetadata(input)).toBe(expected);
  });

  test('handles mixed special characters and newlines', () => {
    const input = 'Line1\nLine2=Value;Comment#';
    const expected = 'Line1 Line2\\=Value\\;Comment\\#';
    expect(escapeFFMetadata(input)).toBe(expected);
  });

  test('returns empty string as-is', () => {
    expect(escapeFFMetadata('')).toBe('');
  });

  test('returns safe string as-is', () => {
    const input = 'Safe Title 123';
    expect(escapeFFMetadata(input)).toBe(input);
  });
});
