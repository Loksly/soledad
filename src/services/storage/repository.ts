import { openDB, type IDBPDatabase } from 'idb';
import { appData, emptyAppData, SCHEMA_VERSION, type AppData, type SavedGame } from './schema';

/**
 * La app habla con `Repository`; IndexedDB vive detrás (docs/07 §2). En los tests se inyecta
 * `InMemoryRepository` y no hace falta ni un navegador.
 */
export interface Repository {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  saveGame(game: SavedGame): Promise<void>;
  deleteGame(id: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'soledad';
const STORE = 'app';
const KEY = 'data';

export class IndexedDbRepository implements Repository {
  private db: Promise<IDBPDatabase> | null = null;

  private open(): Promise<IDBPDatabase> {
    this.db ??= openDB(DB_NAME, SCHEMA_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    });
    return this.db;
  }

  async load(): Promise<AppData> {
    const db = await this.open();
    const raw: unknown = await db.get(STORE, KEY);
    if (raw === undefined) return emptyAppData();

    // Ni siquiera de nuestro propio almacén nos fiamos: un dato corrupto en disco no puede
    // impedir que la app arranque. Se prefiere empezar de cero a no arrancar.
    const parsed = appData.safeParse(raw);
    return parsed.success ? parsed.data : emptyAppData();
  }

  /** Una transacción por operación: si la app muere a mitad, está el estado viejo o el nuevo. */
  async save(data: AppData): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE, 'readwrite');
    await tx.store.put(data, KEY);
    await tx.done;
  }

  async saveGame(game: SavedGame): Promise<void> {
    const data = await this.load();
    const savedGames = [game, ...data.savedGames.filter((saved) => saved.id !== game.id)].slice(0, 20);
    await this.save({ ...data, savedGames });
  }

  async deleteGame(id: string): Promise<void> {
    const data = await this.load();
    await this.save({ ...data, savedGames: data.savedGames.filter((saved) => saved.id !== id) });
  }

  async clear(): Promise<void> {
    const db = await this.open();
    await db.clear(STORE);
  }
}

export class InMemoryRepository implements Repository {
  private data: AppData = emptyAppData();

  load(): Promise<AppData> {
    return Promise.resolve(structuredClone(this.data));
  }

  save(data: AppData): Promise<void> {
    this.data = structuredClone(data);
    return Promise.resolve();
  }

  async saveGame(game: SavedGame): Promise<void> {
    const data = await this.load();
    await this.save({
      ...data,
      savedGames: [game, ...data.savedGames.filter((saved) => saved.id !== game.id)].slice(0, 20),
    });
  }

  async deleteGame(id: string): Promise<void> {
    const data = await this.load();
    await this.save({ ...data, savedGames: data.savedGames.filter((saved) => saved.id !== id) });
  }

  async clear(): Promise<void> {
    this.data = emptyAppData();
    return Promise.resolve();
  }
}
