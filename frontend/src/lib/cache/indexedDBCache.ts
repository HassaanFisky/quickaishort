const DB_NAME = "quickai-shorts-cache";
const DB_VERSION = 1;

interface CacheEntry {
  key: string;
  data: ArrayBuffer;
  size: number;
  createdAt: number;
  lastAccessedAt: number;
}

class IndexedDBCache {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains("models")) {
          const store = db.createObjectStore("models", { keyPath: "key" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }

        if (!db.objectStoreNames.contains("assets")) {
          const store = db.createObjectStore("assets", { keyPath: "key" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
    });
  }

  async get(storeName: string, key: string): Promise<ArrayBuffer | null> {
    if (!this.db) await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (entry) {
          // Update last accessed time
          entry.lastAccessedAt = Date.now();
          store.put(entry);
          resolve(entry.data);
        } else {
          resolve(null);
        }
      };
    });
  }

  async set(storeName: string, key: string, data: ArrayBuffer): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);

      const entry: CacheEntry = {
        key,
        data,
        size: data.byteLength,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(storeName: string): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getStorageUsage(): Promise<{
    models: number;
    assets: number;
    total: number;
  }> {
    if (!this.db) await this.init();
    if (!this.db) return { models: 0, assets: 0, total: 0 };

    const getStoreSize = (storeName: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entries = request.result as CacheEntry[];
          const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
          resolve(totalSize);
        };
      });
    };

    const modelsSize = await getStoreSize("models");
    const assetsSize = await getStoreSize("assets");

    return {
      models: modelsSize,
      assets: assetsSize,
      total: modelsSize + assetsSize,
    };
  }
}

export const cache = new IndexedDBCache();
