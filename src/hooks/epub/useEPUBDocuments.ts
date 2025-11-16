'use client';

import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import type { EPUBDocument } from '@/types/documents';

export function useEPUBDocuments() {
  const documents = useLiveQuery(
    () => db['epub-documents'].toArray(),
    [],
    undefined,
  );

  const isLoading = documents === undefined;

  const addDocument = useCallback(async (file: File): Promise<string> => {
    const id = uuidv4();
    const arrayBuffer = await file.arrayBuffer();

    console.log('Original file size:', file.size);
    console.log('ArrayBuffer size:', arrayBuffer.byteLength);

    const newDoc: EPUBDocument = {
      id,
      type: 'epub',
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      data: arrayBuffer,
    };

    await db['epub-documents'].add(newDoc);
    return id;
  }, []);

  const removeDocument = useCallback(async (id: string): Promise<void> => {
    await db['epub-documents'].delete(id);
  }, []);

  const clearDocuments = useCallback(async (): Promise<void> => {
    await db['epub-documents'].clear();
  }, []);

  return {
    documents: documents ?? [],
    isLoading,
    addDocument,
    removeDocument,
    clearDocuments,
  };
}
