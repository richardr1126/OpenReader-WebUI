import type { DocumentListState } from '@/types/documents';

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
  firstVisit: boolean;
  documentListState: DocumentListState;
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
  ttsProvider: 'custom-openai',
  ttsModel: 'kokoro',
  ttsInstructions: '',
  savedVoices: {},
  smartSentenceSplitting: true,
  pdfHighlightEnabled: true,
  firstVisit: false,
  documentListState: {
    sortBy: 'name',
    sortDirection: 'asc',
    folders: [],
    collapsedFolders: [],
    showHint: true,
  },
};

export interface AppConfigRow extends AppConfigValues {
  id: string;
}
