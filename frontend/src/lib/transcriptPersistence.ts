import type { AIMessage } from "@/stores/aiPanelStore";

const DB_NAME = "quickeditor.v1";
const STORE_NAME = "agent_transcripts";
const DB_VERSION = 1;
const MAX_TURNS = 50;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "projectId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadTranscript(projectId: string): Promise<AIMessage[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(projectId);
      req.onsuccess = () => {
        const record = req.result as
          | { projectId: string; turns: AIMessage[] }
          | undefined;
        resolve(record?.turns ?? []);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveTranscript(
  projectId: string,
  turns: AIMessage[],
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      // Enforce 50-turn cap on write
      const capped = turns.slice(-MAX_TURNS);
      store.put({ projectId, turns: capped });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable in some sandboxed environments — fail silently
  }
}

export async function clearTranscript(projectId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // silent
  }
}
