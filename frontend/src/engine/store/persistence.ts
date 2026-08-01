// Local persistence for the client-side store: an IndexedDB snapshot + file export/import.
// Prices are excluded from the persisted snapshot (they're re-fetchable NAV cache).

import { Store, Snapshot } from "./store";

const DB_NAME = "dhan360";
const STORE = "kv";
const KEY = "snapshot";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function slimSnapshot(store: Store): Snapshot {
  const s = store.toSnapshot();
  return { ...s, prices: [] }; // NAV cache is re-fetchable; don't bloat the snapshot
}

export async function saveSnapshot(store: Store): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(slimSnapshot(store), KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadSnapshot(store: Store): Promise<boolean> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return false;
  }
  const snap = await new Promise<Snapshot | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (snap) {
    store.loadSnapshot(snap);
    return true;
  }
  return false;
}

export async function clearPersisted(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
  });
  db.close();
}

/** Ask the browser to make storage durable (reduces eviction). Best-effort. */
export async function requestPersistent(): Promise<boolean> {
  if (navigator.storage?.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

export function exportToFile(store: Store): void {
  const blob = new Blob([JSON.stringify(store.toSnapshot(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dhan360-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFromFile(store: Store, file: File): Promise<void> {
  const text = await file.text();
  const snap = JSON.parse(text) as Snapshot;
  store.loadSnapshot(snap);
}
