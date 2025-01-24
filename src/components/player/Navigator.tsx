import { Button } from '@headlessui/react';

export const Navigator = ({ currentPage, numPages, onPageChange }: {
  currentPage: number;
  numPages: number | undefined;
  onPageChange: (page: number) => void;
}) => {
  return (
    <div className="flex items-center space-x-1">
      {/* Page back */}
      <Button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="relative p-2 rounded-full text-foreground hover:bg-offbase data-[hover]:bg-offbase data-[active]:bg-offbase/80 transition-colors duration-200 focus:outline-none disabled:opacity-50"
        aria-label="Previous page"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </Button>

      {/* Page number */}
      <div className="bg-offbase px-2 py-0.5 rounded-full">
        <p className="text-xs">
          {currentPage} / {numPages || 1}
        </p>
      </div>

      {/* Page forward */}
      <Button
        onClick={() => onPageChange(currentPage + 1)}
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