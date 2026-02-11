import type { DocumentListState } from '@/types/documents';

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;
const wordHighlightEnabledByDefault = process.env.NEXT_PUBLIC_ENABLE_WORD_HIGHLIGHT === 'true';

export type ViewType = 'single' | 'dual' | 'scroll';

export type SavedVoices = Record<string, string>;

export interface AppConfigValues {
  apiKey: string;
  baseUrl: string;
  viewType: ViewType;
  voiceSpeed: number;
  audioPlayerSpeed: number;
  voice: string;
  skipBlank: boolean;
  epubTheme: boolean;
  headerMargin: number;
  footerMargin: number;
  leftMargin: number;
  rightMargin: number;
  ttsProvider: string;
  ttsModel: string;
  ttsInstructions: string;
  savedVoices: SavedVoices;
  smartSentenceSplitting: boolean;
  pdfHighlightEnabled: boolean;
  pdfWordHighlightEnabled: boolean;
  epubHighlightEnabled: boolean;
  epubWordHighlightEnabled: boolean;
  firstVisit: boolean;
  documentListState: DocumentListState;
  privacyAccepted: boolean;
  documentsMigrationPrompted: boolean;
}

export const APP_CONFIG_DEFAULTS: AppConfigValues = {
  apiKey: '',
  baseUrl: '',
  viewType: 'single',
  voiceSpeed: 1,
  audioPlayerSpeed: 1,
  voice: '',
  skipBlank: true,
  epubTheme: false,
  headerMargin: 0,
  footerMargin: 0,
  leftMargin: 0,
  rightMargin: 0,
  ttsProvider: isDev ? 'custom-openai' : 'deepinfra',
  ttsModel: isDev ? 'kokoro' : 'hexgrad/Kokoro-82M',
  ttsInstructions: '',
  savedVoices: {},
  smartSentenceSplitting: true,
  pdfHighlightEnabled: true,
  pdfWordHighlightEnabled: wordHighlightEnabledByDefault,
  epubHighlightEnabled: true,
  epubWordHighlightEnabled: wordHighlightEnabledByDefault,
  firstVisit: false,
  documentListState: {
    sortBy: 'name',
    sortDirection: 'asc',
    folders: [],
    collapsedFolders: [],
    showHint: true,
    viewMode: 'grid',
  },
  privacyAccepted: false,
  documentsMigrationPrompted: false,
};

export interface AppConfigRow extends AppConfigValues {
  id: string;
}
