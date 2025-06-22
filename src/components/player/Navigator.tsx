'use client';

import { Button } from '@headlessui/react';
import { useState, useEffect, useRef } from 'react';

export const Navigator = ({ currentPage, numPages, skipToLocation }: {
  currentPage: number;
  numPages: number | undefined;
  skipToLocation: (location: string | number, shouldPause?: boolean) => void;
}) => {
  const [inputValue, setInputValue] = useState(currentPage.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(currentPage.toString());
  }, [currentPage]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers
    const value = e.target.value.replace(/[^0-9]/g, '');
    setInputValue(value);
  };

  const handleInputConfirm = () => {
    let page = parseInt(inputValue, 10);
    if (isNaN(page)) return;
    const maxPage = numPages || 1;
    if (page < 1) page = 1;
    if (page > maxPage) page = maxPage;
    if (page !== currentPage) {
      skipToLocation(page, true);
    } else {
      setInputValue(page.toString()); // reset input if unchanged
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputConfirm();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="flex items-center space-x-1">
      {/* Page back */}
      <Button
        onClick={() => skipToLocation(currentPage - 1, true)}
        disabled={currentPage <= 1}
        className="relative p-2 rounded-full text-foreground hover:bg-offbase data-[hover]:bg-offbase data-[active]:bg-offbase/80 transition-colors duration-200 focus:outline-none disabled:opacity-50"
        aria-label="Previous page"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </Button>

      {/* Page number input */}
      <div className="bg-offbase px-2 py-0.5 rounded-full flex items-center">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="w-6 text-xs text-accent bg-transparent outline-none appearance-none text-right"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputConfirm}
          onKeyDown={handleInputKeyDown}
          aria-label="Page number"
        />
        <span className="w-6 text-xs ml-1">/ {numPages || 1}</span>
      </div>

      {/* Page forward */}
      <Button
        onClick={() => skipToLocation(currentPage + 1, true)}
        disabled={currentPage >= (numPages || 1)}
        className="relative p-2 rounded-full text-foreground hover:bg-offbase data-[hover]:bg-offbase data-[active]:bg-offbase/80 transition-colors duration-200 focus:outline-none disabled:opacity-50"
        aria-label="Next page"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </Button>
    </div>
  );
}