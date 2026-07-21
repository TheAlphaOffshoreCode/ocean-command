export type CachedCommandCenter = { user: unknown; features: unknown[]; activities: unknown[]; savedAt: string };
export type OfflineMutation = { id: string; endpoint: string; method: "PATCH"; body: Record<string, unknown>; createdAt: string; state: "PENDING" | "CONFLICT"; error?: string };

const databaseName = "ocean-command-offline";
const snapshotStore = "snapshots";
const mutationStore = "mutations";
const snapshotKey = "command-center";

function available() { return typeof window !== "undefined" && "indexedDB" in window; }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(snapshotStore)) database.createObjectStore(snapshotStore);
      if (!database.objectStoreNames.contains(mutationStore)) database.createObjectStore(mutationStore, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(store: string, mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const request = action(database.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function saveCommandCenterSnapshot(snapshot: CachedCommandCenter) { if (available()) await transaction(snapshotStore, "readwrite", (store) => store.put(snapshot, snapshotKey)); }
export async function loadCommandCenterSnapshot(): Promise<CachedCommandCenter | null> { return available() ? (await transaction(snapshotStore, "readonly", (store) => store.get(snapshotKey))) ?? null : null; }
export async function enqueueMutation(mutation: Omit<OfflineMutation, "id" | "createdAt" | "state">) { const entry: OfflineMutation = { ...mutation, id: crypto.randomUUID(), createdAt: new Date().toISOString(), state: "PENDING" }; if (available()) await transaction(mutationStore, "readwrite", (store) => store.put(entry)); return entry; }
export async function listMutations(): Promise<OfflineMutation[]> { return available() ? (await transaction(mutationStore, "readonly", (store) => store.getAll())).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []; }
export async function removeMutation(id: string) { if (available()) await transaction(mutationStore, "readwrite", (store) => store.delete(id)); }
export async function markConflict(mutation: OfflineMutation, error: string) { if (available()) await transaction(mutationStore, "readwrite", (store) => store.put({ ...mutation, state: "CONFLICT", error })); }

export async function flushOfflineMutations() {
  const pending = (await listMutations()).filter((mutation) => mutation.state === "PENDING");
  for (const mutation of pending) {
    try {
      const response = await fetch(mutation.endpoint, { method: mutation.method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mutation.body) });
      if (response.ok) await removeMutation(mutation.id);
      else if (response.status === 409 || response.status === 412) await markConflict(mutation, "Server data changed before this offline update could be applied.");
    } catch { break; }
  }
  return listMutations();
}
