import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ConverterTask } from '../types/converter';

interface FigureXDB extends DBSchema {
  converter_tasks: {
    key: string;
    value: ConverterTask;
  };
}

const DB_NAME = 'FigureXDB';
const DB_VERSION = 2;
const STORE_NAME = 'converter_tasks';
const SETTINGS_STORE = 'settings';

interface FigureXDB extends DBSchema {
  converter_tasks: {
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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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
    return db.put(STORE_NAME, task);
  }

  async addTasks(tasks: ConverterTask[]) {
    const db = await this.dbPromise;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await Promise.all(tasks.map(task => store.put(task)));
    return tx.done;
  }

  async getAllTasks() {
    const db = await this.dbPromise;
    return db.getAll(STORE_NAME);
  }

  async removeTask(id: string) {
    const db = await this.dbPromise;
    return db.delete(STORE_NAME, id);
  }

  async clear() {
    const db = await this.dbPromise;
    return db.clear(STORE_NAME);
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
