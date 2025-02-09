'use client';

import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { indexedDBService, type EPUBDocument } from '@/utils/indexedDB';
import { useConfig } from '@/contexts/ConfigContext';

export function useEPUBDocuments() {
  const { isDBReady } = useConfig();
  const [documents, setDocuments] = useState<EPUBDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDocuments = useCallback(async () => {
    if (isDBReady) {
      try {
        const docs = await indexedDBService.getAllEPUBDocuments();
        setDocuments(docs);
      } catch (error) {
        console.error('Failed to load EPUB documents:', error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [isDBReady]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const addDocument = useCallback(async (file: File): Promise<string> => {
    const id = uuidv4();
    const arrayBuffer = await file.arrayBuffer();
    
    console.log('Original file size:', file.size);
    console.log('ArrayBuffer size:', arrayBuffer.byteLength);
    
    const newDoc: EPUBDocument = {
      id,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      data: arrayBuffer,
    };

    try {
      await indexedDBService.addEPUBDocument(newDoc);
      setDocuments((prev) => [...prev, newDoc]);
      return id;
    } catch (error) {
      console.error('Failed to add EPUB document:', error);
      throw error;
    }
  }, []);

  const removeDocument = useCallback(async (id: string): Promise<void> => {
    try {
      await indexedDBService.removeEPUBDocument(id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    } catch (error) {
      console.error('Failed to remove EPUB document:', error);
      throw error;
    }
  }, []);

  return {
    documents,
    isLoading,
    addDocument,
    removeDocument,
  };
}
