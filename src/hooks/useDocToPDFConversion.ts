import { useState } from 'react';

export const useDocToPDFConversion = () => {
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convertDocToPDF = async (file: File): Promise<string | null> => {
    try {
      setIsConverting(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/convert-doc', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to convert document');
      }

      const pdfBlob = await response.blob();
      return URL.createObjectURL(pdfBlob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert document');
      return null;
    } finally {
      setIsConverting(false);
    }
  };

  return {
    convertDocToPDF,
    isConverting,
    error,
  };
};
