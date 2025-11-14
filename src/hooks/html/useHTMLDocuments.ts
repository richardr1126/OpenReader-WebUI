'use client';

import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/utils/dexie';
import type { HTMLDocument } from '@/types/documents';

export function useHTMLDocuments() {
  const documents = useLiveQuery(
    () => db['html-documents'].toArray(),
    [],
    undefined,
  );

  const isLoading = documents === undefined;

  const addDocument = useCallback(async (file: File): Promise<string> => {
    const id = uuidv4();
    const content = await file.text();

    const newDoc: HTMLDocument = {
      id,
      type: 'html',
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      data: content,
    };

    await db['html-documents'].add(newDoc);
    return id;
  }, []);

  const removeDocument = useCallback(async (id: string): Promise<void> => {
    await db['html-documents'].delete(id);
  }, []);

  const clearDocuments = useCallback(async (): Promise<void> => {
    await db['html-documents'].clear();
  }, []);

  return {
    documents: documents ?? [],
    isLoading,
    addDocument,
    removeDocument,
    clearDocuments,
  };
}
