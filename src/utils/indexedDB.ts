import { PDFDocument, EPUBDocument, HTMLDocument, DocumentListState } from '@/types/documents';

const DB_NAME = 'openreader-db';
const DB_VERSION = 3;  // Increased version for new store
const PDF_STORE_NAME = 'pdf-documents';
const EPUB_STORE_NAME = 'epub-documents';
const HTML_STORE_NAME = 'html-documents';
const CONFIG_STORE_NAME = 'config';

export interface Config {
  key: string;
  value: string;
}

class IndexedDBService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.db) {
      return Promise.resolve();
    }

    this.initPromise = new Promise((resolve, reject) => {
      console.log('Initializing IndexedDB...');
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        const error = (event.target as IDBRequest).error;
        console.error('IndexedDB initialization error:', error);
        reject(error);
      };

      request.onsuccess = (event) => {
        console.log('IndexedDB initialized successfully');
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        console.log('Upgrading IndexedDB schema...');
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(PDF_STORE_NAME)) {
          console.log('Creating PDF documents store...');
          db.createObjectStore(PDF_STORE_NAME, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(HTML_STORE_NAME)) {
          console.log('Creating HTML documents store...');
          db.createObjectStore(HTML_STORE_NAME, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(EPUB_STORE_NAME)) {
          console.log('Creating EPUB documents store...');
          db.createObjectStore(EPUB_STORE_NAME, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
          console.log('Creating config store...');
          db.createObjectStore(CONFIG_STORE_NAME, { keyPath: 'key' });
        }
      };
    });

    return this.initPromise;
  }

  // PDF Document Methods
  async addDocument(document: PDFDocument): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Adding document to IndexedDB:', document.name);
        const transaction = this.db!.transaction([PDF_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PDF_STORE_NAME);

        // Create a structured clone of the document to ensure proper storage
        const request = store.put({
          ...document,
          data: document.data // Store ArrayBuffer directly
        });

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error adding document:', error);
          reject(error);
        };

        transaction.oncomplete = () => {
          console.log('Document added successfully:', document.name);
          resolve();
        };
      } catch (error) {
        console.error('Error in addDocument transaction:', error);
        reject(error);
      }
    });
  }

  async getDocument(id: string): Promise<PDFDocument | undefined> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Fetching document:', id);
        const transaction = this.db!.transaction([PDF_STORE_NAME], 'readonly');
        const store = transaction.objectStore(PDF_STORE_NAME);
        const request = store.get(id);

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error fetching document:', error);
          reject(error);
        };

        request.onsuccess = () => {
          console.log('Document fetch result:', request.result ? 'found' : 'not found');
          resolve(request.result);
        };
      } catch (error) {
        console.error('Error in getDocument transaction:', error);
        reject(error);
      }
    });
  }

  async getAllDocuments(): Promise<PDFDocument[]> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Fetching all documents');
        const transaction = this.db!.transaction([PDF_STORE_NAME], 'readonly');
        const store = transaction.objectStore(PDF_STORE_NAME);
        const request = store.getAll();

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error fetching all documents:', error);
          reject(error);
        };

        request.onsuccess = () => {
          console.log('Retrieved documents count:', request.result?.length || 0);
          resolve(request.result || []);
        };
      } catch (error) {
        console.error('Error in getAllDocuments transaction:', error);
        reject(error);
      }
    });
  }

  async removeDocument(id: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Removing document:', id);
        const locationKey = `lastLocation_${id}`;

        // Create two transactions - one for document deletion, one for location cleanup
        const docTransaction = this.db!.transaction([PDF_STORE_NAME], 'readwrite');
        const configTransaction = this.db!.transaction([CONFIG_STORE_NAME], 'readwrite');

        const docStore = docTransaction.objectStore(PDF_STORE_NAME);
        const configStore = configTransaction.objectStore(CONFIG_STORE_NAME);

        // Remove the document
        const docRequest = docStore.delete(id);
        // Remove any saved location
        const locationRequest = configStore.delete(locationKey);

        docRequest.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error removing document:', error);
          reject(error);
        };

        locationRequest.onerror = (event) => {
          console.warn('Error cleaning up location:', (event.target as IDBRequest).error);
          // Don't reject here, as document deletion is the primary operation
        };

        // Wait for both transactions to complete
        Promise.all([
          new Promise<void>((res) => { docTransaction.oncomplete = () => res(); }),
          new Promise<void>((res) => { configTransaction.oncomplete = () => res(); })
        ]).then(() => {
          console.log('Document and location data removed successfully:', id);
          resolve();
        }).catch(reject);

      } catch (error) {
        console.error('Error in removeDocument transaction:', error);
        reject(error);
      }
    });
  }

  // Add HTML Document Methods
  async addHTMLDocument(document: HTMLDocument): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Adding HTML document to IndexedDB:', document.name);
        const transaction = this.db!.transaction([HTML_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(HTML_STORE_NAME);

        const request = store.put({
          ...document,
          data: document.data
        });

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error adding HTML document:', error);
          reject(error);
        };

        transaction.oncomplete = () => {
          console.log('HTML document added successfully:', document.name);
          resolve();
        };
      } catch (error) {
        console.error('Error in addHTMLDocument transaction:', error);
        reject(error);
      }
    });
  }

  async getHTMLDocument(id: string): Promise<HTMLDocument | undefined> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Fetching HTML document:', id);
        const transaction = this.db!.transaction([HTML_STORE_NAME], 'readonly');
        const store = transaction.objectStore(HTML_STORE_NAME);
        const request = store.get(id);

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error fetching HTML document:', error);
          reject(error);
        };

        request.onsuccess = () => {
          console.log('HTML Document fetch result:', request.result ? 'found' : 'not found');
          resolve(request.result);
        };
      } catch (error) {
        console.error('Error in getHTMLDocument transaction:', error);
        reject(error);
      }
    });
  }

  async getAllHTMLDocuments(): Promise<HTMLDocument[]> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Fetching all HTML documents');
        const transaction = this.db!.transaction([HTML_STORE_NAME], 'readonly');
        const store = transaction.objectStore(HTML_STORE_NAME);
        const request = store.getAll();

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error fetching all HTML documents:', error);
          reject(error);
        };

        request.onsuccess = () => {
          console.log('Retrieved HTML documents count:', request.result?.length || 0);
          resolve(request.result || []);
        };
      } catch (error) {
        console.error('Error in getAllHTMLDocuments transaction:', error);
        reject(error);
      }
    });
  }

  async removeHTMLDocument(id: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Removing HTML document:', id);
        const transaction = this.db!.transaction([HTML_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(HTML_STORE_NAME);
        const request = store.delete(id);

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error removing HTML document:', error);
          reject(error);
        };

        transaction.oncomplete = () => {
          console.log('HTML document removed successfully:', id);
          resolve();
        };
      } catch (error) {
        console.error('Error in removeHTMLDocument transaction:', error);
        reject(error);
      }
    });
  }

  async clearHTMLDocuments(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Clearing all HTML documents');
        const transaction = this.db!.transaction([HTML_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(HTML_STORE_NAME);
        const request = store.clear();

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error clearing HTML documents:', error);
          reject(error);
        };

        transaction.oncomplete = () => {
          console.log('All HTML documents cleared successfully');
          resolve();
        };
      } catch (error) {
        console.error('Error in clearHTMLDocuments transaction:', error);
        reject(error);
      }
    });
  }

  // Add EPUB Document Methods
  async addEPUBDocument(document: EPUBDocument): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        if (document.data.byteLength === 0) {
          throw new Error('Cannot store empty ArrayBuffer');
        }

        console.log('Storing document:', {
          name: document.name,
          size: document.size,
          actualSize: document.data.byteLength
        });

        const transaction = this.db!.transaction([EPUB_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(EPUB_STORE_NAME);

        // Create a structured clone of the document to ensure proper storage
        const request = store.put({
          ...document,
          data: document.data.slice(0) // Create a copy of the ArrayBuffer
        });

        request.onerror = (event) => {
          console.error('Error storing document:', (event.target as IDBRequest).error);
          reject((event.target as IDBRequest).error);
        };

        transaction.oncomplete = () => {
          console.log('Document stored successfully');
          resolve();
        };
      } catch (error) {
        console.error('Error in addEPUBDocument:', error);
        reject(error);
      }
    });
  }

  async getEPUBDocument(id: string): Promise<EPUBDocument | undefined> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([EPUB_STORE_NAME], 'readonly');
        const store = transaction.objectStore(EPUB_STORE_NAME);
        const request = store.get(id);

        request.onerror = (event) => {
          console.error('Error fetching document:', (event.target as IDBRequest).error);
          reject((event.target as IDBRequest).error);
        };

        request.onsuccess = () => {
          const doc = request.result;
          if (doc) {
            console.log('Retrieved document from DB:', {
              name: doc.name,
              size: doc.size,
              actualSize: doc.data.byteLength
            });
          }
          resolve(doc);
        };
      } catch (error) {
        console.error('Error in getEPUBDocument:', error);
        reject(error);
      }
    });
  }

  async getAllEPUBDocuments(): Promise<EPUBDocument[]> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([EPUB_STORE_NAME], 'readonly');
        const store = transaction.objectStore(EPUB_STORE_NAME);
        const request = store.getAll();

        request.onerror = (event) => {
          reject((event.target as IDBRequest).error);
        };

        request.onsuccess = () => {
          resolve(request.result || []);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async removeEPUBDocument(id: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Removing EPUB document:', id);
        const locationKey = `lastLocation_${id}`;

        // Create two transactions - one for document deletion, one for location cleanup
        const docTransaction = this.db!.transaction([EPUB_STORE_NAME], 'readwrite');
        const configTransaction = this.db!.transaction([CONFIG_STORE_NAME], 'readwrite');

        const docStore = docTransaction.objectStore(EPUB_STORE_NAME);
        const configStore = configTransaction.objectStore(CONFIG_STORE_NAME);

        // Remove the document
        const docRequest = docStore.delete(id);
        // Remove any saved location
        const locationRequest = configStore.delete(locationKey);

        docRequest.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error removing EPUB document:', error);
          reject(error);
        };

        locationRequest.onerror = (event) => {
          console.warn('Error cleaning up location:', (event.target as IDBRequest).error);
          // Don't reject here, as document deletion is the primary operation
        };

        // Wait for both transactions to complete
        Promise.all([
          new Promise<void>((res) => { docTransaction.oncomplete = () => res(); }),
          new Promise<void>((res) => { configTransaction.oncomplete = () => res(); })
        ]).then(() => {
          console.log('EPUB document and location data removed successfully:', id);
          resolve();
        }).catch(reject);

      } catch (error) {
        console.error('Error in removeEPUBDocument transaction:', error);
        reject(error);
      }
    });
  }

  // Config Methods
  async setConfigItem(key: string, value: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Setting config item:', key);
        const transaction = this.db!.transaction([CONFIG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONFIG_STORE_NAME);
        const request = store.put({ key, value });

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error setting config item:', error);
          reject(error);
        };

        transaction.oncomplete = () => {
          console.log('Config item set successfully:', key);
          resolve();
        };
      } catch (error) {
        console.error('Error in setConfigItem transaction:', error);
        reject(error);
      }
    });
  }

  async getConfigItem(key: string): Promise<string | null> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Fetching config item:', key);
        const transaction = this.db!.transaction([CONFIG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONFIG_STORE_NAME);
        const request = store.get(key);

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error fetching config item:', error);
          reject(error);
        };

        request.onsuccess = () => {
          const result = request.result as Config | undefined;
          console.log('Config item fetch result:', result ? 'found' : 'not found');
          resolve(result ? result.value : null);
        };
      } catch (error) {
        console.error('Error in getConfigItem transaction:', error);
        reject(error);
      }
    });
  }

  async getAllConfig(): Promise<Record<string, string>> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Fetching all config items');
        const transaction = this.db!.transaction([CONFIG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONFIG_STORE_NAME);
        const request = store.getAll();

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error fetching all config items:', error);
          reject(error);
        };

        request.onsuccess = () => {
          const result = request.result as Config[];
          const config: Record<string, string> = {};
          result.forEach((item) => {
            config[item.key] = item.value;
          });
          console.log('Retrieved config items count:', result.length);
          resolve(config);
        };
      } catch (error) {
        console.error('Error in getAllConfig transaction:', error);
        reject(error);
      }
    });
  }

  async removeConfigItem(key: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Removing config item:', key);
        const transaction = this.db!.transaction([CONFIG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONFIG_STORE_NAME);
        const request = store.delete(key);

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error removing config item:', error);
          reject(error);
        };

        transaction.oncomplete = () => {
          console.log('Config item removed successfully:', key);
          resolve();
        };
      } catch (error) {
        console.error('Error in removeConfigItem transaction:', error);
        reject(error);
      }
    });
  }

  async syncToServer(onProgress?: (progress: number, status?: string) => void, signal?: AbortSignal): Promise<{ lastSync: number }> {
    const pdfDocs = await this.getAllDocuments();
    const epubDocs = await this.getAllEPUBDocuments();

    const documents = [];
    const totalDocs = pdfDocs.length + epubDocs.length;
    let processedDocs = 0;

    // Process PDF documents - convert ArrayBuffer to array for JSON serialization
    for (const doc of pdfDocs) {
      documents.push({
        ...doc,
        type: 'pdf',
        data: Array.from(new Uint8Array(doc.data))
      });
      processedDocs++;
      if (onProgress) {
        onProgress((processedDocs / totalDocs) * 50, `Processing ${processedDocs}/${totalDocs} documents...`);
      }
    }

    // Process EPUB documents
    for (const doc of epubDocs) {
      documents.push({
        ...doc,
        type: 'epub',
        data: Array.from(new Uint8Array(doc.data))
      });
      processedDocs++;
      if (onProgress) {
        onProgress((processedDocs / totalDocs) * 50, `Processing ${processedDocs}/${totalDocs} documents...`);
      }
    }

    if (onProgress) {
      onProgress(50, 'Uploading to server...');
    }

    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents }),
      signal
    });

    if (!response.ok) {
      throw new Error('Failed to sync documents to server');
    }

    if (onProgress) {
      onProgress(100, 'Upload complete!');
    }

    return { lastSync: Date.now() };
  }

  async loadFromServer(onProgress?: (progress: number, status?: string) => void, signal?: AbortSignal): Promise<{ lastSync: number }> {
    if (onProgress) {
      onProgress(10, 'Starting download...');
    }

    const response = await fetch('/api/documents', { signal });
    if (!response.ok) {
      throw new Error('Failed to fetch documents from server');
    }

    if (onProgress) {
      onProgress(30, 'Download complete');
    }

    const { documents } = await response.json();

    if (onProgress) {
      onProgress(40, 'Parsing documents...');
    }

    // Process each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      // Convert the numeric array back to ArrayBuffer
      const uint8Array = new Uint8Array(doc.data);
      const documentData = {
        id: doc.id,
        type: doc.type,
        name: doc.name,
        size: doc.size,
        lastModified: doc.lastModified,
        data: uint8Array.buffer
      };

      if (doc.type === 'pdf') {
        await this.addDocument(documentData);
      } else if (doc.type === 'epub') {
        await this.addEPUBDocument(documentData);
      } else {
        console.warn(`Unknown document type: ${doc.type}`);
      }

      if (onProgress) {
        // Progress from 40% to 90% for document processing
        onProgress(40 + ((i + 1) / documents.length) * 50, `Processing document ${i + 1}/${documents.length}...`);
      }
    }

    if (onProgress) {
      onProgress(100, 'Load complete!');
    }

    return { lastSync: Date.now() };
  }

  async clearPDFDocuments(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Clearing all PDF documents');
        const transaction = this.db!.transaction([PDF_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PDF_STORE_NAME);
        const request = store.clear();

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error clearing PDF documents:', error);
          reject(error);
        };

        transaction.oncomplete = () => {
          console.log('All PDF documents cleared successfully');
          resolve();
        };
      } catch (error) {
        console.error('Error in clearPDFDocuments transaction:', error);
        reject(error);
      }
    });
  }

  async clearEPUBDocuments(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Clearing all EPUB documents');
        const transaction = this.db!.transaction([EPUB_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(EPUB_STORE_NAME);
        const request = store.clear();

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error clearing EPUB documents:', error);
          reject(error);
        };

        transaction.oncomplete = () => {
          console.log('All EPUB documents cleared successfully');
          resolve();
        };
      } catch (error) {
        console.error('Error in clearEPUBDocuments transaction:', error);
        reject(error);
      }
    });
  }

  async saveDocumentListState(state: DocumentListState): Promise<void> {
    return this.setConfigItem('documentListState', JSON.stringify(state));
  }

  async getDocumentListState(): Promise<DocumentListState | null> {
    const stateStr = await this.getConfigItem('documentListState');
    if (!stateStr) return null;
    try {
      return JSON.parse(stateStr);
    } catch (error) {
      console.error('Error parsing document list state:', error);
      return null;
    }
  }
}

// Make sure we export a singleton instance
const indexedDBServiceInstance = new IndexedDBService();
export const indexedDBService = indexedDBServiceInstance;

// Helper functions for the ConfigContext
export async function getItem(key: string): Promise<string | null> {
  return indexedDBService.getConfigItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  return indexedDBService.setConfigItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  return indexedDBService.removeConfigItem(key);
}

// Add these helper functions before the final export
export async function getLastDocumentLocation(docId: string): Promise<string | null> {
  const key = `lastLocation_${docId}`;
  return indexedDBService.getConfigItem(key);
}

export async function setLastDocumentLocation(docId: string, location: string): Promise<void> {
  const key = `lastLocation_${docId}`;
  return indexedDBService.setConfigItem(key, location);
}

export async function getDocumentListState(): Promise<DocumentListState | null> {
  return indexedDBService.getDocumentListState();
}

export async function saveDocumentListState(state: DocumentListState): Promise<void> {
  return indexedDBService.saveDocumentListState(state);
}