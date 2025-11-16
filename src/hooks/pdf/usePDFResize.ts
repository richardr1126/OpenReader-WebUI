import { RefObject, useState, useEffect } from 'react';
import { debounce } from '@/lib/pdf';

interface UsePDFResizeResult {
  containerWidth: number;
  setContainerWidth: (width: number) => void;
}

export function usePDFResize(
  containerRef: RefObject<HTMLDivElement | null>
): UsePDFResizeResult {
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const debouncedResize = debounce((width: unknown) => {
      setContainerWidth(Number(width));
    }, 150);

    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) {
        debouncedResize(width);
      }
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return { containerWidth, setContainerWidth };
}