// Simple IndexedDB wrapper for storing transcode tasks

export type TranscodeStatus = "transcoding" | "success" | "error";

export interface TranscodeTaskRecord {
  id?: number;
  inputPath: string;
  outputPath: string;
  outputFormat?: string;
  resolution?: string;
  bitrate?: string;
  framerate?: string;
  createdAt: number;
  updatedAt: number;
  status: TranscodeStatus;
  errorMessage?: string;
}

const DB_NAME = "figurex-transcode";
const DB_VERSION = 1;
const STORE_NAME = "tasks";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        // indexes for querying
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addTranscodeTask(
  record: Omit<TranscodeTaskRecord, "id" | "createdAt" | "updatedAt">
): Promise<number> {
  const db = await openDB();
  const now = Date.now();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const id = await new Promise<number>((resolve, reject) => {
    const req = store.add({ ...record, createdAt: now, updatedAt: now });
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return id;
}

export async function updateTranscodeTask(
  id: number,
  updates: Partial<TranscodeTaskRecord>
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const existing = await new Promise<TranscodeTaskRecord | undefined>(
    (resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as TranscodeTaskRecord | undefined);
      req.onerror = () => reject(req.error);
    }
  );

  if (!existing) {
    // nothing to update
    tx.abort();
    return;
  }

  const updated: TranscodeTaskRecord = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export interface QueryTasksOptions {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface QueryTasksResult {
  items: TranscodeTaskRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export async function queryTranscodeTasks(
  options: QueryTasksOptions = {}
): Promise<QueryTasksResult> {
  const { page = 1, pageSize = 10, keyword } = options;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  const all: TranscodeTaskRecord[] = await new Promise(
    (resolve: (value: TranscodeTaskRecord[]) => void, reject) => {
      const result: TranscodeTaskRecord[] = [];
      const req = store.index("createdAt").openCursor(null, "prev");

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          result.push(cursor.value as TranscodeTaskRecord);
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      req.onerror = () => reject(req.error);
    }
  );

  // fuzzy search in memory (input / output path / error)
  let filtered = all;
  if (keyword && keyword.trim()) {
    const kw = keyword.toLowerCase();
    filtered = all.filter((item) => {
      const text =
        `${item.inputPath} ${item.outputPath} ${item.errorMessage ?? ""}`.toLowerCase();
      return text.includes(kw);
    });
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const items = filtered.slice(start, end);

  return {
    items,
    total,
    page,
    pageSize,
  };
}


