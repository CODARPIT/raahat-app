// Offline outbox for the report page (browser only). In a flood the signal comes and
// goes: a report filed with no connection is saved on the phone (IndexedDB) and sent
// automatically when the connection returns, even if the page was closed and reopened.
// If IndexedDB is unavailable (private mode), items are kept in memory for this visit.

export interface OutboxMeta {
  lat: number | null;
  lng: number | null;
  locationSource?: "gps" | "map_pin";
  place: string;
  note: string;
  lang: "en" | "hi";
}

export interface OutboxItem {
  id: string;
  createdAt: number;
  /** The downscaled photo, if it never reached Cloudinary. */
  blob: Blob | null;
  /** Set once the photo is uploaded, so a retry doesn't upload it twice. */
  upload: { publicId: string; resourceType: "image" | "video" } | null;
  meta: OutboxMeta;
}

const DB = "raahat";
const STORE = "outbox";
const memory = new Map<string, OutboxItem>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close()) as Promise<T>;
}

export async function putItem(item: OutboxItem): Promise<void> {
  memory.set(item.id, item);
  try {
    await tx("readwrite", (s) => s.put(item));
  } catch {
    // keep the in-memory copy
  }
}

export async function listItems(): Promise<OutboxItem[]> {
  try {
    const stored = await tx<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);
    for (const i of stored) memory.set(i.id, i);
  } catch {
    // fall through to memory
  }
  return [...memory.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeItem(id: string): Promise<void> {
  memory.delete(id);
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    // already gone from memory
  }
}

/** fetch throws a TypeError when there is no connection at all (as opposed to an HTTP error). */
export class OfflineError extends Error {}

export async function online<T>(run: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new OfflineError("offline");
  try {
    return await run();
  } catch (err) {
    if (err instanceof TypeError) throw new OfflineError(err.message);
    throw err;
  }
}
