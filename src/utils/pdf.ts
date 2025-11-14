import { pdfjs } from 'react-pdf';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { type PDFDocumentProxy, TextLayer } from 'pdfjs-dist';
import "core-js/proposals/promise-with-resolvers";
import { processTextToSentences } from '@/utils/nlp';
import { CmpStr } from 'cmpstr';

const cmp = CmpStr.create().setMetric( 'levenshtein' ).setFlags( 'i' );

// Function to detect if we need to use legacy build
function shouldUseLegacyBuild() {
  try {
    if (typeof window === 'undefined') return false;
    
    const ua = window.navigator.userAgent;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    
    console.log(isSafari ? 'Running on Safari' : 'Not running on Safari');
    if (!isSafari) return false;
    
    // Extract Safari version - matches "Version/18" format
    const match = ua.match(/Version\/(\d+)/i);
    console.log('Safari version:', match);
    if (!match || !match[1]) return true; // If we can't determine version, use legacy to be safe
    
    const version = parseInt(match[1]);
    return version < 18; // Use legacy build for Safari versions equal or below 18
  } catch (e) {
    console.error('Error detecting Safari version:', e);
    return false;
  }
}

// Function to initialize PDF worker
function initPDFWorker() {
  try {
    if (typeof window !== 'undefined') {
      const useLegacy = shouldUseLegacyBuild();
      // Use local worker file instead of unpkg
      const workerSrc = useLegacy 
        ? new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href
        : new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
      console.log('Setting PDF worker to:', workerSrc);
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      pdfjs.GlobalWorkerOptions.workerPort = null;
    }
  } catch (e) {
    console.error('Error setting PDF worker:', e);
  }
}

// Initialize the worker
initPDFWorker();

// Patch TextLayer.render to treat cancelled renders as non-errors
try {
  const textLayerProto = TextLayer?.prototype;
  const originalRender = textLayerProto?.render;
  if (typeof originalRender === 'function') {
    textLayerProto.render = async function patchedRender(...args) {
      const task = originalRender.apply(this, args);
      if (!task || typeof task.then !== 'function') return task;
      return task.catch((error) => {
        if (error && (error.name === 'AbortException' || error.name === 'RenderingCancelledException')) {
          return;
        }
        throw error;
      });
    };
  }
} catch (e) {
  console.error('Error patching TextLayer.render:', e);
}

interface TextMatch {
  elements: HTMLElement[];
  rating: number;
  text: string;
  lengthDiff: number;
}

