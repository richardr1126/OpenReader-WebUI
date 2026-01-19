'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
  Button,
  Input,
  RadioGroup,
  Radio,
  Label,
} from '@headlessui/react';
import { CopyIcon, CheckIcon } from '@/components/icons/Icons';
import { LoadingSpinner } from '@/components/Spinner';
import { useConfig } from '@/contexts/ConfigContext';
import { generateSummary } from '@/lib/summarize';
import { saveSummary, getSummary } from '@/lib/dexie';
import type { SummarizeMode, SummaryRow } from '@/types/summary';

interface SummarizeModalProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  docId: string;
  docType: 'pdf' | 'epub' | 'html';
  currentPage?: number;
  totalPages?: number;
  onExtractText: (mode: SummarizeMode, pageNumber?: number) => Promise<string>;
}

const MODE_OPTIONS: { value: SummarizeMode; label: string; description: string }[] = [
  { value: 'current_page', label: 'Current Page', description: 'Summarize the page you are viewing' },
  { value: 'select_page', label: 'Select Page', description: 'Choose a specific page to summarize' },
  { value: 'whole_book', label: 'Whole Document', description: 'Summarize the entire document' },
];

export function SummarizeModal({
  isOpen,
  setIsOpen,
  docId,
  docType,
  currentPage = 1,
  totalPages,
  onExtractText,
}: SummarizeModalProps) {
  const { summaryProvider, summaryModel, summaryApiKey, summaryBaseUrl } = useConfig();

  const [mode, setMode] = useState<SummarizeMode>('current_page');
  const [selectedPage, setSelectedPage] = useState<number>(currentPage);
  const [summary, setSummary] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedSummary, setSavedSummary] = useState<SummaryRow | null>(null);

  // Update selected page when current page changes
  useEffect(() => {
    setSelectedPage(currentPage);
  }, [currentPage]);

  // Check for existing saved summary when mode or page changes
  const checkSavedSummary = useCallback(async () => {
    if (!isOpen) return;

    const pageNumber = mode === 'whole_book' ? null : (mode === 'current_page' ? currentPage : selectedPage);
    const existing = await getSummary(docId, docType, pageNumber);

    if (existing) {
      setSavedSummary(existing);
      setSummary(existing.summary);
    } else {
      setSavedSummary(null);
      setSummary('');
    }
  }, [isOpen, mode, docId, docType, currentPage, selectedPage]);

  useEffect(() => {
    checkSavedSummary();
  }, [checkSavedSummary]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setCopied(false);
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setSummary('');
    setSavedSummary(null);

    try {
      const pageNumber = mode === 'whole_book' ? undefined : (mode === 'current_page' ? currentPage : selectedPage);
      const text = await onExtractText(mode, pageNumber);

      if (!text || text.trim().length === 0) {
        throw new Error('No text could be extracted from the document');
      }

      const result = await generateSummary(text, mode, {
        provider: summaryProvider,
        apiKey: summaryApiKey,
        baseUrl: summaryBaseUrl,
        model: summaryModel,
      });

      setSummary(result.summary);

      // Save to IndexedDB
      await saveSummary({
        docId,
        docType,
        scope: mode === 'whole_book' ? 'book' : 'page',
        pageNumber: mode === 'whole_book' ? null : (pageNumber ?? null),
        summary: result.summary,
        provider: result.provider,
        model: result.model,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Refresh saved summary state
      await checkSavedSummary();
    } catch (err) {
      console.error('Error generating summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!summary) return;

    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Always allow - server will use env vars as fallback if no API key configured
  const isConfigured = true;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => setIsOpen(false)}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 overlay-dim backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-lg transform rounded-2xl bg-base p-6 text-left align-middle shadow-xl transition-all">
                <DialogTitle as="h3" className="text-lg font-semibold leading-6 text-foreground mb-4">
                  AI Summarize
                </DialogTitle>

                {!isConfigured && (
                  <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      Please configure your AI provider settings in Settings to use summarization.
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Mode selector */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Summarize Mode
                    </label>
                    <RadioGroup value={mode} onChange={setMode} className="space-y-2">
                      {MODE_OPTIONS.map((option) => (
                        <Radio
                          key={option.value}
                          value={option.value}
                          className={({ checked }) =>
                            `relative flex cursor-pointer rounded-lg px-4 py-3 border transition-all ${
                              checked
                                ? 'bg-accent/10 border-accent'
                                : 'bg-background border-offbase hover:border-accent/50'
                            }`
                          }
                        >
                          {({ checked }) => (
                            <div className="flex w-full items-center justify-between">
                              <div>
                                <Label as="p" className={`font-medium ${checked ? 'text-accent' : 'text-foreground'}`}>
                                  {option.label}
                                </Label>
                                <p className="text-xs text-muted">{option.description}</p>
                              </div>
                              {checked && (
                                <div className="shrink-0 text-accent">
                                  <CheckIcon className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                          )}
                        </Radio>
                      ))}
                    </RadioGroup>
                  </div>

                  {/* Page selector for select_page mode */}
                  {mode === 'select_page' && totalPages && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Page Number
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={selectedPage}
                        onChange={(e) => setSelectedPage(Math.max(1, Math.min(totalPages, parseInt(e.target.value) || 1)))}
                        className="w-full rounded-lg bg-background py-1.5 px-3 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                      <p className="text-xs text-muted mt-1">
                        Enter a page number between 1 and {totalPages}
                      </p>
                    </div>
                  )}

                  {/* Generate button */}
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || !isConfigured}
                    className="w-full inline-flex justify-center items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-secondary-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed transform transition-transform duration-200 ease-in-out hover:scale-[1.02]"
                  >
                    {isGenerating ? (
                      <>
                        <LoadingSpinner />
                        <span className="ml-2">Generating...</span>
                      </>
                    ) : savedSummary ? (
                      'Regenerate Summary'
                    ) : (
                      'Generate Summary'
                    )}
                  </Button>

                  {/* Error display */}
                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  )}

                  {/* Summary display */}
                  {summary && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-foreground">
                          Summary
                          {savedSummary && (
                            <span className="ml-2 text-xs text-muted">
                              (saved {new Date(savedSummary.updatedAt).toLocaleDateString()})
                            </span>
                          )}
                        </label>
                        <Button
                          onClick={handleCopy}
                          className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
                        >
                          {copied ? (
                            <>
                              <CheckIcon className="w-4 h-4" />
                              Copied
                            </>
                          ) : (
                            <>
                              <CopyIcon className="w-4 h-4" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-3 bg-background rounded-lg border border-offbase">
                        <p className="text-sm text-foreground whitespace-pre-wrap">{summary}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <Button
                    type="button"
                    className="inline-flex justify-center rounded-lg bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-offbase focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transform transition-transform duration-200 ease-in-out hover:scale-[1.04] hover:text-accent"
                    onClick={() => setIsOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
