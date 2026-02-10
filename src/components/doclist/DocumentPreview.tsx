import { DocumentListDocument } from '@/types/documents';
import { PDFIcon, EPUBIcon, FileIcon } from '@/components/icons/Icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  extractEpubCoverToDataUrl,
  renderPdfFirstPageToDataUrl,
} from '@/lib/documentPreview';
import { getDocumentContentSnippet } from '@/lib/client-documents';
import { ensureCachedDocument } from '@/lib/document-cache';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DocumentPreviewProps {
  doc: DocumentListDocument;
}

const imagePreviewCache = new Map<string, string>();
const textPreviewCache = new Map<string, string>();

export function DocumentPreview({ doc }: DocumentPreviewProps) {
  const isPDF = doc.type === 'pdf';
  const isEPUB = doc.type === 'epub';
  const isHTML = doc.type === 'html';
  const lowerName = doc.name.toLowerCase();
  const isTxtFile = isHTML && lowerName.endsWith('.txt');
  const isMarkdownFile =
    isHTML &&
    (lowerName.endsWith('.md') ||
      lowerName.endsWith('.markdown') ||
      lowerName.endsWith('.mdown') ||
      lowerName.endsWith('.mkd'));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const previewKey = useMemo(() => `${doc.type}:${doc.id}`, [doc.id, doc.type]);
  const cacheMeta = useMemo(
    () => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      size: doc.size,
      lastModified: doc.lastModified,
    }),
    [doc.id, doc.lastModified, doc.name, doc.size, doc.type],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const cachedImage = imagePreviewCache.get(previewKey);
    if (cachedImage) {
      setImagePreview(cachedImage);
      setTextPreview(null);
      return;
    }

    const cachedText = textPreviewCache.get(previewKey);
    if (cachedText) {
      setTextPreview(cachedText);
      setImagePreview(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      setIsGenerating(true);
      try {
        const targetWidth = 240;

        if (doc.type === 'pdf') {
          const cached = await ensureCachedDocument(cacheMeta, { signal: controller.signal });
          if (cached.type !== 'pdf') return;
          const data = cached.data;
          if (cancelled) return;
          const dataUrl = await renderPdfFirstPageToDataUrl(data, targetWidth);
          if (cancelled) return;
          imagePreviewCache.set(previewKey, dataUrl);
          setImagePreview(dataUrl);
          setTextPreview(null);
          return;
        }

        if (doc.type === 'epub') {
          const cached = await ensureCachedDocument(cacheMeta, { signal: controller.signal });
          if (cached.type !== 'epub') return;
          const data = cached.data;
          if (cancelled) return;
          const cover = await extractEpubCoverToDataUrl(data, targetWidth);
          if (cancelled) return;
          if (cover) {
            imagePreviewCache.set(previewKey, cover);
            setImagePreview(cover);
            setTextPreview(null);
          }
          return;
        }

        if (doc.type === 'html') {
          const snippet = await getDocumentContentSnippet(doc.id, {
            maxChars: 1600,
            maxBytes: 128 * 1024,
            signal: controller.signal,
          });
          if (cancelled) return;
          textPreviewCache.set(previewKey, snippet);
          setTextPreview(snippet);
          setImagePreview(null);
          return;
        }
      } catch {
        // fall back to icon
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cacheMeta, doc.id, doc.type, isVisible, previewKey]);

  const gradientClass = isPDF
    ? 'from-red-500/80 via-red-400/60 to-red-600/80'
    : isEPUB
      ? 'from-blue-500/80 via-blue-400/60 to-blue-600/80'
      : isHTML
        ? 'from-violet-500/80 via-violet-400/60 to-violet-600/80'
        : 'from-slate-500/80 via-slate-400/60 to-slate-600/80';

  const Icon = isPDF ? PDFIcon : isEPUB ? EPUBIcon : FileIcon;

  const typeLabel = isPDF
    ? 'PDF'
    : isEPUB
      ? 'EPUB'
      : isHTML
        ? isTxtFile
          ? 'TXT'
          : isMarkdownFile
            ? 'MD'
            : 'TEXT'
        : 'FILE';

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[3/4] overflow-hidden rounded-t-md bg-base"
    >
      {imagePreview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt={`${doc.name} preview`}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/15" />
        </>
      ) : textPreview ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-slate-200" />
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,1)_1px,transparent_0)] [background-size:12px_12px]" />
          <div className="relative z-10 h-full w-full p-2 flex flex-col">
            <div className="mt-auto rounded-md bg-white/70 backdrop-blur-[1px] shadow-sm ring-1 ring-black/5 p-2.5 max-h-[70%] overflow-hidden">
              {isTxtFile ? (
                <pre className="text-[10px] sm:text-[11px] leading-snug text-slate-900 whitespace-pre-wrap font-mono">
                  {textPreview}
                </pre>
              ) : (
                <div className="text-[10px] sm:text-[11px] leading-snug text-slate-900 break-words [overflow-wrap:anywhere]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: (props) => <p className="m-0" {...props} />,
                      h1: (props) => <h1 className="m-0 font-semibold text-[11px]" {...props} />,
                      h2: (props) => <h2 className="m-0 font-semibold text-[11px]" {...props} />,
                      h3: (props) => <h3 className="m-0 font-semibold text-[11px]" {...props} />,
                      h4: (props) => <h4 className="m-0 font-semibold text-[11px]" {...props} />,
                      h5: (props) => <h5 className="m-0 font-semibold text-[11px]" {...props} />,
                      h6: (props) => <h6 className="m-0 font-semibold text-[11px]" {...props} />,
                      ul: (props) => <ul className="m-0 pl-4" {...props} />,
                      ol: (props) => <ol className="m-0 pl-4" {...props} />,
                      li: (props) => <li className="my-0" {...props} />,
                      a: ({ children }) => <span>{children}</span>,
                      img: () => null,
                      blockquote: (props) => (
                        <blockquote className="m-0 pl-2 border-l-2 border-slate-300 text-slate-700" {...props} />
                      ),
                      code: (props) => (
                        <code
                          className="font-mono text-[10px] bg-slate-900/5 rounded px-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                          {...props}
                        />
                      ),
                      pre: (props) => (
                        <pre className="m-0 font-mono text-[10px] whitespace-pre-wrap break-words [overflow-wrap:anywhere]" {...props} />
                      ),
                    }}
                  >
                    {textPreview}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={`absolute inset-0 bg-gradient-to-br ${gradientClass}`} />
          <div className="relative z-10 flex flex-col items-center justify-center h-full gap-2 px-2 text-white">
            <Icon className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-md" />
            <span className="text-[10px] sm:text-[11px] tracking-wide uppercase font-semibold opacity-90">
              {typeLabel}
            </span>
          </div>
        </>
      )}

      <div className="absolute left-1 top-1 z-20 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
        {isGenerating ? '…' : typeLabel}
      </div>
    </div>
  );
}
