import { useCallback, useEffect } from 'react';
import { Rendition } from 'epubjs';
import { ReactReaderStyle, IReactReaderStyle } from 'react-reader';

export const getThemeStyles = (): IReactReaderStyle => {
  const baseStyle = {
    ...ReactReaderStyle,
    readerArea: {
      ...ReactReaderStyle.readerArea,
      transition: undefined,
    }
  };

  const colors = {
    background: getComputedStyle(document.documentElement).getPropertyValue('--background'),
    foreground: getComputedStyle(document.documentElement).getPropertyValue('--foreground'),
    base: getComputedStyle(document.documentElement).getPropertyValue('--base'),
    offbase: getComputedStyle(document.documentElement).getPropertyValue('--offbase'),
    muted: getComputedStyle(document.documentElement).getPropertyValue('--muted'),
  };

  return {
    ...baseStyle,
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