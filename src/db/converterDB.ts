import { openDB, DBSchema, IDBPDatabase } from "idb";
import { ConverterTask } from "../types/converter";

const DB_NAME = "FigureXDB";
const DB_VERSION = 5; // 升级版本：添加 my-files 表
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
  };
}

class ConverterDB {
  private dbPromise: Promise<IDBPDatabase<FigureXDB>>;

  constructor() {
    this.dbPromise = openDB<FigureXDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // 删除旧表（如果存在）
        const oldStoreName = "converter_tasks" as any;
        if (db.objectStoreNames.contains(oldStoreName)) {
          db.deleteObjectStore(oldStoreName);
        }

        // 如果是从版本 3 升级，删除 finished_tasks 表
        // 注意：在 upgrade 事务中不能创建新事务来迁移数据
        // 如果 finished_tasks 中有重要数据，需要在升级前手动迁移
        const finishedStoreName = "finished_tasks" as any;
        if (oldVersion < 4 && db.objectStoreNames.contains(finishedStoreName)) {
          db.deleteObjectStore(finishedStoreName);
        }

        // 创建新表
        if (!db.objectStoreNames.contains(CONVERTING_STORE)) {
          db.createObjectStore(CONVERTING_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }
        // 创建 my-files 表
        if (!db.objectStoreNames.contains(MY_FILES_STORE)) {
          db.createObjectStore(MY_FILES_STORE, { keyPath: "id" });
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
