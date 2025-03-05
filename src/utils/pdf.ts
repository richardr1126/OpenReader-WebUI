/**
 * PDF utility functions for handling PDF documents in OpenReader
 */

import * as pdfjs from 'pdfjs-dist';
import { TextContent, TextItem, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { RefObject } from 'react';

// For workers in Next.js we need to set the worker source path correctly
if (typeof window !== 'undefined' && 'Worker' in window) {
  // Set worker source using CDN path based on pdfjs version
  (pdfjs as any).GlobalWorkerOptions.workerSrc = `//cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
}

/**
 * Generic debounce function
 * 
 * @param fn Function to debounce
 * @param delay Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      fn.apply(this, args);
      timeout = null;
    }, delay);
  };
}

/**
 * Type guard to check if an item is a TextItem
 */
function isTextItem(item: any): item is TextItem {
  return item && typeof item.str === 'string' && Array.isArray(item.transform);
}

/**
 * Safely extracts text from a PDF document
 *
 * @param pdfDocument The PDF document proxy
 * @param pageNum The page number to extract text from
 * @param margins Configuration for text extraction margins
 * @returns Promise resolving to the extracted text
 */
export async function extractTextFromPDF(
  pdfDocument: PDFDocumentProxy | null,
  pageNum: number,
  margins = {
    top: 0.07,
    bottom: 0.07,
    left: 0.07,
    right: 0.07,
  }
): Promise<string> {
  try {
    // Handle null document case
    if (!pdfDocument) {
      console.warn('PDF document is null or undefined');
      return '';
    }

    // Safely get page with error handling
    let page: PDFPageProxy;
    try {
      page = await pdfDocument.getPage(pageNum);
    } catch (err) {
      console.error('Error getting PDF page:', err);
      return '';
    }

    // If page is null or undefined, return empty string
    if (!page) {
      console.warn('PDF page is null or undefined');
      return '';
    }

    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    // Define margins based on page dimensions
    const topMargin = pageHeight * margins.top;
    const bottomMargin = pageHeight * margins.bottom;
    const leftMargin = pageWidth * margins.left;
    const rightMargin = pageWidth * margins.right;

    // Extract text content from the page with a safety timeout
    const textContent = await Promise.race([
      page.getTextContent(),
      new Promise<TextContent>((_, reject) => 
        setTimeout(() => reject(new Error('PDF text extraction timeout')), 10000)
      )
    ]) as TextContent;

    if (!textContent || !textContent.items) {
      console.warn('No text content found in PDF page');
      return '';
    }

    // Process text content with margin filtering
    let lastY: number | null = null;
    let text = '';

    // Filter items based on margins
    textContent.items.forEach((item) => {
      // Skip if not a TextItem
      if (!isTextItem(item)) return;
      
      const x = item.transform[4];
      const y = item.transform[5];
      
      // Skip content in margins
      if (
        x < leftMargin ||
        x > pageWidth - rightMargin ||
        y < bottomMargin ||
        y > pageHeight - topMargin
      ) {
        return;
      }

      // Add newlines between different y-positions
      if (lastY !== null && Math.abs(y - lastY) > 5) {
        text += '\n';
      }
      
      lastY = y;
      text += item.str + ' ';
    });

    // Clean and normalize the text
    text = text.replace(/\s+/g, ' ').trim();
    
    // Add paragraph breaks where appropriate
    text = text.replace(/\.\s+/g, '.\n\n');
    
    return text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * Safely loads a PDF document from a URL
 * 
 * @param url URL of the PDF to load
 * @returns Promise resolving to the PDF document proxy
 */
export async function loadPDFDocumentSafely(url: string): Promise<PDFDocumentProxy | null> {
  try {
    // Use the appropriate options for worker URLs in both dev and prod
    const loadingTask = pdfjs.getDocument({
      url,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    });
    
    // Add proper timeout and error handling
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        loadingTask.destroy().catch(e => console.error('Error destroying PDF loading task:', e));
        resolve(null);
      }, 30000); // 30 second timeout
    });

    // Race between loading and timeout
    const result = await Promise.race([loadingTask.promise, timeoutPromise]);
    return result;
  } catch (error) {
    console.error('Error loading PDF document:', error);
    return null;
  }
}

/**
 * CSS class used for text highlighting
 */
const HIGHLIGHT_CLASS = 'pdf-text-highlight';

/**
 * Highlights text in a PDF container based on a pattern
 * 
 * @param text The text content to search through
 * @param pattern The pattern to highlight
 * @param containerRef Reference to the container element
 */
export function highlightPattern(text: string, pattern: string, containerRef: RefObject<HTMLDivElement>): void {
  if (!containerRef.current || !pattern || !text) return;
  
  clearHighlights();
  
  // Create a RegExp for the pattern with case insensitivity
  try {
    const regex = new RegExp(pattern, 'gi');
    
    // Get all text nodes in the container
    const textNodes = getAllTextNodes(containerRef.current);
    
    // Highlight matching text in each text node
    textNodes.forEach(node => {
      const nodeText = node.textContent || '';
      const matches = [...nodeText.matchAll(regex)];
      
      if (matches.length > 0) {
        highlightTextNode(node, matches);
      }
    });
  } catch (error) {
    console.error('Error highlighting pattern:', error);
  }
}

/**
 * Clears all text highlights
 */
export function clearHighlights(): void {
  if (typeof window === 'undefined') return;
  
  // Remove all highlight spans
  const highlights = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
  highlights.forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      // Replace highlight with its text content
      parent.replaceChild(
        document.createTextNode(highlight.textContent || ''),
        highlight
      );
      // Normalize the parent to merge adjacent text nodes
      parent.normalize();
    }
  });
}

/**
 * Handles text click events to find and play from the clicked position
 * 
 * @param event The mouse click event
 * @param pdfText The full text content of the PDF
 * @param containerRef Reference to the container element
 * @param stopAndPlayFromIndex Callback to start playback from an index
 * @param isProcessing Whether the system is currently processing a request
 */
export function handleTextClick(
  event: MouseEvent,
  pdfText: string,
  containerRef: RefObject<HTMLDivElement>,
  stopAndPlayFromIndex: (index: number) => void,
  isProcessing: boolean
): void {
  if (isProcessing || !containerRef.current || !pdfText) return;
  
  // Get the click target and verify it's a text node or element
  const target = event.target as Node;
  if (!target) return;
  
  // Find the text node that was clicked
  const textNode = findTextNodeFromClick(target);
  if (!textNode || !textNode.textContent) return;
  
  // Get the clicked position within the text node
  const clickedText = textNode.textContent;
  const clickedTextStart = findTextNodePosition(textNode, containerRef.current);
  
  if (clickedTextStart !== -1) {
    // Calculate the relative click position and find it in the full text
    const clickPosition = clickedTextStart + Math.floor(clickedText.length / 2);
    const textBeforeClick = pdfText.substring(0, clickPosition);
    
    // Find the sentence start position
    let sentenceStart = textBeforeClick.lastIndexOf('. ');
    if (sentenceStart === -1) sentenceStart = 0;
    else sentenceStart += 2; // Move past the period and space
    
    // Use the callback to start playback from this position
    stopAndPlayFromIndex(sentenceStart);
  }
}

/**
 * Helper function to get all text nodes in an element
 * 
 * @param element The container element
 * @returns Array of text nodes
 */
function getAllTextNodes(element: HTMLElement): Node[] {
  const textNodes: Node[] = [];
  
  // Skip invisible elements
  if (element.style.display === 'none' || element.style.visibility === 'hidden') {
    return textNodes;
  }
  
  // Collect all text nodes using TreeWalker
  const treeWalker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip empty text nodes
        return node.textContent?.trim() 
          ? NodeFilter.FILTER_ACCEPT 
          : NodeFilter.FILTER_REJECT;
      }
    }
  );
  
  let currentNode = treeWalker.currentNode;
  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE && currentNode.textContent?.trim()) {
      textNodes.push(currentNode);
    }
    currentNode = treeWalker.nextNode() as Node;
  }
  
  return textNodes;
}

/**
 * Highlights matches in a text node
 * 
 * @param textNode The text node to highlight
 * @param matches Array of RegExpMatchArray matches
 */
function highlightTextNode(textNode: Node, matches: RegExpMatchArray[]): void {
  const parent = textNode.parentNode;
  if (!parent) return;
  
  let nodeText = textNode.textContent || '';
  let lastIndex = 0;
  
  // Create a document fragment to hold the new nodes
  const fragment = document.createDocumentFragment();
  
  // Process each match
  matches.forEach(match => {
    if (match.index === undefined || !match[0]) return;
    
    // Add text before the match
    if (match.index > lastIndex) {
      fragment.appendChild(
        document.createTextNode(nodeText.substring(lastIndex, match.index))
      );
    }
    
    // Create a highlighted span for the match
    const highlightSpan = document.createElement('span');
    highlightSpan.textContent = match[0];
    highlightSpan.className = HIGHLIGHT_CLASS;
    fragment.appendChild(highlightSpan);
    
    lastIndex = match.index + match[0].length;
  });
  
  // Add any remaining text after the last match
  if (lastIndex < nodeText.length) {
    fragment.appendChild(
      document.createTextNode(nodeText.substring(lastIndex))
    );
  }
  
  // Replace the original text node with the new fragment
  parent.replaceChild(fragment, textNode);
}

/**
 * Finds the clicked text node
 * 
 * @param target The clicked element or node
 * @returns The text node that was clicked, or null
 */
function findTextNodeFromClick(target: Node): Node | null {
  // If target is already a text node, return it
  if (target.nodeType === Node.TEXT_NODE) {
    return target;
  }
  
  // If target is an element with a highlight class, get its text content
  if (target.nodeType === Node.ELEMENT_NODE && 
      (target as Element).classList?.contains(HIGHLIGHT_CLASS)) {
    return target.firstChild;
  }
  
  // If target has child nodes, return the first text node
  if (target.hasChildNodes()) {
    for (let i = 0; i < target.childNodes.length; i++) {
      const child = target.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        return child;
      }
    }
  }
  
  return null;
}

/**
 * Finds the position of a text node within the full text
 * 
 * @param textNode The text node to find
 * @param container The container element
 * @returns The position of the text node in the full text, or -1 if not found
 */
function findTextNodePosition(textNode: Node, container: HTMLElement): number {
  const allTextNodes = getAllTextNodes(container);
  let position = 0;
  
  for (const node of allTextNodes) {
    if (node === textNode) {
      return position;
    }
    position += (node.textContent || '').length;
  }
  
  return -1;
}
