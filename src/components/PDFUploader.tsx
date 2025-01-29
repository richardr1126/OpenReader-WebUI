'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { usePDF } from '@/contexts/PDFContext';
import { UploadIcon } from '@/components/icons/Icons';
import { useDocToPDFConversion } from '@/hooks/useDocToPDFConversion';

interface PDFUploaderProps {
  className?: string;
}

export function PDFUploader({ className = '' }: PDFUploaderProps) {
  const { addDocument } = usePDF();
  const { convertDocToPDF } = useDocToPDFConversion();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setFile(file);

    try {
      let pdfFile = file;

      // If it's a Word document, convert it to PDF first
      if (file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
        const pdfUrl = await convertDocToPDF(file);
        if (!pdfUrl) {
          throw new Error('Failed to convert document to PDF');
        }
        
        // Convert the PDF URL blob to a File object
        const response = await fetch(pdfUrl);
        const pdfBlob = await response.blob();
        pdfFile = new File([pdfBlob], file.name.replace(/\.(doc|docx)$/, '.pdf'), {
          type: 'application/pdf'
        });
      } else if (file.type !== 'application/pdf') {
        throw new Error('Unsupported file type. Please upload a PDF or Word document.');
      }

      await addDocument(pdfFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process document. Please try again.');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  }, [addDocument, convertDocToPDF]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    multiple: false,
    disabled: isUploading
  });

  return (
    <div
      {...getRootProps()}
      className={`
        w-full py-5 px-3 border-2 border-dashed rounded-lg
        ${isDragActive ? 'border-accent bg-base' : 'border-muted'}
        transform trasition-transform duration-200 ease-in-out hover:scale-[1.008]
        ${isUploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-accent hover:bg-base'}
        ${className}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center text-center">
        <UploadIcon className="w-7 h-7 sm:w-10 sm:h-10 mb-2 text-muted" />

        {isUploading ? (
          <p className="text-sm sm:text-lg font-semibold text-foreground">
            {file?.name?.endsWith('.doc') || file?.name?.endsWith('.docx')
              ? 'Converting and uploading document...'
              : 'Uploading PDF...'}
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm sm:text-lg font-semibold text-foreground">
              {isDragActive ? 'Drop your document here' : 'Drop your document here, or click to select'}
            </p>
            <p className="text-xs sm:text-sm text-muted">
              Accepts PDF, DOC, and DOCX files
            </p>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
