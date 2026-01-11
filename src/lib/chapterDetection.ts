/**
 * Utility functions for detecting and splitting text into chapters
 */

export interface Chapter {
  title: string;
  startIndex: number;
  endIndex: number;
  text: string;
}

/**
 * Detects chapters in text content
 * Looks for common chapter markers like "Chapter 1", "CHAPTER I", etc.
 */
export function detectChapters(text: string, maxChunkSize = 50000): Chapter[] {
  const lines = text.split('\n');
  const chapters: Chapter[] = [];

  // Common chapter markers
  const chapterPatterns = [
    /^chapter\s+(\d+|[ivxlcdm]+)/i,
    /^ch\.\s+(\d+)/i,
    /^(\d+)\.\s+/,  // "1. Title"
    /^part\s+(\d+|[ivxlcdm]+)/i,
    /^section\s+(\d+)/i,
  ];

  let currentChapterStart = 0;
  let currentChapterTitle = 'Beginning';

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Check if this line is a chapter marker
    const isChapterMarker = chapterPatterns.some(pattern => pattern.test(trimmed));

    if (isChapterMarker) {
      if (index === 0) {
        // First line is a chapter marker - use it as title and start content from next line
        currentChapterTitle = trimmed || 'Chapter 1';
        currentChapterStart = 1;
      } else {
        // Save the previous chapter
        const chapterText = lines.slice(currentChapterStart, index).join('\n');
        if (chapterText.trim().length > 0) {
          chapters.push({
            title: currentChapterTitle,
            startIndex: currentChapterStart,
            endIndex: index,
            text: chapterText,
          });
        }

        // Start new chapter (skip the marker line itself)
        currentChapterStart = index + 1;
        currentChapterTitle = trimmed || `Chapter ${chapters.length + 1}`;
      }
    }
  });

  // Add the final chapter
  const finalChapterText = lines.slice(currentChapterStart).join('\n');
  if (finalChapterText.trim().length > 0) {
    chapters.push({
      title: currentChapterTitle,
      startIndex: currentChapterStart,
      endIndex: lines.length,
      text: finalChapterText,
    });
  }

  // If no chapters were detected, split by size
  if (chapters.length === 0 || (chapters.length === 1 && text.length > maxChunkSize)) {
    return splitBySize(text, maxChunkSize);
  }

  // If chapters are still too large, split them further
  const refinedChapters: Chapter[] = [];
  chapters.forEach(chapter => {
    if (chapter.text.length > maxChunkSize) {
      const subChapters = splitBySize(chapter.text, maxChunkSize);
      subChapters.forEach((subChapter, i) => {
        refinedChapters.push({
          ...subChapter,
          title: `${chapter.title} (Part ${i + 1})`,
        });
      });
    } else {
      refinedChapters.push(chapter);
    }
  });

  return refinedChapters.length > 0 ? refinedChapters : chapters;
}

/**
 * Splits text into chunks of approximately equal size
 * Tries to split at paragraph boundaries
 */
function splitBySize(text: string, maxChunkSize: number): Chapter[] {
  const chapters: Chapter[] = [];
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = '';
  let chunkIndex = 0;

  paragraphs.forEach((paragraph) => {
    const potentialChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraph;

    if (potentialChunk.length > maxChunkSize && currentChunk.length > 0) {
      // Save current chunk
      chapters.push({
        title: `Section ${chunkIndex + 1}`,
        startIndex: 0, // We'll recalculate these if needed
        endIndex: 0,
        text: currentChunk,
      });

      // Start new chunk
      currentChunk = paragraph;
      chunkIndex++;
    } else {
      currentChunk = potentialChunk;
    }
  });

  // Add the final chunk
  if (currentChunk.trim().length > 0) {
    chapters.push({
      title: `Section ${chunkIndex + 1}`,
      startIndex: 0,
      endIndex: 0,
      text: currentChunk,
    });
  }

  return chapters;
}

/**
 * Estimate the number of chapters that would be created
 * Useful for showing chapter count before processing
 */
export function estimateChapterCount(text: string, maxChunkSize = 50000): number {
  const chapters = detectChapters(text, maxChunkSize);
  return chapters.length;
}
