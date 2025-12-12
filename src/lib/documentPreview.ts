import { pdfjs } from 'react-pdf';
import ePub from 'epubjs';

function shouldUseLegacyPdfWorker(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  if (!isSafari) return false;
  const match = ua.match(/Version\/(\d+)/i);
  if (!match?.[1]) return true;
  const version = Number.parseInt(match[1], 10);
  return Number.isFinite(version) ? version < 18 : true;
}

export function ensurePdfWorker(): void {
  if (typeof window === 'undefined') return;
  if (pdfjs.GlobalWorkerOptions.workerSrc) return;

  const useLegacy = shouldUseLegacyPdfWorker();
  const workerSrc = useLegacy
    ? new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href
    : new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  pdfjs.GlobalWorkerOptions.workerPort = null;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function scaleImageBlobToDataUrl(blob: Blob, targetWidth: number): Promise<string> {
  if (typeof window === 'undefined') {
    return blobToDataUrl(blob);
  }

  if (typeof createImageBitmap !== 'function') {
    return blobToDataUrl(blob);
  }

  const bitmap = await createImageBitmap(blob);
  try {
    const scale = targetWidth > 0 ? targetWidth / bitmap.width : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return blobToDataUrl(blob);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl;
  } finally {
    bitmap.close();
  }
}

export async function renderPdfFirstPageToDataUrl(
  data: ArrayBuffer,
  targetWidth: number,
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('PDF thumbnail rendering must run in the browser');
  }

  ensurePdfWorker();

  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = targetWidth > 0 ? targetWidth / viewport.width : 1;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(scaledViewport.width));
    canvas.height = Math.max(1, Math.floor(scaledViewport.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to create canvas context');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
      intent: 'display',
    });
    await renderTask.promise;

    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    await pdf.destroy().catch(() => undefined);
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function extractEpubCoverToDataUrl(
  data: ArrayBuffer,
  targetWidth: number,
): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const book = ePub(data);
  const opened = book.opened.catch(() => undefined);
  try {
    const coverObjectUrl = await book.coverUrl();
    if (!coverObjectUrl) return null;

    const res = await fetch(coverObjectUrl);
    const blob = await res.blob();
    if (coverObjectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(coverObjectUrl);
    }

    return await scaleImageBlobToDataUrl(blob, targetWidth);
  } catch {
    return null;
  } finally {
    void opened.finally(() => {
      try {
        book.destroy();
      } catch {
        // ignore
      }
    });
  }
}

export function extractTextSnippet(source: string, maxChars = 220): string {
  const strippedHtml = source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  const normalizedMarkdown = strippedHtml
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*?\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~]/g, ' ');

  const normalized = normalizedMarkdown
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const paragraphs = normalized.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const first = paragraphs[0] ?? normalized;

  if (first.length <= maxChars) return first;
  return `${first.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function extractRawTextSnippet(source: string, maxChars = 1600): string {
  const strippedHtml = source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');

  const normalized = strippedHtml.replace(/\r\n/g, '\n').trim();

  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
