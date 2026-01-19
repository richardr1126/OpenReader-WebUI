'use client';

import { SummarizeIcon } from '@/components/icons/Icons';

interface SummarizeButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function SummarizeButton({ onClick, disabled }: SummarizeButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center py-1 px-2 rounded-md border border-offbase bg-base text-foreground text-xs hover:bg-offbase transition-all duration-200 ease-in-out hover:scale-[1.09] hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label="Summarize document"
      title="AI Summarize"
    >
      <SummarizeIcon className="w-4 h-4 transform transition-transform duration-200 ease-in-out hover:scale-[1.09] hover:text-accent" />
    </button>
  );
}
