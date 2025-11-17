'use client';

import { DocumentUploader } from '@/components/DocumentUploader';
import { DocumentList } from '@/components/doclist/DocumentList';
import { useDocuments } from '@/contexts/DocumentContext';

export function HomeContent() {
  const { pdfDocs, epubDocs, htmlDocs } = useDocuments();
  const totalDocs = (pdfDocs?.length || 0) + (epubDocs?.length || 0) + (htmlDocs?.length || 0);

  if (totalDocs === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <DocumentUploader className="py-12" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <DocumentList />
    </div>
  );
}
