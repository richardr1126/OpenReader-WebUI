const DB_NAME = 'openreader-db';
const DB_VERSION = 2;
const PDF_STORE_NAME = 'pdf-documents';
const CONFIG_STORE_NAME = 'config';

export interface PDFDocument {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  data: Blob;
}

export interface Config {
  key: string;
  value: string;
}

class IndexedDBService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (!window.indexedDB) {
      throw new Error('IndexedDB is not supported in this browser');
    }

    return new Promise((resolve, reject) => {
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

        if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
          console.log('Creating config store...');
          db.createObjectStore(CONFIG_STORE_NAME, { keyPath: 'key' });
        }
      };
    });
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
        const request = store.put(document);

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
        const transaction = this.db!.transaction([PDF_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(PDF_STORE_NAME);
        const request = store.delete(id);

        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error('Error removing document:', error);
          reject(error);
        };

        transaction.oncomplete = () => {
          console.log('Document removed successfully:', id);
          resolve();
        };
      } catch (error) {
        console.error('Error in removeDocument transaction:', error);
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
}

export const indexedDBService = new IndexedDBService();

// Helper functions for the ConfigContext
export async function getItem(key: string): Promise<string | null> {
  return indexedDBService.getConfigItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  return indexedDBService.setConfigItem(key, value);
}