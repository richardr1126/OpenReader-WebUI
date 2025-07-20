'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadIcon } from '@/components/icons/Icons';
import { useDocuments } from '@/contexts/DocumentContext';

const isDev = process.env.NEXT_PUBLIC_NODE_ENV !== 'production' || process.env.NODE_ENV == null;

interface DocumentUploaderProps {
  className?: string;
}

export function DocumentUploader({ className = '' }: DocumentUploaderProps) {
  const { 
    addPDFDocument: addPDF, 
    addEPUBDocument: addEPUB,
    addHTMLDocument: addHTML 
  } = useDocuments();
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convertDocxToPdf = async (file: File): Promise<File> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/documents/docx-to-pdf', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to convert DOCX to PDF');
    }

    const pdfBlob = await response.blob();
    return new File([pdfBlob], file.name.replace(/\.docx$/, '.pdf'), {
      type: 'application/pdf',
    });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (const file of acceptedFiles) {
        if (file.type === 'application/pdf') {
          await addPDF(file);
        } else if (file.type === 'application/epub+zip') {
          await addEPUB(file);
        } else if (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md')) {
          await addHTML(file);
        } else if (isDev && file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          setIsUploading(false);
          setIsConverting(true);
          const pdfFile = await convertDocxToPdf(file);
          await addPDF(pdfFile);
          setIsConverting(false);
          setIsUploading(true);
        }
      }
    } catch (err) {
      setError('Failed to upload file. Please try again.');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
      setIsConverting(false);
    }
  }, [addHTML, addPDF, addEPUB]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/epub+zip': ['.epub'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      ...(isDev ? {
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
      } : {})
    },
    multiple: true,
    disabled: isUploading || isConverting
  });

  return (
    <div
      {...getRootProps()}
      className={`
        w-full py-5 px-3 border-2 border-dashed rounded-lg
        ${isDragActive ? 'border-accent bg-base' : 'border-muted'}
        transform trasition-transform duration-200 ease-in-out hover:scale-[1.008]
        ${(isUploading || isConverting) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-accent hover:bg-base'}
        ${className}
      `}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center text-center">
        <UploadIcon className="w-7 h-7 sm:w-10 sm:h-10 mb-2 text-muted" />

        {isUploading ? (
          <p className="text-sm sm:text-lg font-semibold text-foreground">
            Uploading file...
          </p>
        ) : isConverting ? (
          <p className="text-sm sm:text-lg font-semibold text-foreground">
            Converting DOCX to PDF...
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm sm:text-lg font-semibold text-foreground">
              {isDragActive ? 'Drop your file(s) here' : 'Drop your file(s) here, or click to select'}
            </p>
            <p className="text-xs sm:text-sm text-muted">
              {isDev ? 'PDF, EPUB, TXT, MD, or DOCX files are accepted' : 'PDF, EPUB, TXT, or MD files are accepted'}
            </p>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
