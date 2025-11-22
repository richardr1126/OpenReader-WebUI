import { useCallback, useEffect } from 'react';
import { Rendition } from 'epubjs';
import { ReactReaderStyle, IReactReaderStyle } from 'react-reader';

// Returns ReactReader styles, with:
// - default look when epubTheme === false (except hiding built-in arrows)
// - themed colors + layout tweaks when epubTheme === true
export const getThemeStyles = (epubTheme: boolean): IReactReaderStyle => {
  const baseStyle = ReactReaderStyle;

  // Always hide the built-in prev/next arrow buttons so we can
  // provide our own navigation controls outside the reader.
  if (!epubTheme) {
    return {
      ...baseStyle,
      reader: {
        ...baseStyle.reader,
        // Always tighten the inset a bit for better use of space
        top: 8,
        left: 8,
        right: 8,
        bottom: 8,
      },
      prev: {
        ...baseStyle.prev,
        display: 'none',
        pointerEvents: 'none',
      },
      next: {
        ...baseStyle.next,
        display: 'none',
        pointerEvents: 'none',
      },
      titleArea: {
        ...baseStyle.titleArea,
        display: 'none',
      },
    };
  }

  const colors = {
    background: getComputedStyle(document.documentElement).getPropertyValue('--background'),
    foreground: getComputedStyle(document.documentElement).getPropertyValue('--foreground'),
    base: getComputedStyle(document.documentElement).getPropertyValue('--base'),
    offbase: getComputedStyle(document.documentElement).getPropertyValue('--offbase'),
    muted: getComputedStyle(document.documentElement).getPropertyValue('--muted'),
  };

  return {
    ...baseStyle,
    reader: {
      ...baseStyle.reader,
      // Reduce the large default inset (50px 50px 20px)
      // so the EPUB content can use more of the available area.
      top: 8,
      left: 8,
      right: 8,
      bottom: 8,
    },
    prev: {
      ...baseStyle.prev,
      display: 'none',
      pointerEvents: 'none',
    },
    next: {
      ...baseStyle.next,
      display: 'none',
      pointerEvents: 'none',
    },
    arrow: {
      ...baseStyle.arrow,
      color: colors.foreground,
    },
    arrowHover: {
      ...baseStyle.arrowHover,
      color: colors.muted,
    },
    readerArea: {
      ...baseStyle.readerArea,
      backgroundColor: colors.base,
      height: '100%',
    },
    titleArea: {
      ...baseStyle.titleArea,
      color: colors.foreground,
      display: 'none',
    },
    tocArea: {
      ...baseStyle.tocArea,
      background: colors.base,
    },
    tocButtonExpanded: {
      ...baseStyle.tocButtonExpanded,
      background: colors.offbase,
    },
    tocButtonBar: {
      ...baseStyle.tocButtonBar,
      background: colors.muted,
    },
    tocButton: {
      ...baseStyle.tocButton,
      color: colors.muted,
      // Ensure the TOC toggle sits above the swipe wrapper
      // and text iframe, avoiding z-index conflicts.
      zIndex: 300,
    },
    tocAreaButton: {
      ...baseStyle.tocAreaButton,
      color: colors.muted,
      backgroundColor: colors.offbase,
      padding: '0.25rem',
      paddingLeft: '0.5rem',
      paddingRight: '0.5rem',
      marginBottom: '0.25rem',
      borderRadius: '0.25rem',
      borderColor: 'transparent',
    },
  };
};

export const useEPUBTheme = (epubTheme: boolean, rendition: Rendition | undefined) => {
  const updateTheme = useCallback(() => {
    if (!epubTheme || !rendition) return;

    const colors = {
      foreground: getComputedStyle(document.documentElement).getPropertyValue('--foreground'),
      base: getComputedStyle(document.documentElement).getPropertyValue('--base'),
    };

    // Register theme rules instead of using override
    rendition.themes.registerRules('theme-light', {
      'body': {
        'color': colors.foreground,
        'background-color': colors.base
      }
    });

    // Select the theme to apply it
    rendition.themes.select('theme-light');
  }, [epubTheme, rendition]);

  // Watch for theme changes
  useEffect(() => {
    if (!epubTheme || !rendition) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          updateTheme();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, [epubTheme, rendition, updateTheme]);

  // Watch for epubTheme changes
  useEffect(() => {
    if (!epubTheme || !rendition) return;
    updateTheme();
  }, [epubTheme, rendition, updateTheme]);

  return { updateTheme };
};
