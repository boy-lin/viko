import { openDB, DBSchema, IDBPDatabase } from "idb";
import { ConverterTask } from "../types/converter";

const DB_NAME = "FigureXDB";
const DB_VERSION = 6; // 升级版本：添加索引
const CONVERTING_STORE = "converting_tasks";
const SETTINGS_STORE = "settings";
const MY_FILES_STORE = "my-files";

interface FigureXDB extends DBSchema {
  converting_tasks: {
    key: string;
    value: ConverterTask;
  };
  settings: {
    key: string;
    value: any;
  };
  "my-files": {
    key: string;
    value: ConverterTask & {
      createdAt: number;
      taskType: "convert" | "compress";
      isFavorite?: boolean;
    };
    indexes: { "createdAt": number };
  };
}

class ConverterDB {
  private dbPromise: Promise<IDBPDatabase<FigureXDB>>;

  constructor() {
    this.dbPromise = openDB<FigureXDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _, transaction) {
        // 删除旧表（如果存在）
        const oldStoreName = "converter_tasks" as any;
        if (db.objectStoreNames.contains(oldStoreName)) {
          db.deleteObjectStore(oldStoreName);
        }

        const finishedStoreName = "finished_tasks" as any;
        if (oldVersion < 4 && db.objectStoreNames.contains(finishedStoreName)) {
          db.deleteObjectStore(finishedStoreName);
        }

        // 创建 converting_tasks 表
        if (!db.objectStoreNames.contains(CONVERTING_STORE)) {
          db.createObjectStore(CONVERTING_STORE, { keyPath: "id" });
        }

        // 创建 settings 表
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }

        // 创建/更新 my-files 表
        let myFilesStore;
        if (!db.objectStoreNames.contains(MY_FILES_STORE)) {
          myFilesStore = db.createObjectStore(MY_FILES_STORE, { keyPath: "id" });
        } else {
          myFilesStore = transaction.objectStore(MY_FILES_STORE);
        }

        // 确保 createdAt 索引存在
        if (!myFilesStore.indexNames.contains("createdAt")) {
          myFilesStore.createIndex("createdAt", "createdAt");
        }
      },
    });
  }

  async init() {
    return this.dbPromise;
  }

  async addTask(task: ConverterTask) {
    const db = await this.dbPromise;
    return db.put(CONVERTING_STORE, task);
  }

  async addTasks(tasks: ConverterTask[]) {
    const db = await this.dbPromise;
    const tx = db.transaction(CONVERTING_STORE, "readwrite");
    const store = tx.objectStore(CONVERTING_STORE);
    await Promise.all(tasks.map((task) => store.put(task)));
    await tx.done;
  }

  async getAllTasks() {
    const db = await this.dbPromise;
    return db.getAll(CONVERTING_STORE);
  }

  async removeTask(id: string) {
    const db = await this.dbPromise;
    return db.delete(CONVERTING_STORE, id);
  }

  async clear() {
    const db = await this.dbPromise;
    return db.clear(CONVERTING_STORE);
  }

  async saveSetting(key: string, value: any) {
    const db = await this.dbPromise;
    return db.put(SETTINGS_STORE, value, key);
  }

  async getSetting(key: string) {
    const db = await this.dbPromise;
    return db.get(SETTINGS_STORE, key);
  }

  // My Files 表操作
  async addToMyFiles(task: ConverterTask & { createdAt?: number; taskType?: "convert" | "compress"; isFavorite?: boolean }) {
    const db = await this.dbPromise;
    const fileRecord = {
      ...task,
      createdAt: task.createdAt || Date.now(),
      taskType: task.taskType || "convert",
      isFavorite: task.isFavorite || false,
    };
    return db.put(MY_FILES_STORE, fileRecord);
  }

  async getAllMyFiles() {
    const db = await this.dbPromise;
    return db.getAll(MY_FILES_STORE);
  }

  /**
   * 分页获取 My Files 数据
   * @param page 页码 (1-based)
   * @param pageSize 每页数量
   * @param sortDesc 是否按创建时间倒序
   */
  async getMyFilesPaged(page: number = 1, pageSize: number = 20, sortDesc: boolean = true) {
    const db = await this.dbPromise;
    const tx = db.transaction(MY_FILES_STORE, 'readonly');
    const store = tx.objectStore(MY_FILES_STORE);
    const index = store.index('createdAt');

    // 游标方向：倒序(prev) 或 正序(next)
    const direction = sortDesc ? 'prev' : 'next';

    let cursor = await index.openCursor(null, direction);

    const skip = (page - 1) * pageSize;
    if (skip > 0 && cursor) {
      await cursor.advance(skip);
    }

    const items = [];
    while (cursor && items.length < pageSize) {
      items.push(cursor.value);
      cursor = await cursor.continue();
    }

    // 获取总数
    const total = await store.count();

    return {
      items,
      total,
      hasMore: items.length === pageSize && (skip + pageSize < total)
    };
  }

  async removeFromMyFiles(id: string) {
    const db = await this.dbPromise;
    return db.delete(MY_FILES_STORE, id);
  }

  async clearMyFiles() {
    const db = await this.dbPromise;
    return db.clear(MY_FILES_STORE);
  }
}

export const converterDB = new ConverterDB();
