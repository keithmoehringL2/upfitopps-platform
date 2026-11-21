// A small IndexedDB "outbox" for outcomes logged while offline. Each entry
// holds the exact form payload the logOutcome server action expects, so a
// reconnect can replay it unchanged. Every access is guarded and swallows
// errors — if IndexedDB is unavailable the app simply behaves as online-only.

const DB_NAME = "upfit";
const STORE = "outbox";
const VERSION = 1;

export interface OutboxItem {
  id: number;
  companyId: string;
  payload: Record<string, string>;
  ts: number;
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

/** Queue one outcome for later sync. Returns true if it was stored. */
export async function enqueueOutcome(
  companyId: string,
  payload: Record<string, string>,
): Promise<boolean> {
  if (!available()) return false;
  try {
    await tx("readwrite", (s) => s.add({ companyId, payload, ts: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export async function listOutbox(): Promise<OutboxItem[]> {
  if (!available()) return [];
  try {
    const rows = await tx<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);
    return rows ?? [];
  } catch {
    return [];
  }
}

export async function removeOutbox(id: number): Promise<void> {
  if (!available()) return;
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}

/** Company ids with a pending (unsynced) outcome, for optimistic queue state. */
export async function pendingCompanyIds(): Promise<string[]> {
  return (await listOutbox()).map((i) => i.companyId);
}

export async function outboxCount(): Promise<number> {
  return (await listOutbox()).length;
}