// Text Processing functions
export async function extractTextFromPDF(
  pdf: PDFDocumentProxy, 
  pageNumber: number, 
  margins = { header: 0.07, footer: 0.07, left: 0.07, right: 0.07 }
): Promise<string> {
  try {
    // Log pdf worker version
    //console.log('PDF worker version:', pdfjs.GlobalWorkerOptions.workerSrc);

    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;
    const pageWidth = viewport.width;

    const textItems = textContent.items.filter((item): item is TextItem => {
      if (!('str' in item && 'transform' in item)) return false;
      
      const [scaleX, skewX, skewY, scaleY, x, y] = item.transform;
      
      // Basic text filtering
      if (Math.abs(scaleX) < 1 || Math.abs(scaleX) > 20) return false;
      if (Math.abs(scaleY) < 1 || Math.abs(scaleY) > 20) return false;
      if (Math.abs(skewX) > 0.5 || Math.abs(skewY) > 0.5) return false;
      
      // Calculate margins in PDF coordinate space (y=0 is at bottom)
      const headerY = pageHeight * (1 - margins.header); // Convert from top margin to bottom-based Y
      const footerY = pageHeight * margins.footer; // Footer Y stays as is since it's already bottom-based
      const leftX = pageWidth * margins.left;
      const rightX = pageWidth * (1 - margins.right);
      
      // Check margins - remember y=0 is at bottom of page in PDF coordinates
      if (y > headerY || y < footerY) { // Y greater than headerY means it's in header area, less than footerY means footer area
        return false;
      }

      // Check horizontal margins
      if (x < leftX || x > rightX) {
        return false;
      }
      
      // Sanity check for coordinates
      if (x < 0 || x > pageWidth) return false;
      
      return item.str.trim().length > 0;
    });

    //console.log('Filtered text items:', textItems);

    const tolerance = 2;
    const lines: TextItem[][] = [];
    let currentLine: TextItem[] = [];
    let currentY: number | null = null;

    textItems.forEach((item) => {
      const y = item.transform[5];
      if (currentY === null) {
        currentY = y;
        currentLine.push(item);
      } else if (Math.abs(y - currentY) < tolerance) {
        currentLine.push(item);
      } else {
        lines.push(currentLine);
        currentLine = [item];
        currentY = y;
      }
    });
    lines.push(currentLine);

    let pageText = '';
    for (const line of lines) {
      line.sort((a, b) => a.transform[4] - b.transform[4]);
      let lineText = '';
      let prevItem: TextItem | null = null;

      for (const item of line) {
        if (!prevItem) {
          lineText = item.str;
        } else {
          const prevEndX = prevItem.transform[4] + (prevItem.width ?? 0);
          const currentStartX = item.transform[4];
          const space = currentStartX - prevEndX;
          
          // Get average character width as fallback
          const avgCharWidth = (item.width ?? 0) / Math.max(1, item.str.length);
          
          // Multiple conditions for space detection
          const needsSpace = 
              // Primary check: significant gap between items
              space > Math.max(avgCharWidth * 0.3, 2) ||
              // Secondary check: natural word boundary
              (!/^\W/.test(item.str) && !/\W$/.test(prevItem.str)) ||
              // Tertiary check: items are far enough apart relative to their size
              (space > ((prevItem.width ?? 0) * 0.25));

          if (needsSpace) {
              lineText += ' ' + item.str;
          } else {
              lineText += item.str;
          }
        }
        prevItem = item;
      }
      pageText += lineText + ' ';
    }

    return pageText.replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

// Highlighting functions
export function clearHighlights() {
  const textNodes = document.querySelectorAll('.react-pdf__Page__textContent span');
  textNodes.forEach((node) => {
    const element = node as HTMLElement;
    element.style.backgroundColor = '';
    element.style.opacity = '1';
  });
}

export function findBestTextMatch(
  elements: Array<{ element: HTMLElement; text: string }>,
  targetText: string,
  maxCombinedLength: number
): TextMatch {
  let bestMatch = {
    elements: [] as HTMLElement[],
    rating: 0,
    text: '',
    lengthDiff: Infinity,
  };

  const SPAN_SEARCH_LIMIT = 10;

  for (let i = 0; i < elements.length; i++) {
    let combinedText = '';
    const currentElements = [];
    for (let j = i; j < Math.min(i + SPAN_SEARCH_LIMIT, elements.length); j++) {
      const node = elements[j];
      const newText = combinedText ? `${combinedText} ${node.text}` : node.text;
      if (newText.length > maxCombinedLength) break;

      combinedText = newText;
      currentElements.push(node.element);

      const similarity = cmp.compare(combinedText, targetText);
      const lengthDiff = Math.abs(combinedText.length - targetText.length);
      const lengthPenalty = lengthDiff / targetText.length;
      const adjustedRating = similarity * (1 - lengthPenalty * 0.5);

      if (adjustedRating > bestMatch.rating) {
        bestMatch = {
          elements: [...currentElements],
          rating: adjustedRating,
          text: combinedText,
          lengthDiff,
        };
      }
    }
  }

  return bestMatch;
}

export function highlightPattern(
  text: string,
  pattern: string,
  containerRef: React.RefObject<HTMLDivElement>
) {
  clearHighlights();

  if (!pattern?.trim()) return;

  const cleanPattern = pattern.trim().replace(/\s+/g, ' ');
  const container = containerRef.current;
  if (!container) return;

  const textNodes = container.querySelectorAll('.react-pdf__Page__textContent span');
  const allText = Array.from(textNodes).map((node) => ({
    element: node as HTMLElement,
    text: (node.textContent || '').trim(),
  })).filter((node) => node.text.length > 0);

  const containerRect = container.getBoundingClientRect();
  const visibleTop = container.scrollTop;
  const visibleBottom = visibleTop + containerRect.height;
  const bufferSize = containerRect.height;

  const visibleNodes = allText.filter(({ element }) => {
    const rect = element.getBoundingClientRect();
    const elementTop = rect.top - containerRect.top + container.scrollTop;
    return elementTop >= (visibleTop - bufferSize) && elementTop <= (visibleBottom + bufferSize);
  });

  let bestMatch = findBestTextMatch(visibleNodes, cleanPattern, cleanPattern.length * 2);

  if (bestMatch.rating < 0.3) {
    bestMatch = findBestTextMatch(allText, cleanPattern, cleanPattern.length * 2);
  }

  const similarityThreshold = bestMatch.lengthDiff < cleanPattern.length * 0.3 ? 0.3 : 0.5;

  if (bestMatch.rating >= similarityThreshold) {
    bestMatch.elements.forEach((element) => {
      element.style.backgroundColor = 'grey';
      element.style.opacity = '0.4';
    });

    if (bestMatch.elements.length > 0) {
      const element = bestMatch.elements[0];
      const elementRect = element.getBoundingClientRect();
      const elementTop = elementRect.top - containerRect.top + container.scrollTop;

      if (elementTop < visibleTop || elementTop > visibleBottom) {
        container.scrollTo({
          top: elementTop - containerRect.height / 3,
          behavior: 'smooth',
        });
      }
    }
  }
}

// Text Click Handler
export function handleTextClick(
  event: MouseEvent,
  pdfText: string,
  containerRef: React.RefObject<HTMLDivElement>,
  stopAndPlayFromIndex: (index: number) => void,
  isProcessing: boolean
) {
  if (isProcessing) return;

  const target = event.target as HTMLElement;
  if (!target.matches('.react-pdf__Page__textContent span')) return;

  const parentElement = target.closest('.react-pdf__Page__textContent');
  if (!parentElement) return;

  const spans = Array.from(parentElement.querySelectorAll('span'));
  const clickedIndex = spans.indexOf(target);
  const contextWindow = 3;
  const startIndex = Math.max(0, clickedIndex - contextWindow);
  const endIndex = Math.min(spans.length - 1, clickedIndex + contextWindow);
  const contextText = spans
    .slice(startIndex, endIndex + 1)
    .map((span) => span.textContent)
    .join(' ')
    .trim();

  if (!contextText?.trim()) return;

  const cleanContext = contextText.trim().replace(/\s+/g, ' ');
  const allText = Array.from(parentElement.querySelectorAll('span')).map((node) => ({
    element: node as HTMLElement,
    text: (node.textContent || '').trim(),
  })).filter((node) => node.text.length > 0);

  const bestMatch = findBestTextMatch(allText, cleanContext, cleanContext.length * 2);
  const similarityThreshold = bestMatch.lengthDiff < cleanContext.length * 0.3 ? 0.3 : 0.5;

  if (bestMatch.rating >= similarityThreshold) {
    const matchText = bestMatch.text;
    // Use the same sentence processing logic as TTSContext for consistency
    const sentences = processTextToSentences(pdfText);
    console.log("sentences inside handleTextClick: %d", sentences.length)
    let bestSentenceMatch = { sentence: '', rating: 0 };

    for (const sentence of sentences) {
      const rating = cmp.compare(matchText, sentence);
      if (rating > bestSentenceMatch.rating) {
        bestSentenceMatch = { sentence, rating };
      }
    }

    if (bestSentenceMatch.rating >= 0.5) {
      const sentenceIndex = sentences.findIndex((sentence) => sentence === bestSentenceMatch.sentence);
      if (sentenceIndex !== -1) {
        stopAndPlayFromIndex(sentenceIndex);
        highlightPattern(pdfText, bestSentenceMatch.sentence, containerRef);
      }
    }
  }
}

// Debounce for PDF viewer
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
