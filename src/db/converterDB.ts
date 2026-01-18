import { openDB, DBSchema, IDBPDatabase } from "idb";
import { ConverterTask } from "../types/converter";

const DB_NAME = "FigureXDB";
const DB_VERSION = 3; // 升级版本以支持新表结构
const CONVERTING_STORE = "converting_tasks";
const FINISHED_STORE = "finished_tasks";
const SETTINGS_STORE = "settings";

interface FigureXDB extends DBSchema {
  converting_tasks: {
    key: string;
    value: ConverterTask;
  };
  finished_tasks: {
    key: string;
    value: ConverterTask;
  };
  settings: {
    key: string;
    value: any;
  };
}

class ConverterDB {
  private dbPromise: Promise<IDBPDatabase<FigureXDB>>;

  constructor() {
    this.dbPromise = openDB<FigureXDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 删除旧表（如果存在）
        const oldStoreName = "converter_tasks" as any;
        if (db.objectStoreNames.contains(oldStoreName)) {
          db.deleteObjectStore(oldStoreName);
        }

        // 创建新表
        if (!db.objectStoreNames.contains(CONVERTING_STORE)) {
          db.createObjectStore(CONVERTING_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(FINISHED_STORE)) {
          db.createObjectStore(FINISHED_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }
      },
    });
  }

  async init() {
    return this.dbPromise;
  }

  async addTask(task: ConverterTask) {
    const db = await this.dbPromise;
    const storeName =
      task.status === "finished" ? FINISHED_STORE : CONVERTING_STORE;
    return db.put(storeName, task);
  }

  async addTasks(tasks: ConverterTask[]) {
    const db = await this.dbPromise;
    const convertingTasks = tasks.filter((t) => t.status !== "finished");
    const finishedTasks = tasks.filter((t) => t.status === "finished");

    if (convertingTasks.length > 0) {
      const tx = db.transaction(CONVERTING_STORE, "readwrite");
      const store = tx.objectStore(CONVERTING_STORE);
      await Promise.all(convertingTasks.map((task) => store.put(task)));
      await tx.done;
    }

    if (finishedTasks.length > 0) {
      const tx = db.transaction(FINISHED_STORE, "readwrite");
      const store = tx.objectStore(FINISHED_STORE);
      await Promise.all(finishedTasks.map((task) => store.put(task)));
      await tx.done;
    }
  }

  async getAllTasks() {
    const db = await this.dbPromise;
    const converting = await db.getAll(CONVERTING_STORE);
    const finished = await db.getAll(FINISHED_STORE);
    return [...converting, ...finished];
  }

  async getConvertingTasks() {
    const db = await this.dbPromise;
    return db.getAll(CONVERTING_STORE);
  }

  async getFinishedTasks() {
    const db = await this.dbPromise;
    return db.getAll(FINISHED_STORE);
  }

  async removeTask(id: string) {
    const db = await this.dbPromise;
    // 尝试从两个表中删除
    await Promise.all([
      db.delete(CONVERTING_STORE, id).catch(() => {}),
      db.delete(FINISHED_STORE, id).catch(() => {}),
    ]);
  }

  async removeConvertingTask(id: string) {
    const db = await this.dbPromise;
    return db.delete(CONVERTING_STORE, id);
  }

  async removeFinishedTask(id: string) {
    const db = await this.dbPromise;
    return db.delete(FINISHED_STORE, id);
  }

  async clear() {
    const db = await this.dbPromise;
    await Promise.all([db.clear(CONVERTING_STORE), db.clear(FINISHED_STORE)]);
  }

  async saveSetting(key: string, value: any) {
    const db = await this.dbPromise;
    return db.put(SETTINGS_STORE, value, key);
  }

  async getSetting(key: string) {
    const db = await this.dbPromise;
    return db.get(SETTINGS_STORE, key);
  }
}

export const converterDB = new ConverterDB();
